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

import { GET } from '@/app/api/studio/revenue/outcomes/route'

function makeSupabase() {
  const tables: Record<string, Record<string, unknown>[]> = {
    ventures: [{ id: 'venture-1', user_id: 'user-1' }],
    prospect_activities: [
      { user_id: 'user-1', type: 'marked_sent', created_at: '2026-05-30T09:00:00.000Z' },
      { user_id: 'user-1', type: 'marked_replied', created_at: '2026-05-31T10:00:00.000Z' },
    ],
    payments: [
      {
        venture_id: 'venture-1',
        status: 'completed',
        created_at: '2026-05-31T11:00:00.000Z',
        amount_eur: 29,
        collected_amount_eur: 29,
      },
    ],
    prospects: [
      {
        user_id: 'user-1',
        source: 'linkedin',
        band: 'warm',
        pipeline_status: 'awaiting_approval',
      },
      {
        user_id: 'user-1',
        source: 'linkedin',
        band: 'warm',
        pipeline_status: 'won',
      },
    ],
  }

  const schema: Record<string, string[]> = {
    ventures: ['id', 'user_id'],
    prospect_activities: ['user_id', 'type', 'created_at'],
    payments: ['venture_id', 'status', 'created_at', 'amount_eur', 'collected_amount_eur'],
    prospects: ['user_id', 'source', 'band', 'pipeline_status'],
  }

  function makeBuilder(table: string) {
    const state = {
      filters: [] as Array<{ field: string; value: unknown | unknown[] }>,
      orderField: null as string | null,
      ascending: true,
      limitCount: null as number | null,
      error: null as { message: string } | null,
    }

    const resolveRows = () => {
      let rows = [...(tables[table] ?? [])].filter((row) =>
        state.filters.every((filter) => row[filter.field] === filter.value)
      )
      if (state.orderField) {
        rows.sort((a, b) => {
          const left = String(a[state.orderField!] ?? '')
          const right = String(b[state.orderField!] ?? '')
          return state.ascending ? left.localeCompare(right) : right.localeCompare(left)
        })
      }
      if (state.limitCount !== null) rows = rows.slice(0, state.limitCount)
      return rows
    }

    const builder = {
      select: (columns?: string) => {
        if (columns) {
          const requestedColumns = columns
            .split(',')
            .map((column) => column.trim())
            .filter(Boolean)
          const invalid = requestedColumns.find((column) => !schema[table]?.includes(column))
          if (invalid) {
            state.error = { message: `column ${table}.${invalid} does not exist` }
          }
        }
        return builder
      },
      eq: (field: string, value: unknown) => {
        state.filters.push({ field, value })
        return builder
      },
      in: (field: string, values: unknown[]) => {
        state.filters.push({ field, value: values as unknown })
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
      then: (onfulfilled?: (value: { data: Record<string, unknown>[] | null; error: { message: string } | null }) => unknown) => {
        let rows = state.error ? null : resolveRows()
        const lastFilter = state.filters[state.filters.length - 1]
        const filterValues = lastFilter?.value
        if (rows && lastFilter && Array.isArray(filterValues)) {
          rows = rows.filter((row) => filterValues.includes(row[lastFilter.field]))
        }
        return Promise.resolve(onfulfilled?.({ data: rows, error: state.error }))
      },
    }

    return builder
  }

  return {
    from: (table: string) => makeBuilder(table),
  }
}

describe('studio revenue outcomes route', () => {
  beforeEach(() => {
    mockedCookies.mockResolvedValue({ getAll: () => [] })
    mockedRequireAllowedUser.mockResolvedValue({
      user: { id: 'user-1' },
      supabase: makeSupabase(),
      response: null,
    })
  })

  it('returns cash outcomes without querying legacy prospect columns', async () => {
    const response = await GET()
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.ok).toBe(true)
    expect(body.outcomes.sourceBreakdown[0]).toMatchObject({
      source: 'linkedin',
      active: 1,
      won: 1,
    })
    expect(body.outcomes.blockers).toContainEqual(
      expect.objectContaining({ key: 'awaiting_approval', count: 1 })
    )
  })
})
