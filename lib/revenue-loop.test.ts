import { describe, expect, it } from 'vitest'
import { buildRevenueLoopSnapshot } from './revenue-loop'

const basePipeline = {
  id: 'pipe-1',
  user_id: 'user-1',
  venture_id: 'venture-1',
  idea_title: 'InboxPulse',
  status: 'approved',
  validation_output: '{}',
  builder_output: '{}',
  payment_output: JSON.stringify({
    product_name: 'InboxPulse',
    price_amount: 2900,
    price_currency: 'eur',
    billing: 'monthly',
    checkout_description: 'Scoring IA des leads email.',
    trial_days: 7,
  }),
  marketing_output: null,
  decision_output: null,
  created_at: '2026-05-18T09:00:00.000Z',
  updated_at: '2026-05-18T10:00:00.000Z',
}

describe('buildRevenueLoopSnapshot', () => {
  it('demande la création du checkout quand Payment a produit une offre mais aucun checkout existe', () => {
    const snapshot = buildRevenueLoopSnapshot({
      pipelines: [basePipeline],
      ventures: [{ id: 'venture-1', name: 'InboxPulse', stage: 'payment', mrr: '0' }],
      payments: [],
      campaignDrafts: [],
      autonomyActions: [],
      approvals: [],
      decisions: [],
    })

    expect(snapshot.summary.readyCheckouts).toBe(1)
    expect(snapshot.summary.revenueEur).toBe(0)
    expect(snapshot.loops[0].nextAction).toMatchObject({
      type: 'create_checkout',
      label: 'Créer le checkout Stripe',
      ventureId: 'venture-1',
    })
    expect(snapshot.loops[0].stages.map((stage) => [stage.key, stage.status])).toContainEqual([
      'payment',
      'done',
    ])
  })

  it('met en avant une approval bloquante avant toute autre action', () => {
    const snapshot = buildRevenueLoopSnapshot({
      pipelines: [basePipeline],
      ventures: [{ id: 'venture-1', name: 'InboxPulse', stage: 'payment', mrr: '0' }],
      payments: [],
      campaignDrafts: [],
      autonomyActions: [
        {
          id: 'action-1',
          venture_id: 'venture-1',
          action_type: 'create_checkout',
          status: 'blocked',
          created_at: '2026-05-18T10:01:00.000Z',
        },
      ],
      approvals: [
        {
          id: 'approval-1',
          action_id: 'action-1',
          status: 'pending',
          reason: 'Création Stripe Checkout en production',
          created_at: '2026-05-18T10:02:00.000Z',
        },
      ],
      decisions: [],
    })

    expect(snapshot.summary.pendingApprovals).toBe(1)
    expect(snapshot.summary.blockedLoops).toBe(1)
    expect(snapshot.loops[0].nextAction).toMatchObject({
      type: 'resolve_approval',
      approvalId: 'approval-1',
      actionId: 'action-1',
    })
  })

  it('attribue le revenu encaissé et demande la décision après acquisition', () => {
    const snapshot = buildRevenueLoopSnapshot({
      pipelines: [{ ...basePipeline, marketing_output: '{}' }],
      ventures: [{ id: 'venture-1', name: 'InboxPulse', stage: 'marketing', mrr: '29' }],
      payments: [
        {
          id: 'payment-1',
          venture_id: 'venture-1',
          status: 'paid',
          provider_status: 'paid',
          amount_eur: 29,
          checkout_url: 'https://checkout.stripe.test/session',
          created_at: '2026-05-18T11:00:00.000Z',
        },
      ],
      campaignDrafts: [],
      autonomyActions: [],
      approvals: [],
      decisions: [],
    })

    expect(snapshot.summary.revenueEur).toBe(29)
    expect(snapshot.agentRevenueAttribution).toEqual([
      { ventureId: 'venture-1', ventureName: 'InboxPulse', revenueEur: 29, paidPayments: 1 },
    ])
    expect(snapshot.loops[0].nextAction).toMatchObject({
      type: 'run_agent',
      agentId: 'decision',
      label: 'Lancer Decision',
    })
  })
})
