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

import { GET, POST } from '@/app/api/studio/revenue/offers/route'

function makeSupabase() {
  const tables = {
    offers: [
      { id: 'offer-a', user_id: 'user-1', name: 'Offer A', category: 'service', target_icp: 'founders' },
    ],
    prospects: [
      { offer_id: 'offer-a', pipeline_status: 'won' },
      { offer_id: 'offer-a', pipeline_status: 'sent' },
    ],
  } as const

  function makeBuilder(table: keyof typeof tables) {
    return {
      select: () => makeBuilder(table),
      eq: () => makeBuilder(table),
      order: () => makeBuilder(table),
      limit: () => makeBuilder(table),
      insert: (row: unknown) => ({
        select: () => ({
          single: async () => ({
            data: Array.isArray(row) ? row[0] : row,
            error: null,
          }),
        }),
      }),
      single: async () => ({
        data: tables[table][0] ?? null,
        error: null,
      }),
      then: (onfulfilled?: (value: { data: unknown; error: null }) => unknown) =>
        Promise.resolve(onfulfilled?.({ data: tables[table], error: null })),
    }
  }

  return {
    from: (table: keyof typeof tables) => makeBuilder(table),
  }
}

describe('studio revenue offers route', () => {
  beforeEach(() => {
    mockedCookies.mockReset()
    mockedRequireAllowedUser.mockReset()

    mockedCookies.mockResolvedValue({
      getAll: () => [],
    })

    mockedRequireAllowedUser.mockResolvedValue({
      user: { id: 'user-1' },
      supabase: makeSupabase(),
      response: null,
    })
  })

  it('GET returns offer snapshots with prospect counts', async () => {
    const response = await GET()
    expect(response.status).toBe(200)

    const body = await response.json()
    expect(body.ok).toBe(true)
    expect(body.offers).toEqual([
      {
        id: 'offer-a',
        name: 'Offer A',
        category: 'service',
        targetIcp: 'founders',
        totalProspects: 2,
        repliedProspects: 0,
        wonProspects: 1,
      },
    ])
  })

  it('POST creates an offer for the current user', async () => {
    const response = await POST(
      new Request('http://localhost/api/studio/revenue/offers', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: 'Offer C',
          category: 'productized_service',
          target_icp: 'agencies',
          default_price_eur: 1200,
        }),
      }) as never
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      ok: true,
      offer: {
        user_id: 'user-1',
        name: 'Offer C',
        category: 'productized_service',
        target_icp: 'agencies',
        default_price_eur: 1200,
      },
    })
  })
})
