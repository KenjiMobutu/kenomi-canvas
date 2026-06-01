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

import { GET } from '@/app/api/studio/hermes/brief/route'

function makeSupabase() {
  const tables: Record<string, Record<string, unknown>[]> = {
    hermes_operator_briefs: [
      {
        id: 'brief-1',
        user_id: 'user-1',
        run_id: 'run-1',
        summary: 'Double down on Revenue Audit while fixing founder-pain close friction.',
        cash_delta_7d: 1200,
        top_blocker: 'founder-pain replies without cash',
        top_opportunity: 'reddit/warm is collecting cash fastest',
        best_offer: 'Revenue Audit',
        best_segment: 'reddit/warm',
        best_source: 'reddit',
        main_leak: 'Meeting → close',
        next_best_action: 'Tighten family founder-pain',
        created_at: '2026-06-01T09:00:00.000Z',
      },
    ],
  }

  function makeBuilder(table: string) {
    const state = {
      filters: [] as Array<{ field: string; value: unknown }>,
      orderField: null as string | null,
      ascending: true,
      limitCount: null as number | null,
    }

    const resolveRows = () => {
      let rows = [...(tables[table] ?? [])].filter((row) =>
        state.filters.every((filter) => row[filter.field] === filter.value)
      )
      if (state.orderField) {
        rows.sort((a, b) => {
          const left = String(a[state.orderField!])
          const right = String(b[state.orderField!])
          return state.ascending ? left.localeCompare(right) : right.localeCompare(left)
        })
      }
      if (state.limitCount !== null) rows = rows.slice(0, state.limitCount)
      return rows
    }

    const builder = {
      select: () => builder,
      eq: (field: string, value: unknown) => {
        state.filters.push({ field, value })
        return builder
      },
      order: (field: string, options?: { ascending?: boolean }) => {
        state.orderField = field
        state.ascending = options?.ascending ?? true
        return builder
      },
      limit: (count: number) => {
        state.limitCount = count
        return builder
      },
      maybeSingle: async () => ({
        data: resolveRows()[0] ?? null,
        error: null,
      }),
      then: (onfulfilled?: (value: { data: Record<string, unknown>[]; error: null }) => unknown) =>
        Promise.resolve(onfulfilled?.({ data: resolveRows(), error: null })),
    }

    return builder
  }

  return {
    from: (table: string) => makeBuilder(table),
  }
}

describe('studio hermes brief route', () => {
  beforeEach(() => {
    mockedCookies.mockResolvedValue({ getAll: () => [] })
    mockedRequireAllowedUser.mockResolvedValue({
      user: { id: 'user-1' },
      supabase: makeSupabase(),
      response: null,
    })
  })

  it('returns the latest Hermes daily brief', async () => {
    const response = await GET()
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.ok).toBe(true)
    expect(body.brief.summary).toContain('Revenue Audit')
    expect(body.brief.cashDelta7d).toBe(1200)
    expect(body.brief.topOpportunity).toContain('reddit')
  })
})
