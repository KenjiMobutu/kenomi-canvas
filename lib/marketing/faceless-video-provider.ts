import { isAllowedWebhookUrl } from '@/lib/security'

export type FacelessVideoProviderMode = 'mock' | 'n8n'

export interface FacelessVideoProviderStatus {
  mode: FacelessVideoProviderMode
  label: string
  canGenerate: boolean
  requiresApproval: boolean
  reason: string
}

export interface FacelessVideoInput {
  ventureId: string
  draftId: string
  title: string
  hook: string
  voiceover: string
  scenes: string[]
  captions: string[]
  visualPrompt: string
}

export interface FacelessVideoResult {
  provider: FacelessVideoProviderMode
  videoId: string
  previewUrl?: string
  status: 'generated' | 'queued'
  metadata: Record<string, unknown>
}

export interface FacelessVideoProvider {
  generate(input: FacelessVideoInput): Promise<FacelessVideoResult>
}

export function getFacelessVideoProviderStatus(
  env: Record<string, string | undefined> = process.env as Record<string, string | undefined>
): FacelessVideoProviderStatus {
  const webhookUrl = env.N8N_VIDEO_WEBHOOK_URL
  const wantsN8n = env.VIDEO_PROVIDER === 'n8n'
  const n8nReady = Boolean(
    wantsN8n && webhookUrl && isAllowedWebhookUrl(webhookUrl, env as NodeJS.ProcessEnv)
  )

  if (n8nReady) {
    return {
      mode: 'n8n',
      label: 'n8n vidéo live',
      canGenerate: true,
      requiresApproval: true,
      reason: 'Les briefs faceless sont envoyés à N8N_VIDEO_WEBHOOK_URL.',
    }
  }

  return {
    mode: 'mock',
    label: 'Mock vidéo contrôlé',
    canGenerate: true,
    requiresApproval: false,
    reason: wantsN8n
      ? 'VIDEO_PROVIDER=n8n mais webhook vidéo manquant ou non autorisé.'
      : 'Aucun provider vidéo live configuré. Le Studio génère un asset mock traçable.',
  }
}

export function createFacelessVideoProvider(
  env: Record<string, string | undefined> = process.env as Record<string, string | undefined>
): FacelessVideoProvider {
  const status = getFacelessVideoProviderStatus(env)

  if (status.mode === 'n8n') {
    const webhookUrl = env.N8N_VIDEO_WEBHOOK_URL!
    const token = env.N8N_VIDEO_TOKEN
    return {
      async generate(input) {
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        }
        if (token) headers['X-Kenomi-Token'] = token

        const response = await fetch(webhookUrl, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            venture_id: input.ventureId,
            draft_id: input.draftId,
            title: input.title,
            hook: input.hook,
            voiceover: input.voiceover,
            scenes: input.scenes,
            captions: input.captions,
            visual_prompt: input.visualPrompt,
          }),
        })

        if (!response.ok) {
          const body = await response.text()
          throw new Error(`n8n video ${response.status}: ${body.slice(0, 200)}`)
        }

        const data = (await response.json()) as {
          videoId?: string
          executionId?: string
          previewUrl?: string
          url?: string
        }

        return {
          provider: 'n8n',
          videoId: data.videoId ?? data.executionId ?? `n8n-video-${Date.now()}`,
          previewUrl: data.previewUrl ?? data.url,
          status: 'queued',
          metadata: { adapter: 'n8n' },
        }
      },
    }
  }

  return {
    async generate(input) {
      return {
        provider: 'mock',
        videoId: `mock-video-${Date.now()}-${input.draftId}`,
        previewUrl: `https://mock.local/video/${input.ventureId}/${input.draftId}`,
        status: 'generated',
        metadata: {
          adapter: 'mock',
          title: input.title,
          hook: input.hook,
          scenes: input.scenes.length,
        },
      }
    },
  }
}
