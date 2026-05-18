import { timingSafeEqual } from 'crypto'
import { NextRequest } from 'next/server'
import { cookies } from 'next/headers'
import { requireAllowedUser } from '@/lib/auth-server'
import { apiError, apiOk } from '@/lib/api-response'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { insertAuditEvent } from '@/lib/audit-log'

const USER_TABLES = [
  'venture_pipeline',
  'agent_runs',
  'agent_configs',
  'agent_events',
  'agent_schedules',
  'automation_runs',
  'automation_workflows',
  'messages',
  'conversations',
  'documents',
  'ventures',
  'api_keys',
  'agents',
  'automations',
] as const

export async function POST() {
  const cookieStore = await cookies()
  const { user, supabase, response } = await requireAllowedUser(cookieStore)
  if (response) return response

  const token = crypto.randomUUID()

  const { error } = await supabase
    .from('user_settings')
    .update({
      deletion_token: token,
      deletion_requested_at: new Date().toISOString(),
    })
    .eq('user_id', user!.id)

  if (error) return apiError('Impossible de créer le token de suppression', 500)

  return apiOk({
    token,
    message:
      'Renvoyez ce token dans DELETE /api/studio/privacy/delete pour confirmer la suppression.',
  })
}

export async function DELETE(req: NextRequest) {
  const cookieStore = await cookies()
  const { user, supabase, response } = await requireAllowedUser(cookieStore)
  if (response) return response

  let token: string
  try {
    const body = await req.json()
    token = body.token ?? ''
  } catch {
    return apiError('JSON invalide', 400)
  }
  if (!token) return apiError('token requis', 400)

  const { data: settings } = await supabase
    .from('user_settings')
    .select('deletion_token, deletion_requested_at')
    .eq('user_id', user!.id)
    .maybeSingle()

  function safeTokenEqual(a: string, b: string): boolean {
    if (a.length !== b.length) return false
    return timingSafeEqual(Buffer.from(a), Buffer.from(b))
  }

  if (!settings?.deletion_token || !safeTokenEqual(settings.deletion_token, token)) {
    return apiError('Token invalide ou expiré', 400)
  }

  const requestedAt = settings.deletion_requested_at
    ? new Date(settings.deletion_requested_at)
    : null
  const expiredMs = 15 * 60 * 1000
  if (!requestedAt || Date.now() - requestedAt.getTime() > expiredMs) {
    await supabaseAdmin
      .from('user_settings')
      .update({ deletion_token: null, deletion_requested_at: null })
      .eq('user_id', user!.id)
    return apiError('Token expiré (15 min). Recommencez avec POST.', 400)
  }

  await insertAuditEvent(supabase, {
    user_id: user!.id,
    event_type: 'privacy.delete.confirmed',
    severity: 'warn',
    metadata: {
      requested_at: settings.deletion_requested_at,
    },
  })

  const tableErrors: { table: string; message: string }[] = []
  for (const table of USER_TABLES) {
    const { error } = await supabaseAdmin.from(table).delete().eq('user_id', user!.id)
    if (error) tableErrors.push({ table, message: error.message })
  }
  if (tableErrors.length > 0) {
    return apiError(
      `Erreur lors de la suppression des données (tables: ${tableErrors.map((failure) => failure.table).join(', ')})`,
      500
    )
  }

  await supabaseAdmin.from('user_settings').delete().eq('user_id', user!.id)

  const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(user!.id)
  if (deleteError) return apiError('Erreur lors de la suppression du compte', 500)

  return apiOk({ ok: true })
}
