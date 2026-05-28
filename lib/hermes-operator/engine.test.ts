import { describe, expect, it } from 'vitest'
import { runHermesOperatorEngine } from '@/lib/hermes-operator/engine'
import type { HermesOperatorContextSnapshot } from '@/lib/hermes-operator/types'

const fakeContext: HermesOperatorContextSnapshot = {
  generatedAt: '2026-05-28T10:00:00.000Z',
  revenue: {
    conversions: {
      overview: {
        contacted: 8,
        replied: 4,
        qualifiedReplies: 3,
        meetingsBooked: 1,
        checkoutsCreated: 1,
        paid: 0,
        replyRate: 50,
        qualifiedRate: 37.5,
        closeRate: 0,
        leadToReplyHours: 9,
        replyToCloseDays: 0,
      },
      offerBreakdown: [],
      angleBreakdown: [],
      segmentOfferBreakdown: [],
      modelBreakdown: [],
      bestOffer: null,
      bestAngle: null,
      segmentRepliesNoPay: {
        key: 'reddit:hot:offer-a',
        source: 'reddit',
        band: 'hot',
        offerId: 'offer-a',
        offerName: 'Outbound Sprint',
        contacted: 4,
        replied: 4,
        qualifiedReplies: 3,
        meetingsBooked: 1,
        checkoutsCreated: 1,
        paid: 0,
        replyRate: 100,
        qualifiedRate: 75,
        closeRate: 0,
      },
      sourceClosesFastest: null,
      bestModel: null,
      commonObjections: [],
      lostReasons: [],
      repeatNext: null,
      stopNext: null,
    },
    weeklyReview: {
      window: { weekStart: '2026-05-26', weekEnd: '2026-06-01', label: '2026-05-26 → 2026-06-01' },
      bestSource: { title: 'No source truth yet', detail: 'Record more replies and wins to identify the best source.' },
      bestSegment: {
        title: 'reddit/hot · Outbound Sprint',
        detail: '4 replies · 0 won',
        source: 'reddit',
        band: 'hot',
      },
      bestOffer: { title: 'No offer truth yet', detail: 'Assign offers to prospects and record outcomes to compare offers.' },
      bestAngle: { title: 'No angle truth yet', detail: 'Tag outreach angles to learn which message converts best.' },
      topObjection: { title: 'No objection truth yet', detail: 'Classify replies to surface the main buying objection.' },
      mainLeak: { stageKey: 'meeting_to_close', title: 'Meeting → close', detail: '1 prospects lost here · 1 meetings · 0 won' },
      nextExperiment: {
        focus: 'segment',
        title: 'Fix close friction on reddit/hot',
        detail: 'Keep volume steady and test a tighter close for Outbound Sprint.',
        source: 'reddit',
        band: 'hot',
      },
    },
  },
  prospects: {
    total: 12,
    awaitingApproval: 2,
    pendingApprovals: 2,
    followUpsDue: 3,
    hotLeads: 4,
  },
  automation: {
    autonomyStatus: 'active',
    pausedReason: null,
    queuedJobs: 2,
    runningJobs: 0,
    failedJobs: 1,
  },
  infrastructure: {
    status: 'ok',
    headline: 'Infra stable',
    summary: 'No critical incident.',
    operatorNextStep: 'Keep watching deployment parity.',
    checkedAt: '2026-05-28T09:50:00.000Z',
    runtimeCommit: 'abc1234',
    servicesCount: 4,
    openIncidents: 0,
  },
}

describe('runHermesOperatorEngine', () => {
  it('returns structured recommendations and alerts from a business snapshot', async () => {
    const result = await runHermesOperatorEngine({
      context: fakeContext,
      mode: 'observe',
      llm: async () => ({
        content: JSON.stringify({
          summary: 'Replies are up but closes are stuck on reddit/hot.',
          recommendations: [
            {
              kind: 'run_follow_up_scan',
              priority: 90,
              title: 'Push follow-ups on reddit/hot',
              detail: 'Replies exist but there are no wins yet.',
              action_type: 'run_agent',
              risk_level: 'low',
              payload: { scheduleKey: 'follow_ups' },
            },
          ],
          alerts: [
            {
              severity: 'warn',
              category: 'cash_blocker',
              dedupe_key: 'cash_blocker:reddit:hot',
              headline: 'Replies without close on reddit/hot',
              detail: '4 replies, 0 wins this week.',
            },
          ],
        }),
        provider: 'hermes',
        model: 'hermes3:8b',
        fallback_triggered: false,
      }),
    })

    expect(result.summary).toContain('Replies are up')
    expect(result.recommendations).toHaveLength(1)
    expect(result.recommendations[0]).toMatchObject({
      kind: 'run_follow_up_scan',
      priority: 90,
      actionType: 'run_agent',
      riskLevel: 'low',
    })
    expect(result.alerts[0]).toMatchObject({
      category: 'cash_blocker',
      severity: 'warn',
    })
    expect(result.model).toBe('hermes3:8b')
  })
})
