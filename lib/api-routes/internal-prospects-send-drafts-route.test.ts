import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { mockedSendProspectDrafts, mockedSupabaseAdmin } = vi.hoisted(() => ({
  mockedSendProspectDrafts: vi.fn(),
  mockedSupabaseAdmin: { from: vi.fn() },
}))

vi.mock('@/lib/prospect/send-drafts', () => ({
  sendProspectDrafts: mockedSendProspectDrafts,
}))

vi.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: mockedSupabaseAdmin,
}))

import { POST } from '@/app/api/internal/prospects/send-drafts/route'

describe('internal prospects send drafts route', () => {
  beforeEach(() => {
    vi.stubEnv('AUTONOMY_WORKER_SECRET', 'worker-secret')
    mockedSendProspectDrafts.mockResolvedValue({
      processed: 1,
      sent: 1,
      failed: 0,
      results: [
        {
          ok: true,
          prospectId: 'prospect-1',
          draftId: 'draft-1',
          provider: 'smtp',
          messageId: '<smtp-1@kenomi.eu>',
        },
      ],
    })
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    mockedSendProspectDrafts.mockReset()
  })

  it('rejects unauthorized calls', async () => {
    const res = await POST(
      new Request('http://localhost/api/internal/prospects/send-drafts', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ user_id: 'user-1', prospect_ids: ['prospect-1'] }),
      }) as never
    )

    expect(res.status).toBe(401)
  })

  it('sends drafts for the requested prospects', async () => {
    const res = await POST(
      new Request('http://localhost/api/internal/prospects/send-drafts', {
        method: 'POST',
        headers: {
          'x-autonomy-worker-token': 'worker-secret',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ user_id: 'user-1', prospect_ids: ['prospect-1'] }),
      }) as never
    )

    expect(res.status).toBe(200)
    expect(mockedSendProspectDrafts).toHaveBeenCalledWith(
      expect.objectContaining({
        supabase: mockedSupabaseAdmin,
        userId: 'user-1',
        prospectIds: ['prospect-1'],
      })
    )
  })
})
