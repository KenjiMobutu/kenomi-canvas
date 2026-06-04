import { afterEach, describe, expect, it, vi } from 'vitest'
import { POST } from '@/app/api/operator/telegram/command/route'

describe('operator telegram command route', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('returns 401 without bot secret', async () => {
    const res = await POST(
      new Request('http://localhost/api/operator/telegram/command', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ chat_id: '1', text: '/brief' }),
      }) as never
    )

    expect(res.status).toBe(401)
  })

  it('returns a scaffolded payload with a valid bot secret', async () => {
    vi.stubEnv('TELEGRAM_OPERATOR_SHARED_SECRET', 'telegram-shared-secret')

    const res = await POST(
      new Request('http://localhost/api/operator/telegram/command', {
        method: 'POST',
        headers: {
          authorization: 'Bearer telegram-shared-secret',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ chat_id: '1', text: '/brief' }),
      }) as never
    )

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({
      ok: true,
      summary: 'Route scaffolded',
      intent: 'read_brief',
      executed: false,
    })
  })
})
