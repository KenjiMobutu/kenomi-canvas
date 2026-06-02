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

import { GET, POST } from '@/app/api/studio/revenue/insights/route'

function makeSupabase() {
  const tables: Record<string, unknown> = {
    offers: [{ id: 'offer-a', name: 'Outbound Sprint' }],
    prospects: [
      {
        id: 'p1',
        offer_id: 'offer-a',
        outreach_angle: 'speed',
        source: 'linkedin',
        band: 'warm',
        pipeline_status: 'won',
        created_at: '2026-05-20T10:00:00.000Z',
      },
    ],
    prospect_activities: [
      { prospect_id: 'p1', type: 'marked_sent', created_at: '2026-05-20T11:00:00.000Z' },
      { prospect_id: 'p1', type: 'marked_replied', created_at: '2026-05-20T13:00:00.000Z' },
      { prospect_id: 'p1', type: 'marked_won', created_at: '2026-05-24T13:00:00.000Z' },
    ],
    prospect_conversation_events: [
      { prospect_id: 'p1', event_type: 'closed_won', created_at: '2026-05-24T13:00:00.000Z' },
    ],
    weekly_revenue_reviews: [
      {
        id: 'review-1',
        week_start: '2026-05-26',
        week_end: '2026-06-01',
        status: 'saved',
        summary_json: { bestSource: { title: 'linkedin' } },
        created_at: '2026-05-28T12:00:00.000Z',
      },
    ],
  }
  let upsertedReview:
    | {
        id: string
        week_start: string
        week_end: string
        status: string
        summary_json: Record<string, unknown>
        created_at: string
      }
    | null = null

  function makeBuilder(table: string) {
    return {
      select: () => makeBuilder(table),
      eq: () => makeBuilder(table),
      order: () => makeBuilder(table),
      limit: () => makeBuilder(table),
      upsert: (payload: Record<string, unknown>) => {
        if (table === 'weekly_revenue_reviews') {
          upsertedReview = {
            id: 'review-upserted',
            week_start: String(payload.week_start),
            week_end: String(payload.week_end),
            status: String(payload.status),
            summary_json: (payload.summary_json as Record<string, unknown>) ?? {},
            created_at: '2026-05-28T12:00:00.000Z',
          }
        }
        return makeBuilder(table)
      },
      maybeSingle: async () => ({
        data: table === 'weekly_revenue_reviews' ? upsertedReview ?? (tables[table] as unknown[] | undefined)?.[0] ?? null : (tables[table] as unknown[] | undefined)?.[0] ?? null,
        error: null,
      }),
      single: async () => ({
        data: table === 'weekly_revenue_reviews' ? upsertedReview ?? (tables[table] as unknown[] | undefined)?.[0] ?? null : (tables[table] as unknown[] | undefined)?.[0] ?? null,
        error: null,
      }),
      then: (onfulfilled?: (value: { data: unknown; error: null }) => unknown) =>
        Promise.resolve(onfulfilled?.({ data: tables[table] ?? [], error: null })),
    }
  }

  return {
    from: (table: string) => makeBuilder(table),
  }
}

describe('revenue insights route', () => {
  beforeEach(() => {
    mockedCookies.mockResolvedValue({ getAll: () => [] })
    mockedRequireAllowedUser.mockResolvedValue({
      user: { id: 'user-1' },
      supabase: makeSupabase(),
      response: null,
    })
  })

  it('returns generated weekly insights and the last saved review', async () => {
    const response = await GET()
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.ok).toBe(true)
    expect(body.insights.bestOffer.title).toBe('Outbound Sprint')
    expect(body.lastReview?.id).toBe('review-1')
    expect(body.lastReview?.summary.recommendation.bestSource.title).toBe('linkedin')
  })

  it('persists the current weekly review snapshot', async () => {
    const response = await POST(
      new Request('http://localhost/api/studio/revenue/insights', {
        method: 'POST',
        body: JSON.stringify({
          operatorDecision: {
            doubleDown: 'LinkedIn warm segment',
            stop: 'Speed family on Reddit',
            nextExperiment: 'Test a tighter close CTA',
            note: 'Focus only on paid cash next week',
          },
        }),
      }) as never
    )
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.ok).toBe(true)
    expect(body.review.status).toBe('saved')
    expect(body.review.summary.recommendation.bestOffer.title).toBe('Outbound Sprint')
    expect(body.review.summary.operatorDecision.doubleDown).toBe('LinkedIn warm segment')
  })
})
