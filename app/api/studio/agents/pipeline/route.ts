import { NextRequest } from 'next/server'
import { cookies } from 'next/headers'
import { requireAllowedUser } from '@/lib/auth-server'
import { apiError, apiOk } from '@/lib/api-response'
import { isRateLimited } from '@/lib/rate-limit'
import { buildVentureInsertFromPipeline, findAvailableSlug } from '@/lib/venture-materializer'

export async function GET() {
  const cookieStore = await cookies()
  const { user, supabase, response } = await requireAllowedUser(cookieStore)
  if (response) return response

  const { data, error } = await supabase
    .from('venture_pipeline')
    .select('*')
    .eq('user_id', user!.id)
    .not('status', 'eq', 'rejected')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) return apiError(error.message, 500)
  return apiOk({ pipeline: data })
}

export async function POST(req: NextRequest) {
  const cookieStore = await cookies()
  const { user, supabase, response } = await requireAllowedUser(cookieStore)
  if (response) return response

  if (isRateLimited(`pipeline-action:${user!.id}`, { limit: 20, windowMs: 60_000 })) {
    return apiError('Trop de requêtes', 429)
  }

  let action: string, pipelineId: string
  try {
    const body = await req.json()
    action = body.action ?? ''
    pipelineId = body.pipelineId ?? ''
  } catch {
    return apiError('JSON invalide', 400)
  }
  if (!pipelineId) return apiError('pipelineId requis', 400)
  if (!['approve', 'reject'].includes(action)) return apiError('action invalide', 400)

  const { data: existing } = await supabase
    .from('venture_pipeline')
    .select('id, status, idea_title, idea_niche, user_id')
    .eq('id', pipelineId)
    .eq('user_id', user!.id)
    .maybeSingle()

  if (!existing) return apiError('Pipeline introuvable', 404)
  if (existing.status !== 'pending_validation') return apiError('Pipeline déjà traité', 409)

  if (action === 'reject') {
    await supabase
      .from('venture_pipeline')
      .update({ status: 'rejected', updated_at: new Date().toISOString() })
      .eq('id', pipelineId)
    return apiOk({ ok: true, action: 'rejected' })
  }

  // approve → créer la venture en DB puis passer status à 'approved'
  const slug = await findAvailableSlug(async (candidate) => {
    const { data } = await supabase
      .from('ventures')
      .select('id')
      .eq('slug', candidate)
      .maybeSingle()
    return !!data
  }, existing.idea_title)

  const { data: venture, error: ventureErr } = await supabase
    .from('ventures')
    .insert(
      buildVentureInsertFromPipeline({
        userId: user!.id,
        ideaTitle: existing.idea_title,
        ideaNiche: existing.idea_niche,
        slug,
      })
    )
    .select('id')
    .single()

  if (ventureErr) return apiError(ventureErr.message, 500)

  await supabase
    .from('venture_pipeline')
    .update({
      status: 'approved',
      venture_id: venture.id,
      updated_at: new Date().toISOString(),
    })
    .eq('id', pipelineId)

  return apiOk({ ok: true, action: 'approved', ventureId: venture.id })
}
