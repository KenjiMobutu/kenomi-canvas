import { describe, expect, it, vi } from 'vitest'
import { notifyNurtureSignup } from './n8n'

describe('notifyNurtureSignup', () => {
  it('posts a signup to n8n when configured', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => '{"ok":true}',
    } as Response)

    const result = await notifyNurtureSignup({
      env: {
        NURTURE_WEBHOOK_URL: 'https://n8n.kenomi.eu/webhook/nurture',
        NURTURE_WEBHOOK_TOKEN: 'secret',
      },
      payload: {
        slug: 'offer-a',
        ventureId: 'venture-1',
        email: 'lead@example.com',
        source: 'waitlist',
      },
    })

    expect(result.ok).toBe(true)
    expect(fetchSpy).toHaveBeenCalledOnce()
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://n8n.kenomi.eu/webhook/nurture',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ authorization: 'Bearer secret' }),
      })
    )
  })
})
