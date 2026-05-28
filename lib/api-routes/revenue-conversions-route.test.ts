import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockedCookies, mockedRequireAllowedUser } = vi.hoisted(() => ({
  mockedCookies: vi.fn(),
  mockedRequireAllowedUser: vi.fn(),
}))

vi.mock('next/headers', () => ({
  cookies: mockedCookies,
}))

vi.mock('@/lib/auth-server', () => ({
  requireAllowedUser: mockedRequireAllowedUser,
}))

import { GET } from '@/app/api/studio/revenue/conversions/route'

function makeSupabase() {
  const tables: Record<string, unknown> = {
    offers: [{ id: 'offer-a', name: 'Outbound Sprint' }],
    prospects: [
      {
        id: 'p1',
        offer_id: 'offer-a',
        outreach_angle: 'speed',
        metadata: { model: 'hermes3:8b', model_family: 'hermes' },
        source: 'linkedin',
        band: 'warm',
        pipeline_status: 'won',
        created_at: '2026-05-20T10:00:00.000Z',
      },
    ],
    prospect_activities: [
      { prospect_id: 'p1', type: 'marked_sent', created_at: '2026-05-20T11:00:00.000Z' },
      { prospect_id: 'p1', type: 'marked_replied', created_at: '2026-05-20T13:00:00.000Z' },
    ],
    prospect_conversation_events: [
      { prospect_id: 'p1', event_type: 'closed_won', created_at: '2026-05-24T13:00:00.000Z' },
    ],
  }

  function makeBuilder(table: string) {
    return {
      select: () => makeBuilder(table),
      eq: () => makeBuilder(table),
      order: () => makeBuilder(table),
      limit: () => makeBuilder(table),
      maybeSingle: async () => ({ data: tables[table] ?? null, error: null }),
      single: async () => ({ data: tables[table] ?? null, error: null }),
      then: (onfulfilled?: (value: { data: unknown; error: null }) => unknown) =>
        Promise.resolve(onfulfilled?.({ data: tables[table] ?? [], error: null })),
    }
  }

  return {
    from: (table: string) => makeBuilder(table),
  }
}

describe('revenue conversions route', () => {
  beforeEach(() => {
    mockedCookies.mockResolvedValue({ getAll: () => [] })
    mockedRequireAllowedUser.mockResolvedValue({
      user: { id: 'user-1' },
      supabase: makeSupabase(),
      response: null,
    })
  })

  it('returns conversion truth payload', async () => {
    const response = await GET(new Request('http://localhost/api/studio/revenue/conversions') as never)
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.ok).toBe(true)
    expect(body.conversions.bestOffer).toMatchObject({
      offerId: 'offer-a',
      offerName: 'Outbound Sprint',
    })
    expect(body.conversions.bestModel).toMatchObject({
      model: 'hermes3:8b',
      modelFamily: 'hermes',
    })
    expect(body.conversions.offerBreakdown).toHaveLength(1)
  })
})
