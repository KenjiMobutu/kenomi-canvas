import { cookies } from 'next/headers'
import { NextRequest } from 'next/server'
import { requireAllowedUser } from '@/lib/auth-server'
import { apiError, apiOk } from '@/lib/api-response'
import { createFacelessVideoProvider } from '@/lib/marketing/faceless-video-provider'

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
}

function asString(value: unknown, fallback = '') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

export async function POST(req: NextRequest) {
  const cookieStore = await cookies()
  const { user, supabase, response } = await requireAllowedUser(cookieStore)
  if (response) return response

  let body: { draftId?: string }
  try {
    body = await req.json()
  } catch {
    return apiError('JSON invalide', 400)
  }

  if (!body.draftId) return apiError('draftId requis', 400)

  const { data: draft, error } = await supabase
    .from('campaign_drafts')
    .select('id, user_id, venture_id, content, metadata')
    .eq('id', body.draftId)
    .eq('user_id', user!.id)
    .maybeSingle()

  if (error) return apiError(error.message, 500)
  if (!draft?.venture_id) return apiError('draft vidéo introuvable ou sans venture', 404)

  const metadata = asObject(draft.metadata)
  const video = asObject(metadata.video)
  const provider = createFacelessVideoProvider()
  try {
    const result = await provider.generate({
      ventureId: draft.venture_id,
      draftId: draft.id,
      title: asString(metadata.title, draft.content.slice(0, 80)),
      hook: asString(video.hook, asString(metadata.title, draft.content.slice(0, 80))),
      voiceover: asString(video.voiceover, draft.content),
      scenes: asStringArray(video.scenes),
      captions: asStringArray(video.captions),
      visualPrompt: asString(video.visual_prompt, draft.content),
    })

    const nextMetadata = {
      ...metadata,
      video_provider: result.provider,
      video_status: result.status,
      video_id: result.videoId,
      video_preview_url: result.previewUrl ?? null,
    }

    const { error: updateError } = await supabase
      .from('campaign_drafts')
      .update({
        metadata: nextMetadata,
        updated_at: new Date().toISOString(),
      })
      .eq('id', draft.id)
      .eq('user_id', user!.id)

    if (updateError) return apiError(updateError.message, 500)
    return apiOk({ ok: true, video: result, metadata: nextMetadata })
  } catch (providerError) {
    return apiError(
      providerError instanceof Error ? providerError.message : 'Provider vidéo indisponible',
      500
    )
  }
}
