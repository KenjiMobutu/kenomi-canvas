import { describe, expect, it } from 'vitest'
import { persistOperatorAlerts } from '@/lib/hermes-operator/alerts'
import { persistOperatorRecommendations } from '@/lib/hermes-operator/recommendations'

function createFakeSupabase(seed?: Record<string, Record<string, unknown>[]>) {
  const tables: Record<string, Record<string, unknown>[]> = {
    business_alerts: seed?.business_alerts ?? [],
    hermes_operator_recommendations: seed?.hermes_operator_recommendations ?? [],
  }

  return {
    tables,
    from(table: string) {
      const state = {
        filters: [] as Array<{ field: string; value: unknown }>,
        insertRows: [] as Record<string, unknown>[],
        patch: null as Record<string, unknown> | null,
      }

      const matches = (row: Record<string, unknown>) =>
        state.filters.every((filter) => row[filter.field] === filter.value)

      const builder = {
        select() {
          return builder
        },
        eq(field: string, value: unknown) {
          state.filters.push({ field, value })
          return builder
        },
        insert(row: Record<string, unknown> | Record<string, unknown>[]) {
          state.insertRows = Array.isArray(row) ? row : [row]
          state.insertRows.forEach((item, index) => {
            tables[table].push({ id: `${table}-${tables[table].length + 1 + index}`, ...item })
          })
          return builder
        },
        update(patch: Record<string, unknown>) {
          state.patch = patch
          tables[table].filter(matches).forEach((row) => Object.assign(row, patch))
          return builder
        },
        maybeSingle: async () => ({
          data: tables[table].find(matches) ?? null,
          error: null,
        }),
        then: (resolve: (value: { data: Record<string, unknown>[]; error: null }) => unknown) =>
          Promise.resolve(resolve({ data: tables[table].filter(matches), error: null })),
      }

      return builder
    },
  }
}

describe('persistOperatorAlerts', () => {
  it('deduplicates alerts by user, category, and dedupe key', async () => {
    const supabase = createFakeSupabase()
    await persistOperatorAlerts({
      supabase: supabase as never,
      userId: 'user-1',
      runId: 'run-1',
      alerts: [
        {
          severity: 'warn',
          category: 'cash_blocker',
          dedupeKey: 'cash_blocker:reddit:hot',
          headline: 'Replies without close on reddit/hot',
          detail: '4 replies, 0 wins this week.',
          channel: 'studio',
          payload: {},
        },
      ],
    })
    await persistOperatorAlerts({
      supabase: supabase as never,
      userId: 'user-1',
      runId: 'run-2',
      alerts: [
        {
          severity: 'warn',
          category: 'cash_blocker',
          dedupeKey: 'cash_blocker:reddit:hot',
          headline: 'Replies without close on reddit/hot',
          detail: '4 replies, 0 wins this week.',
          channel: 'studio',
          payload: {},
        },
      ],
    })

    expect(supabase.tables.business_alerts).toHaveLength(1)
    expect(supabase.tables.business_alerts[0]).toMatchObject({
      user_id: 'user-1',
      dedupe_key: 'cash_blocker:reddit:hot',
      run_id: 'run-2',
    })
  })
})

describe('persistOperatorRecommendations', () => {
  it('stores recommendations for one run', async () => {
    const supabase = createFakeSupabase()
    await persistOperatorRecommendations({
      supabase: supabase as never,
      userId: 'user-1',
      runId: 'run-1',
      recommendations: [
        {
          kind: 'run_follow_up_scan',
          priority: 90,
          title: 'Push follow-ups on reddit/hot',
          detail: 'Replies exist but there are no wins yet.',
          actionType: 'run_agent',
          riskLevel: 'low',
          source: { source: 'reddit', band: 'hot' },
          payload: { scheduleKey: 'follow_ups' },
        },
      ],
    })

    expect(supabase.tables.hermes_operator_recommendations).toHaveLength(1)
    expect(supabase.tables.hermes_operator_recommendations[0]).toMatchObject({
      user_id: 'user-1',
      run_id: 'run-1',
      kind: 'run_follow_up_scan',
      priority: 90,
    })
  })
})
