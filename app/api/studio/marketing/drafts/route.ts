import { cookies } from 'next/headers'
import { NextRequest } from 'next/server'
import { requireAllowedUser } from '@/lib/auth-server'
import { apiError, apiOk } from '@/lib/api-response'

export async function GET() {
  const cookieStore = await cookies()
  const { user, supabase, response } = await requireAllowedUser(cookieStore)
  if (response) return response

  const [{ data: drafts, error: draftsError }, { data: ventures, error: venturesError }] =
    await Promise.all([
      supabase
        .from('campaign_drafts')
        .select(
          'id, venture_id, channel, content, status, metadata, published_at, provider_run_id, last_error, created_at, updated_at'
        )
        .eq('user_id', user!.id)
        .order('created_at', { ascending: false })
        .limit(200),
      supabase
        .from('ventures')
        .select('id, name, nom, slug, stage, statut, score, lifecycle_status, created_at')
        .eq('user_id', user!.id)
        .order('created_at', { ascending: false })
        .limit(100),
    ])

  if (draftsError) return apiError(draftsError.message, 500)
  if (venturesError) return apiError(venturesError.message, 500)
  return apiOk({ drafts: drafts ?? [], ventures: ventures ?? [] })
}

export async function PATCH(req: NextRequest) {
  const cookieStore = await cookies()
  const { user, supabase, response } = await requireAllowedUser(cookieStore)
  if (response) return response

  let body: {
    draftId?: string
    channel?: string
    content?: string
    metadata?: Record<string, unknown>
  }
  try {
    body = await req.json()
  } catch {
    return apiError('JSON invalide', 400)
  }

  if (!body.draftId || !body.channel || !body.content) {
    return apiError('draftId, channel et content requis', 400)
  }

  const { data, error } = await supabase
    .from('campaign_drafts')
    .update({
      channel: body.channel,
      content: body.content,
      metadata: body.metadata ?? {},
      updated_at: new Date().toISOString(),
    })
    .eq('id', body.draftId)
    .eq('user_id', user!.id)
    .select(
      'id, venture_id, channel, content, status, metadata, published_at, provider_run_id, last_error, created_at, updated_at'
    )
    .single()

  if (error) return apiError(error.message, 500)
  return apiOk({ draft: data })
}
