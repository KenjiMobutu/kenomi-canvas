import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createFacelessVideoProvider,
  getFacelessVideoProviderStatus,
} from './faceless-video-provider'

afterEach(() => vi.restoreAllMocks())

describe('faceless video provider', () => {
  it('retourne mock contrôlé sans webhook vidéo', () => {
    expect(getFacelessVideoProviderStatus({})).toMatchObject({
      mode: 'mock',
      canGenerate: true,
      requiresApproval: false,
    })
  })

  it('appelle n8n vidéo quand configuré', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        videoId: 'vid-1',
        previewUrl: 'https://cdn.example/video.mp4',
      }),
    } as unknown as Response)

    const provider = createFacelessVideoProvider({
      VIDEO_PROVIDER: 'n8n',
      N8N_VIDEO_WEBHOOK_URL: 'https://n8n.example.com/webhook/video',
    })
    const result = await provider.generate({
      ventureId: 'venture-1',
      draftId: 'draft-1',
      title: 'Demo',
      hook: 'Stop wasting time',
      voiceover: 'Build faster',
      scenes: ['Scene 1'],
      captions: ['Caption 1'],
      visualPrompt: 'B-roll SaaS dashboard',
    })

    expect(result).toMatchObject({
      provider: 'n8n',
      videoId: 'vid-1',
      previewUrl: 'https://cdn.example/video.mp4',
    })
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })
})
