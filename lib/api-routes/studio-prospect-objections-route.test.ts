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

import { GET, POST } from '@/app/api/studio/prospects/objections/route'

function makeSupabase() {
  const tables: Record<string, unknown> = {
    prospects: { id: 'prospect-1' },
    prospect_conversation_events: [
      {
        id: 'event-1',
        prospect_id: 'prospect-1',
        user_id: 'user-1',
        event_type: 'budget_block',
        event_value: 'q3',
        notes: 'budget frozen',
        created_at: '2026-05-28T10:00:00.000Z',
      },
    ],
    prospect_activities: [],
  }

  function makeBuilder(table: string) {
    return {
      select: () => makeBuilder(table),
      eq: () => makeBuilder(table),
      order: () => makeBuilder(table),
      limit: () => makeBuilder(table),
      maybeSingle: async () => ({ data: tables[table] ?? null, error: null }),
      single: async () => ({ data: tables[table] ?? null, error: null }),
      insert: (value: unknown) => {
        if (table === 'prospect_conversation_events') {
          tables[table] = {
            id: 'event-new',
            ...(value as Record<string, unknown>),
          }
        }
        return makeBuilder(table)
      },
      then: (onfulfilled?: (value: { data: unknown; error: null }) => unknown) =>
        Promise.resolve(onfulfilled?.({ data: tables[table] ?? [], error: null })),
    }
  }

  return {
    from: (table: string) => makeBuilder(table),
  }
}

describe('studio prospect objections route', () => {
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

  it('GET returns summarized conversation truth', async () => {
    const response = await GET(
      new Request('http://localhost/api/studio/prospects/objections') as never
    )
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.ok).toBe(true)
    expect(body.summary.totalEvents).toBe(1)
    expect(body.summary.blockers[0]).toMatchObject({ type: 'budget_block', count: 1 })
  })

  it('POST appends a conversation event', async () => {
    const response = await POST(
      new Request('http://localhost/api/studio/prospects/objections', {
        method: 'POST',
        body: JSON.stringify({
          prospect_id: '5fd5c491-4d0d-45be-b5e8-926571d0c8ad',
          event_type: 'soft_interest',
          event_value: 'asked for deck',
          notes: 'send deck tomorrow',
        }),
      }) as never
    )

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.ok).toBe(true)
    expect(body.event).toMatchObject({
      id: 'event-new',
      event_type: 'soft_interest',
      event_value: 'asked for deck',
      notes: 'send deck tomorrow',
    })
  })
})
