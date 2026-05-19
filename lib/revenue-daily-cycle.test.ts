import { describe, expect, it } from 'vitest'
import { buildRevenueDailyCycleAudit } from './revenue-daily-cycle'
import { buildAcquisitionRoi } from './metrics/acquisition-roi'
import type { RevenueAutopilotPlan } from './revenue-autopilot'

const plan: RevenueAutopilotPlan = {
  mode: 'approval_required',
  generatedAt: '2026-05-19T08:00:00.000Z',
  revenueEur: 29,
  blockedRevenueEur: 0,
  steps: [
    {
      kind: 'scale_budget',
      execution: 'approval',
      risk: 'high',
      ventureId: 'venture-1',
      label: 'Proposer scale budget',
      reason: 'ROI positif',
      blockedRevenueEur: 0,
      recommendedBudgetEur: 25,
    },
  ],
}

describe('buildRevenueDailyCycleAudit', () => {
  it('rend visible la boucle acquisition -> Stripe -> ROI -> approval risquée', () => {
    const events = [
      {
        venture_id: 'venture-1',
        event_type: 'campaign_published',
        value: null,
        occurred_at: '2026-05-18T09:00:00.000Z',
        metadata: { channel: 'email', draft_id: 'draft-1' },
      },
      {
        venture_id: 'venture-1',
        event_type: 'campaign_spend',
        value: 500,
        occurred_at: '2026-05-18T09:01:00.000Z',
        metadata: { channel: 'email', draft_id: 'draft-1' },
      },
      {
        venture_id: 'venture-1',
        event_type: 'payment_succeeded',
        value: 2900,
        occurred_at: '2026-05-18T10:00:00.000Z',
        metadata: {},
      },
    ]
    const cycle = buildRevenueDailyCycleAudit({
      plan,
      acquisition: buildAcquisitionRoi(events),
      events,
      actions: [
        {
          id: 'action-scale',
          action_type: 'scale_budget',
          risk_level: 'high',
          status: 'blocked',
        },
      ],
      approvals: [{ id: 'approval-scale', action_id: 'action-scale', status: 'pending' }],
      decisions: [{ decision: 'continue', created_at: '2026-05-18T10:05:00.000Z' }],
      executed: [],
      now: new Date('2026-05-19T08:00:00.000Z'),
    })

    expect(cycle.mode).toBe('attention')
    expect(cycle.summary).toMatchObject({
      revenueEur: 29,
      spendEur: 5,
      profitEur: 24,
      recommendedBudgetEur: 15,
      pendingApprovalCount: 1,
    })
    expect(cycle.stages.map((stage) => [stage.key, stage.status])).toEqual([
      ['autopilot_daily', 'blocked'],
      ['campaign_published', 'done'],
      ['tracking_events', 'done'],
      ['stripe_payment', 'done'],
      ['roi_calculated', 'done'],
      ['decision_scale_cut', 'done'],
      ['approval_risk', 'blocked'],
      ['execution', 'blocked'],
    ])
  })

  it('marque une exécution automatique low-risk comme calme quand rien ne bloque', () => {
    const cycle = buildRevenueDailyCycleAudit({
      plan: {
        ...plan,
        mode: 'execute',
        steps: [{ ...plan.steps[0], kind: 'run_agent', execution: 'auto', risk: 'low' }],
      },
      acquisition: buildAcquisitionRoi([]),
      events: [],
      actions: [
        { id: 'run-action', action_type: 'run_agent', risk_level: 'low', status: 'completed' },
      ],
      approvals: [],
      decisions: [],
      executed: [{ status: 'executed', actionType: 'run_agent' }],
      now: new Date('2026-05-19T08:00:00.000Z'),
    })

    expect(cycle.mode).toBe('calm')
    expect(cycle.stages.find((stage) => stage.key === 'autopilot_daily')).toMatchObject({
      status: 'done',
    })
    expect(cycle.stages.find((stage) => stage.key === 'execution')).toMatchObject({
      status: 'done',
    })
  })
})
