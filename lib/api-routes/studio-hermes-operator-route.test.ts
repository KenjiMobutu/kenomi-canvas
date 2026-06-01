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

import { GET, PATCH } from '@/app/api/studio/hermes/operator/route'

function makeSupabase() {
  const tables: Record<string, Record<string, unknown>[]> = {
    user_operator_settings: [],
    hermes_operator_runs: [
      {
        id: 'run-1',
        user_id: 'user-1',
        mode: 'observe',
        status: 'completed',
        model: 'hermes3:8b',
        summary: 'Push follow-ups on reddit/hot.',
        alerts_count: 1,
        enqueued_jobs_count: 0,
        executed_actions_count: 0,
        created_at: '2026-05-28T10:00:00.000Z',
        last_error: null,
        input_snapshot: {
          prospects: { total: 10, pendingApprovals: 2, followUpsDue: 3 },
          automation: { queuedJobs: 4, failedJobs: 1 },
          revenue: { conversions: { overview: { replied: 5, paid: 1 } } },
        },
      },
      {
        id: 'run-0',
        user_id: 'user-1',
        mode: 'observe',
        status: 'completed',
        model: 'hermes3:8b',
        summary: 'Previous tick.',
        alerts_count: 0,
        enqueued_jobs_count: 0,
        executed_actions_count: 0,
        created_at: '2026-05-28T09:00:00.000Z',
        last_error: null,
        input_snapshot: {
          prospects: { total: 9, pendingApprovals: 3, followUpsDue: 5 },
          automation: { queuedJobs: 2, failedJobs: 0 },
          revenue: { conversions: { overview: { replied: 3, paid: 0 } } },
        },
      },
    ],
    hermes_operator_recommendations: [
      {
        id: 'rec-1',
        run_id: 'run-1',
        user_id: 'user-1',
        kind: 'run_follow_up_scan',
        priority: 90,
        title: 'Push follow-ups',
        detail: 'Replies but no wins.',
        action_type: 'run_agent',
        risk_level: 'low',
        status: 'open',
        policy_block_reason: null,
        created_at: '2026-05-28T10:00:00.000Z',
      },
    ],
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
      maybeSingle: async () => ({
        data: resolveRows()[0] ?? null,
        error: null,
      }),
      upsert: (payload: Record<string, unknown>) => {
        const existingIndex = tables[table].findIndex((row) => row.user_id === payload.user_id)
        if (existingIndex >= 0) {
          tables[table][existingIndex] = { ...tables[table][existingIndex], ...payload }
        } else {
          tables[table].push({ id: `${table}-1`, ...payload })
        }
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

describe('studio hermes operator route', () => {
  beforeEach(() => {
    mockedCookies.mockResolvedValue({ getAll: () => [] })
    mockedRequireAllowedUser.mockResolvedValue({
      user: { id: 'user-1' },
      supabase: makeSupabase(),
      response: null,
    })
  })

  it('returns a compact Hermes operator view', async () => {
    const response = await GET()
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.ok).toBe(true)
    expect(body.view.currentMode).toBe('observe')
    expect(body.view.notificationMode).toBe('studio_only')
    expect(body.view.lastRun.summary).toContain('follow-ups')
    expect(body.view.openAlertsCount).toBe(1)
    expect(body.view.blockedByPolicyCount).toBe(0)
    expect(body.view.lastRunDelta).toMatchObject({
      pendingApprovals: -1,
      followUpsDue: -2,
      queuedJobs: 2,
      failedJobs: 1,
      replied: 2,
      paid: 1,
    })
  })

  it('updates operator mode and returns refreshed view', async () => {
    const response = await PATCH(
      new Request('http://localhost/api/studio/hermes/operator', {
        method: 'PATCH',
        body: JSON.stringify({ mode: 'recommend' }),
      })
    )
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.ok).toBe(true)
    expect(body.view.currentMode).toBe('recommend')
  })

  it('updates operator caps and returns refreshed view', async () => {
    const response = await PATCH(
      new Request('http://localhost/api/studio/hermes/operator', {
        method: 'PATCH',
        body: JSON.stringify({
          settings: {
            maxAutoActionsPerDay: 7,
            maxAutoProspectRunsPerDay: 3,
            maxAutoFollowUpScansPerDay: 4,
            maxAutoDevopsRunsPerDay: 2,
            notificationMode: 'studio_only',
          },
        }),
      })
    )
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.ok).toBe(true)
    expect(body.view.maxAutoActionsPerDay).toBe(7)
    expect(body.view.maxAutoProspectRunsPerDay).toBe(3)
    expect(body.view.maxAutoFollowUpScansPerDay).toBe(4)
    expect(body.view.maxAutoDevopsRunsPerDay).toBe(2)
  })

  it('dismisses a recommendation and returns refreshed view', async () => {
    const response = await PATCH(
      new Request('http://localhost/api/studio/hermes/operator', {
        method: 'PATCH',
        body: JSON.stringify({ type: 'dismiss_recommendation', recommendationId: 'rec-1' }),
      })
    )
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.ok).toBe(true)
    expect(body.view.openRecommendationsCount).toBe(0)
    expect(body.view.topRecommendation).toBeNull()
  })
})
