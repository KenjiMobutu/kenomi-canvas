import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { mockedRunInboxSync, mockedSupabaseAdmin } = vi.hoisted(() => ({
  mockedRunInboxSync: vi.fn(),
  mockedSupabaseAdmin: { from: vi.fn() },
}))

vi.mock('@/lib/prospect/inbox-sync-runner', () => ({
  runInboxSync: mockedRunInboxSync,
}))

vi.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: mockedSupabaseAdmin,
}))

import { POST } from '@/app/api/internal/prospects/inbox-sync/route'

describe('internal prospects inbox sync route', () => {
  beforeEach(() => {
    vi.stubEnv('AUTONOMY_WORKER_SECRET', 'worker-secret')
    mockedRunInboxSync.mockResolvedValue({
      processed: 3,
      bounced: 1,
      autoAcknowledged: 1,
      replied: 1,
      ignored: 0,
    })
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    mockedRunInboxSync.mockReset()
  })

  it('rejects unauthorized calls', async () => {
    const res = await POST(
      new Request('http://localhost/api/internal/prospects/inbox-sync', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ user_id: 'user-1' }),
      }) as never
    )

    expect(res.status).toBe(401)
  })

  it('runs inbox sync for the requested user', async () => {
    const res = await POST(
      new Request('http://localhost/api/internal/prospects/inbox-sync', {
        method: 'POST',
        headers: {
          'x-autonomy-worker-token': 'worker-secret',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ user_id: 'user-1', limit: 5 }),
      }) as never
    )

    expect(res.status).toBe(200)
    expect(mockedRunInboxSync).toHaveBeenCalledWith(
      expect.objectContaining({
        supabase: mockedSupabaseAdmin,
        userId: 'user-1',
        limit: 5,
      })
    )
  })
})
