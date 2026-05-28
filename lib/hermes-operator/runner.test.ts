import { describe, expect, it } from 'vitest'
import { runHermesOperatorTick } from '@/lib/hermes-operator/runner'
import type { HermesOperatorContextSnapshot } from '@/lib/hermes-operator/types'

function createFakeSupabase(seed?: Record<string, Record<string, unknown>[]>) {
  const tables: Record<string, Record<string, unknown>[]> = {
    hermes_operator_runs: seed?.hermes_operator_runs ?? [],
    hermes_operator_recommendations: seed?.hermes_operator_recommendations ?? [],
    business_alerts: seed?.business_alerts ?? [],
  }

  return {
    tables,
    from(table: string) {
      if (!(table in tables)) throw new Error(`Unexpected table ${table}`)
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
          state.insertRows.forEach((item) => {
            tables[table].push({ ...item })
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

const fakeContext: HermesOperatorContextSnapshot = {
  generatedAt: '2026-05-28T10:00:00.000Z',
  revenue: {
    conversions: {
      overview: {
        contacted: 10,
        replied: 4,
        qualifiedReplies: 2,
        meetingsBooked: 1,
        checkoutsCreated: 1,
        paid: 0,
        replyRate: 40,
        qualifiedRate: 20,
        closeRate: 0,
        leadToReplyHours: 8,
        replyToCloseDays: 0,
      },
      offerBreakdown: [],
      angleBreakdown: [],
      segmentOfferBreakdown: [],
      modelBreakdown: [],
      bestOffer: null,
      bestAngle: null,
      segmentRepliesNoPay: null,
      sourceClosesFastest: null,
      bestModel: null,
      commonObjections: [],
      lostReasons: [],
      repeatNext: null,
      stopNext: null,
    },
    weeklyReview: {
      window: { weekStart: '2026-05-26', weekEnd: '2026-06-01', label: '2026-05-26 → 2026-06-01' },
      bestSource: { title: 'No source truth yet', detail: 'Need more replies.' },
      bestSegment: { title: 'No segment truth yet', detail: 'Need more wins.' },
      bestOffer: { title: 'No offer truth yet', detail: 'Need more tagged offers.' },
      bestAngle: { title: 'No angle truth yet', detail: 'Need more tagged angles.' },
      topObjection: { title: 'No objection truth yet', detail: 'Need more classified replies.' },
      mainLeak: { stageKey: 'lead_to_reply', title: 'Lead → reply', detail: 'Low reply rate.' },
      nextExperiment: {
        focus: 'source',
        title: 'Double down on reddit',
        detail: 'Push more volume on the best source.',
        source: 'reddit',
      },
    },
  },
  prospects: {
    total: 10,
    awaitingApproval: 1,
    pendingApprovals: 1,
    followUpsDue: 2,
    hotLeads: 3,
  },
  automation: {
    autonomyStatus: 'active',
    pausedReason: null,
    queuedJobs: 1,
    runningJobs: 0,
    failedJobs: 0,
  },
  infrastructure: {
    status: 'ok',
    headline: 'Infra stable',
    summary: 'Everything looks fine.',
    operatorNextStep: 'Keep watching.',
    checkedAt: '2026-05-28T09:50:00.000Z',
    runtimeCommit: 'abc1234',
    servicesCount: 4,
    openIncidents: 0,
  },
}

describe('runHermesOperatorTick', () => {
  it('persists a completed observe run, recommendations, and alerts', async () => {
    const supabase = createFakeSupabase()

    const result = await runHermesOperatorTick({
      supabase: supabase as never,
      userId: 'user-1',
      now: new Date('2026-05-28T10:15:00.000Z'),
      buildContext: async () => fakeContext,
      runEngine: async () => ({
        summary: 'Push more follow-ups on reddit.',
        recommendations: [
          {
            kind: 'run_follow_up_scan',
            priority: 90,
            title: 'Push follow-ups',
            detail: 'Replies exist but no wins yet.',
            actionType: 'run_agent',
            riskLevel: 'low',
            source: { source: 'reddit' },
            payload: { scheduleKey: 'follow_ups' },
          },
        ],
        alerts: [
          {
            severity: 'warn',
            category: 'cash_blocker',
            dedupeKey: 'cash_blocker:reddit',
            headline: 'Replies without wins',
            detail: 'Need better close motion.',
            channel: 'studio',
            payload: {},
          },
        ],
        provider: 'hermes',
        model: 'hermes3:8b',
        fallbackTriggered: false,
      }),
    })

    expect(result).toMatchObject({
      status: 'completed',
      mode: 'observe',
      recommendationsCount: 1,
      alertsCount: 1,
      model: 'hermes3:8b',
    })
    expect(supabase.tables.hermes_operator_runs).toHaveLength(1)
    expect(supabase.tables.hermes_operator_runs[0]).toMatchObject({
      user_id: 'user-1',
      mode: 'observe',
      status: 'completed',
      model_family: 'hermes',
      summary: 'Push more follow-ups on reddit.',
      alerts_count: 1,
    })
    expect(supabase.tables.hermes_operator_recommendations).toHaveLength(1)
    expect(supabase.tables.business_alerts).toHaveLength(1)
  })

  it('persists a failed run when Hermes execution crashes', async () => {
    const supabase = createFakeSupabase()

    await expect(
      runHermesOperatorTick({
        supabase: supabase as never,
        userId: 'user-1',
        buildContext: async () => fakeContext,
        runEngine: async () => {
          throw new Error('Hermes unavailable')
        },
      })
    ).rejects.toThrow('Hermes unavailable')

    expect(supabase.tables.hermes_operator_runs).toHaveLength(1)
    expect(supabase.tables.hermes_operator_runs[0]).toMatchObject({
      user_id: 'user-1',
      mode: 'observe',
      status: 'failed',
      model_family: 'hermes',
      last_error: 'Hermes unavailable',
    })
    expect(supabase.tables.hermes_operator_recommendations).toHaveLength(0)
    expect(supabase.tables.business_alerts).toHaveLength(0)
  })
})
