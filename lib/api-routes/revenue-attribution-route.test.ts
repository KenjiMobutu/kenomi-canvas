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

import { GET } from '@/app/api/studio/revenue/attribution/route'

function makeSupabase() {
  const tables: Record<string, unknown> = {
    payment_attributions: [
      {
        checkout_session_id: 'cs_1',
        offer_id: 'offer-a',
        offer_variant: 'core',
        source: 'linkedin',
        band: 'warm',
        amount_eur: 29,
        currency: 'eur',
        payment_status: 'completed',
        attribution_status: 'exact',
        confidence_score: 1,
      },
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

describe('revenue attribution route', () => {
  beforeEach(() => {
    mockedCookies.mockResolvedValue({ getAll: () => [] })
    mockedRequireAllowedUser.mockResolvedValue({
      user: { id: 'user-1' },
      supabase: makeSupabase(),
      response: null,
    })
  })

  it('returns attribution truth payload', async () => {
    const response = await GET()
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.ok).toBe(true)
    expect(body.attribution.overview).toMatchObject({
      totalRows: 1,
      paidRows: 1,
      attributedCashEur: 29,
      confidenceRate: 100,
    })
    expect(body.attribution.offerBreakdown[0]).toMatchObject({
      offerId: 'offer-a',
      offerVariant: 'core',
    })
    expect(body.attribution.bestSegmentByCash).toMatchObject({
      key: 'linkedin:warm',
      paidCashEur: 29,
    })
  })
})
