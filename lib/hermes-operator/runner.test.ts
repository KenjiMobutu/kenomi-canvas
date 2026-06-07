import { describe, expect, it } from 'vitest'
import { runHermesOperatorTick } from '@/lib/hermes-operator/runner'
import type { HermesOperatorContextSnapshot } from '@/lib/hermes-operator/types'

function createFakeSupabase(seed?: Record<string, Record<string, unknown>[]>) {
  const tables: Record<string, Record<string, unknown>[]> = {
    hermes_operator_runs: seed?.hermes_operator_runs ?? [],
    hermes_operator_briefs: seed?.hermes_operator_briefs ?? [],
    hermes_operator_recommendations: seed?.hermes_operator_recommendations ?? [],
    business_alerts: seed?.business_alerts ?? [],
    autonomy_jobs: seed?.autonomy_jobs ?? [],
    user_operator_settings: seed?.user_operator_settings ?? [],
  }

  return {
    tables,
    from(table: string) {
      if (!(table in tables)) throw new Error(`Unexpected table ${table}`)
      const state = {
        filters: [] as Array<{ field: string; value: unknown }>,
        insertRows: [] as Record<string, unknown>[],
        patch: null as Record<string, unknown> | null,
        orderField: null as string | null,
        ascending: true,
        limitCount: null as number | null,
      }

      const matches = (row: Record<string, unknown>) =>
        state.filters.every((filter) => row[filter.field] === filter.value)

      const resolveRows = () => {
        let rows = tables[table].filter(matches)
        if (state.orderField) {
          rows = [...rows].sort((a, b) => {
            const left = String(a[state.orderField!])
            const right = String(b[state.orderField!])
            return state.ascending ? left.localeCompare(right) : right.localeCompare(left)
          })
        }
        if (state.limitCount !== null) rows = rows.slice(0, state.limitCount)
        return rows
      }

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
            tables[table].push({
              id: item.id ?? `${table}-${tables[table].length + index + 1}`,
              ...item,
            })
          })
          return builder
        },
        update(patch: Record<string, unknown>) {
          state.patch = patch
          return builder
        },
        order(field: string, options?: { ascending?: boolean }) {
          state.orderField = field
          state.ascending = options?.ascending ?? true
          return builder
        },
        limit(count: number) {
          state.limitCount = count
          return builder
        },
        maybeSingle: async () => ({
          data: (() => {
            const row = resolveRows()[0] ?? null
            if (row && state.patch) Object.assign(row, state.patch)
            return row
          })(),
          error: null,
        }),
        then: (resolve: (value: { data: Record<string, unknown>[]; error: null }) => unknown) => {
          const rows =
            state.insertRows.length > 0
              ? tables[table].slice(-state.insertRows.length)
              : resolveRows()
          if (state.patch) rows.forEach((row) => Object.assign(row, state.patch))
          return Promise.resolve(resolve({ data: rows, error: null }))
        },
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
        wonCount: 0,
        paidCount: 0,
        paidCashEur: 0,
        replyRate: 40,
        qualifiedRate: 20,
        closeRate: 0,
        wonToPaidRate: 0,
        replyToPaidRate: 0,
        leadToReplyHours: 8,
        replyToCloseDays: 0,
      },
      offerBreakdown: [],
      angleBreakdown: [],
      segmentOfferBreakdown: [],
      modelBreakdown: [],
      bestOffer: null,
      bestOfferToWin: null,
      bestOfferToCollectCash: null,
      bestAngle: null,
      bestSegmentToReply: null,
      bestSegmentToPay: null,
      segmentRepliesNoPay: null,
      segmentWinsNoCash: null,
      sourceClosesFastest: null,
      sourceCollectsFastest: null,
      bestModel: null,
      messageFamilyBreakdown: [],
      bestMessageFamily: null,
      messageFamilyRepliesNoCash: null,
      messageFamilyWinsNoCash: null,
      messageFamilyTopObjection: null,
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
      bestOfferByCash: { title: 'No attributed offer cash yet', detail: 'Need more paid truth.' },
      bestAngle: { title: 'No angle truth yet', detail: 'Need more tagged angles.' },
      bestAngleByCash: { title: 'No attributed angle cash yet', detail: 'Need more paid truth.' },
      bestMessageFamily: { title: 'No message truth yet', detail: 'Need more tagged messages.' },
      messageFamilyToStop: { title: 'No family to stop yet', detail: 'Need more message-family outcomes.' },
      topObjection: { title: 'No objection truth yet', detail: 'Need more classified replies.' },
      highestValueObjection: { title: 'No objection truth yet', detail: 'Need more classified replies.' },
      mainLeak: { stageKey: 'contact_to_reply', title: 'Lead → reply', detail: 'Low reply rate.' },
      nextExperiment: {
        focus: 'source',
        title: 'Double down on reddit',
        detail: 'Push more volume on the best source.',
        source: 'reddit',
      },
    },
    outcomes: {
      last7d: { replies: 4, deals: 1, cashEur: 900 },
      previous7d: { replies: 2, deals: 0, cashEur: 0 },
      last30d: { replies: 6, deals: 1, cashEur: 900 },
      previous30d: { replies: 3, deals: 0, cashEur: 0 },
      delta7d: { replies: 2, deals: 1, cashEur: 900 },
      delta30d: { replies: 3, deals: 1, cashEur: 900 },
      rates: {
        replyRate7d: 40,
        winRate7d: 10,
        replyRate30d: 35,
        winRate30d: 8,
      },
      sourceBreakdown: [],
      sourceBandBreakdown: [],
      topSegment: null,
      blockers: [],
      blockerActions: [],
    },
    loop: {
      activeLoops: 1,
      readyCheckouts: 1,
      pendingApprovals: 1,
      revenueEur: 900,
      blockedRevenueEur: 250,
      recommendedAction: null,
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
    failedJobs: 1,
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
      alertsCount: 2,
      model: 'hermes3:8b',
    })
    expect(supabase.tables.hermes_operator_runs).toHaveLength(1)
    expect(supabase.tables.hermes_operator_runs[0]).toMatchObject({
      user_id: 'user-1',
      mode: 'observe',
      status: 'completed',
      model_family: 'hermes',
      summary: 'Push more follow-ups on reddit.',
      alerts_count: 2,
    })
    expect(supabase.tables.hermes_operator_recommendations).toHaveLength(1)
    expect(supabase.tables.business_alerts.length).toBeGreaterThanOrEqual(1)
    expect(supabase.tables.business_alerts.map((row) => row.category)).toContain(
      'execution_failed_jobs_increase'
    )
    expect(supabase.tables.business_alerts.map((row) => row.category)).toContain(
      'business_blocked_revenue_increase'
    )
    expect(supabase.tables.hermes_operator_briefs).toHaveLength(1)
    expect(supabase.tables.hermes_operator_briefs[0]).toMatchObject({
      user_id: 'user-1',
      run_id: result.runId,
    })
    expect(supabase.tables.autonomy_jobs).toHaveLength(0)
  })

  it('auto-enqueues only low-risk run_agent recommendations in recommend mode', async () => {
    const supabase = createFakeSupabase()

    const result = await runHermesOperatorTick({
      supabase: supabase as never,
      userId: 'user-1',
      mode: 'recommend',
      now: new Date('2026-05-28T10:15:00.000Z'),
      buildContext: async () => fakeContext,
      runEngine: async () => ({
        summary: 'Run Prospect and leave the rest for review.',
        recommendations: [
          {
            kind: 'run_agent',
            priority: 95,
            title: 'Run Prospect on hot segment',
            detail: 'Enough signal to justify one more low-risk Prospect pass.',
            actionType: 'run_agent',
            riskLevel: 'low',
            source: { source: 'reddit', band: 'hot' },
            payload: {
              agentId: 'prospect',
              prompt: 'Generate one high-quality prospect for the hot reddit segment.',
              input: { source: 'reddit', band: 'hot' },
            },
          },
          {
            kind: 'deploy_fix',
            priority: 80,
            title: 'Restart infra',
            detail: 'This should stay gated.',
            actionType: 'deploy',
            riskLevel: 'high',
            source: { source: 'infra' },
            payload: { target: 'api' },
          },
        ],
        alerts: [],
        provider: 'hermes',
        model: 'hermes3:8b',
        fallbackTriggered: false,
      }),
    })

    expect(result).toMatchObject({
      status: 'completed',
      mode: 'recommend',
      recommendationsCount: 2,
      alertsCount: 2,
    })
    expect(supabase.tables.autonomy_jobs).toHaveLength(1)
    expect(supabase.tables.autonomy_jobs[0]).toMatchObject({
      user_id: 'user-1',
      kind: 'run_agent',
      status: 'queued',
      payload: {
        agentId: 'prospect',
        prompt: 'Generate one high-quality prospect for the hot reddit segment.',
        input: {
          band: 'hot',
          trigger: 'hermes_operator',
          recommendationKind: 'run_agent',
          source: {
            source: 'reddit',
            band: 'hot',
          },
        },
      },
    })
    expect(
      String(
        (supabase.tables.autonomy_jobs[0]?.payload as Record<string, unknown>)?.input &&
          ((supabase.tables.autonomy_jobs[0]?.payload as Record<string, unknown>)
            .input as Record<string, unknown>).recommendationId
      )
    ).toBeTruthy()
    expect(supabase.tables.hermes_operator_recommendations).toHaveLength(2)
    const runAgentRecommendation = supabase.tables.hermes_operator_recommendations.find(
      (row) => row.action_type === 'run_agent'
    )
    const deployRecommendation = supabase.tables.hermes_operator_recommendations.find(
      (row) => row.action_type === 'deploy'
    )
    expect(runAgentRecommendation).toMatchObject({
      status: 'accepted',
      action_type: 'run_agent',
      risk_level: 'low',
    })
    expect(deployRecommendation).toMatchObject({
      status: 'open',
      action_type: 'deploy',
      risk_level: 'high',
    })
    expect(supabase.tables.hermes_operator_runs[0]).toMatchObject({
      enqueued_jobs_count: 1,
      executed_actions_count: 1,
    })
  })

  it('maps Hermes follow-up and safe agent recommendation kinds to the right job kinds', async () => {
    const supabase = createFakeSupabase()

    await runHermesOperatorTick({
      supabase: supabase as never,
      userId: 'user-1',
      mode: 'recommend',
      now: new Date('2026-05-28T10:15:00.000Z'),
      buildContext: async () => fakeContext,
      runEngine: async () => ({
        summary: 'Scan follow-ups and run DevOps.',
        recommendations: [
          {
            kind: 'run_follow_up_scan',
            priority: 90,
            title: 'Scan due follow-ups',
            detail: 'There are enough due follow-ups to justify a scan.',
            actionType: 'run_agent',
            riskLevel: 'low',
            source: { source: 'reddit', band: 'hot' },
            payload: { scheduleKey: 'follow_ups' },
          },
          {
            kind: 'run_devops',
            priority: 80,
            title: 'Run DevOps diagnostics',
            detail: 'Infra deserves one fresh diagnostic pass.',
            actionType: 'run_agent',
            riskLevel: 'low',
            source: { source: 'infra' },
            payload: { prompt: 'Check infra health for revenue blockers.' },
          },
          {
            kind: 'run_agent',
            priority: 70,
            title: 'Do not run Scout automatically',
            detail: 'Scout stays outside the safe Hermes lane.',
            actionType: 'run_agent',
            riskLevel: 'low',
            source: { source: 'reddit' },
            payload: { agentId: 'scout' },
          },
        ],
        alerts: [],
        provider: 'hermes',
        model: 'hermes3:8b',
        fallbackTriggered: false,
      }),
    })

    expect(supabase.tables.autonomy_jobs).toHaveLength(2)
    expect(supabase.tables.autonomy_jobs[0]).toMatchObject({
      kind: 'follow_up_scan',
      payload: {
        scheduleKey: 'follow_ups',
        trigger: 'hermes_operator',
        recommendationKind: 'run_follow_up_scan',
        source: { source: 'reddit', band: 'hot' },
      },
    })
    expect(supabase.tables.autonomy_jobs[1]).toMatchObject({
      kind: 'run_agent',
      payload: {
        agentId: 'devops',
        prompt: 'Check infra health for revenue blockers.',
        input: {
          trigger: 'hermes_operator',
          recommendationKind: 'run_devops',
          source: { source: 'infra' },
        },
      },
    })

    const accepted = supabase.tables.hermes_operator_recommendations.filter(
      (row) => row.status === 'accepted'
    )
    const stillOpen = supabase.tables.hermes_operator_recommendations.filter(
      (row) => row.status === 'open'
    )

    expect(accepted).toHaveLength(2)
    expect(stillOpen).toHaveLength(1)
    expect(stillOpen[0]).toMatchObject({
      kind: 'run_agent',
      payload: { agentId: 'scout' },
    })
    expect(supabase.tables.hermes_operator_runs[0]).toMatchObject({
      enqueued_jobs_count: 2,
      executed_actions_count: 2,
    })
  })

  it('records blocked-by-policy recommendations and rejection reasons when caps are reached', async () => {
    const supabase = createFakeSupabase({
      user_operator_settings: [
        {
          user_id: 'user-1',
          operator_mode: 'recommend',
          notify_in_studio: true,
          max_auto_actions_per_day: 1,
          max_auto_prospect_runs_per_day: 1,
          max_auto_follow_up_scans_per_day: 1,
          max_auto_devops_runs_per_day: 1,
        },
      ],
      hermes_operator_recommendations: [
        {
          id: 'old-rec-1',
          run_id: 'old-run',
          user_id: 'user-1',
          kind: 'run_prospect',
          priority: 80,
          title: 'Earlier prospect run',
          detail: 'Counts toward daily caps.',
          action_type: 'run_agent',
          risk_level: 'low',
          status: 'accepted',
          created_at: '2026-05-28T08:00:00.000Z',
          updated_at: '2026-05-28T08:00:00.000Z',
        },
      ],
    })

    const result = await runHermesOperatorTick({
      supabase: supabase as never,
      userId: 'user-1',
      mode: 'recommend',
      now: new Date('2026-05-28T10:15:00.000Z'),
      buildContext: async () => fakeContext,
      runEngine: async () => ({
        summary: 'Try another prospect run.',
        recommendations: [
          {
            kind: 'run_prospect',
            priority: 95,
            title: 'Run Prospect again',
            detail: 'Another hot segment pass.',
            actionType: 'run_agent',
            riskLevel: 'low',
            source: { source: 'reddit', band: 'hot' },
            payload: {
              agentId: 'prospect',
              prompt: 'Generate one more prospect.',
            },
          },
        ],
        alerts: [],
        provider: 'hermes',
        model: 'hermes3:8b',
        fallbackTriggered: false,
      }),
    })

    expect(result).toMatchObject({
      status: 'completed',
      mode: 'recommend',
      recommendationsCount: 1,
      alertsCount: 2,
    })
    expect(supabase.tables.autonomy_jobs).toHaveLength(0)
    const blockedRecommendation = supabase.tables.hermes_operator_recommendations.find(
      (row) => row.title === 'Run Prospect again'
    )
    expect(blockedRecommendation).toMatchObject({
      status: 'open',
      policy_block_reason: 'daily_cap_reached',
      auto_execution_eligible: true,
    })
    expect(supabase.tables.hermes_operator_runs.at(-1)).toMatchObject({
      blocked_by_policy_count: 1,
      blocked_by_policy_reason_counts: {
        daily_cap_reached: 1,
      },
    })
  })

  it('falls back to a heuristic run when Hermes execution crashes', async () => {
    const supabase = createFakeSupabase()

    const result = await runHermesOperatorTick({
      supabase: supabase as never,
      userId: 'user-1',
      buildContext: async () => fakeContext,
      runEngine: async () => {
        throw new Error('Hermes unavailable')
      },
    })

    expect(supabase.tables.hermes_operator_runs).toHaveLength(1)
    expect(result).toMatchObject({
      status: 'completed',
      alertsCount: 3,
      fallbackTriggered: true,
    })
    expect(supabase.tables.hermes_operator_runs[0]).toMatchObject({
      user_id: 'user-1',
      mode: 'observe',
      status: 'completed',
      model_family: 'hermes',
      summary: expect.stringContaining('Hermes fallback mode.'),
      last_error: null,
    })
    expect(supabase.tables.hermes_operator_recommendations).toHaveLength(0)
    expect(supabase.tables.business_alerts.map((row) => row.category)).toContain(
      'execution_hermes_fallback'
    )
  })

  it('inherits operator settings mode when no explicit mode is passed to the tick', async () => {
    const supabase = createFakeSupabase({
      user_operator_settings: [
        {
          user_id: 'user-1',
          operator_mode: 'recommend',
          notify_in_studio: true,
          notification_mode: 'studio_only',
          max_auto_actions_per_day: 6,
          max_auto_prospect_runs_per_day: 3,
          max_auto_follow_up_scans_per_day: 2,
          max_auto_devops_runs_per_day: 1,
        },
      ],
    })

    await runHermesOperatorTick({
      supabase: supabase as never,
      userId: 'user-1',
      now: new Date('2026-05-28T09:00:00.000Z'),
      buildContext: async () => fakeContext,
      runEngine: async ({ mode }) => ({
        summary: `mode=${mode}`,
        recommendations: [],
        alerts: [],
        provider: 'hermes',
        model: 'hermes3:8b',
        fallbackTriggered: false,
      }),
    })

    expect(supabase.tables.hermes_operator_runs[0]).toMatchObject({
      user_id: 'user-1',
      mode: 'recommend',
      status: 'completed',
      summary: 'mode=recommend',
    })
  })
})
