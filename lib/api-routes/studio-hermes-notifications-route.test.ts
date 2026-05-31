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

import { GET, PATCH } from '@/app/api/studio/hermes/notifications/route'

function makeSupabase() {
  const tables: Record<string, Record<string, unknown>[]> = {
    business_alerts: [
      {
        id: 'alert-1',
        user_id: 'user-1',
        severity: 'warn',
        category: 'cash_blocker',
        headline: 'Replies without close',
        detail: 'reddit/hot is stalled.',
        status: 'open',
        channel: 'studio',
        created_at: '2026-05-28T10:00:00.000Z',
      },
      {
        id: 'alert-2',
        user_id: 'user-1',
        severity: 'critical',
        category: 'infra',
        headline: 'Infra degraded',
        detail: 'One service is down.',
        status: 'sent',
        channel: 'studio',
        created_at: '2026-05-28T10:05:00.000Z',
      },
    ],
  }

  function makeBuilder(table: string) {
    const state = {
      filters: [] as Array<{ field: string; value: unknown }>,
      limitCount: null as number | null,
      orderField: null as string | null,
      ascending: true,
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
      update: (payload: Record<string, unknown>) => {
        resolveRows().forEach((row) => Object.assign(row, payload))
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
      then: (onfulfilled?: (value: { data: Record<string, unknown>[]; error: null }) => unknown) =>
        Promise.resolve(onfulfilled?.({ data: resolveRows(), error: null })),
    }

    return builder
  }

  return {
    tables,
    from: (table: string) => makeBuilder(table),
  }
}

describe('studio hermes notifications route', () => {
  beforeEach(() => {
    mockedCookies.mockResolvedValue({ getAll: () => [] })
    mockedRequireAllowedUser.mockResolvedValue({
      user: { id: 'user-1' },
      supabase: makeSupabase(),
      response: null,
    })
  })

  it('returns Hermes alerts', async () => {
    const response = await GET()
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.ok).toBe(true)
    expect(body.alerts).toHaveLength(2)
  })

  it('resolves an alert and returns refreshed alerts', async () => {
    const response = await PATCH(
      new Request('http://localhost/api/studio/hermes/notifications', {
        method: 'PATCH',
        body: JSON.stringify({ type: 'resolve_alert', alertId: 'alert-1' }),
      })
    )
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.ok).toBe(true)
    expect(body.alerts.find((alert: { id: string }) => alert.id === 'alert-1')).toMatchObject({
      status: 'resolved',
    })
  })

  it('mutes an alert and returns refreshed alerts', async () => {
    const response = await PATCH(
      new Request('http://localhost/api/studio/hermes/notifications', {
        method: 'PATCH',
        body: JSON.stringify({ type: 'mute_alert', alertId: 'alert-2' }),
      })
    )
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.ok).toBe(true)
    expect(body.alerts.find((alert: { id: string }) => alert.id === 'alert-2')).toMatchObject({
      status: 'muted',
    })
  })
})
