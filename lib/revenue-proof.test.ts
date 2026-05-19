import { describe, expect, it } from 'vitest'
import {
  buildRevenueProofAudit,
  buildRevenueVentureDecisionPatch,
  deriveRevenueRoiDecision,
} from './revenue-proof'

describe('deriveRevenueRoiDecision', () => {
  it('recommande scale quand le ROI acquisition est positif', () => {
    expect(
      deriveRevenueRoiDecision({
        revenueCents: 2900,
        spendCents: 500,
        roi: 4.8,
        recommendedBudgetEur: 15,
      })
    ).toMatchObject({ decision: 'scale', ventureDecision: 'scale' })
  })

  it('recommande cut quand il y a du spend sans revenu', () => {
    expect(
      deriveRevenueRoiDecision({
        revenueCents: 0,
        spendCents: 1200,
        roi: -1,
        recommendedBudgetEur: 0,
      })
    ).toMatchObject({ decision: 'cut', ventureDecision: 'stop' })
  })

  it('recommande hold sans signal assez dur', () => {
    expect(
      deriveRevenueRoiDecision({
        revenueCents: 0,
        spendCents: 0,
        roi: 0,
        recommendedBudgetEur: 0,
      })
    ).toMatchObject({ decision: 'hold', ventureDecision: 'continue' })
  })
})

describe('buildRevenueVentureDecisionPatch', () => {
  it("n'ecrit que les colonnes venture disponibles en production", () => {
    const patch = buildRevenueVentureDecisionPatch({
      roiDecision: {
        decision: 'cut',
        ventureDecision: 'stop',
        reason: 'Spend engagé sans revenu attribué.',
      },
      nowIso: '2026-05-19T20:00:00.000Z',
    })

    expect(patch).toEqual({
      current_decision: 'stop',
      last_decision_at: '2026-05-19T20:00:00.000Z',
      next_action: 'Valider le cut avant arrêt ou pivot.',
    })
    expect(patch).not.toHaveProperty('updated_at')
  })
})

describe('buildRevenueProofAudit', () => {
  it('rend visible toute la boucle revenue-first quand les signaux existent', () => {
    const audit = buildRevenueProofAudit({
      payments: [{ status: 'completed', checkout_url: 'https://checkout.stripe.com/c/test' }],
      campaignDrafts: [{ status: 'published', published_at: '2026-05-19T10:00:00.000Z' }],
      events: [
        { event_type: 'campaign_published', value: null },
        { event_type: 'page_view', value: null },
        { event_type: 'waitlist_signup', value: null },
        { event_type: 'campaign_spend', value: 500 },
        { event_type: 'payment_succeeded', value: 2900 },
      ],
      actions: [
        { action_type: 'create_checkout', status: 'completed' },
        { action_type: 'publish_campaign', status: 'completed' },
        { action_type: 'scale_budget', status: 'completed' },
      ],
      approvals: [{ status: 'approved' }],
      acquisition: {
        summary: {
          revenueCents: 2900,
          spendCents: 500,
          profitCents: 2400,
          roi: 4.8,
          recommendedBudgetEur: 15,
        },
        channels: [],
        campaigns: [],
      },
      latestDecision: { decision: 'scale' },
    })

    expect(audit.roiDecision.decision).toBe('scale')
    expect(audit.stages.map((stage) => [stage.key, stage.status])).toEqual([
      ['checkout_created', 'done'],
      ['approval_resolved', 'done'],
      ['payment_succeeded', 'done'],
      ['campaign_published', 'done'],
      ['tracking_collected', 'done'],
      ['roi_calculated', 'done'],
      ['decision_recorded', 'done'],
      ['execution_audited', 'done'],
    ])
  })
})
