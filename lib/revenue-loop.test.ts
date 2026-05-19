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

  it('remonte la configuration Stripe manquante quand un checkout échoue sans clé', () => {
    const snapshot = buildRevenueLoopSnapshot({
      pipelines: [basePipeline],
      ventures: [{ id: 'venture-1', name: 'InboxPulse', stage: 'payment', mrr: '0' }],
      payments: [],
      campaignDrafts: [],
      autonomyActions: [
        {
          id: 'action-stripe-missing',
          venture_id: 'venture-1',
          action_type: 'create_checkout',
          status: 'failed',
          output: { error: 'STRIPE_SECRET_KEY missing' },
          created_at: '2026-05-19T18:50:00.000Z',
        },
      ],
      approvals: [],
      decisions: [],
    })

    expect(snapshot.summary.blockedLoops).toBe(1)
    expect(snapshot.summary.recommendedAction).toMatchObject({
      type: 'configure_stripe',
      ventureName: 'InboxPulse',
      reason: 'Clé Stripe manquante',
    })
    expect(snapshot.loops[0].nextAction).toMatchObject({
      type: 'configure_stripe',
      label: 'Configurer Stripe',
      pipelineId: 'pipe-1',
    })
    expect(snapshot.loops[0].stages).toContainEqual({
      key: 'checkout',
      label: 'Checkout',
      status: 'blocked',
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

  it("ne compte pas un checkout trial a 0 EUR comme revenu encaisse", () => {
    const snapshot = buildRevenueLoopSnapshot({
      pipelines: [{ ...basePipeline, marketing_output: '{}' }],
      ventures: [{ id: 'venture-1', name: 'InboxPulse', stage: 'marketing', mrr: '29' }],
      payments: [
        {
          id: 'payment-trial',
          venture_id: 'venture-1',
          status: 'completed',
          provider_status: 'completed',
          amount_eur: 29,
          expected_amount_eur: 29,
          collected_amount_eur: 0,
          trial_days: 7,
          checkout_url: 'https://checkout.stripe.test/session',
          created_at: '2026-05-18T11:00:00.000Z',
        },
      ],
      campaignDrafts: [],
      autonomyActions: [],
      approvals: [],
      decisions: [],
    })

    expect(snapshot.summary.revenueEur).toBe(0)
    expect(snapshot.summary.paidPayments).toBe(0)
    expect(snapshot.agentRevenueAttribution).toEqual([])
    expect(snapshot.loops[0].blockedRevenueEur).toBe(29)
  })

  it('priorise la prochaine action qui débloque le revenu le plus directement', () => {
    const snapshot = buildRevenueLoopSnapshot({
      pipelines: [
        {
          ...basePipeline,
          id: 'pipe-payment-ready',
          venture_id: 'venture-ready',
          idea_title: 'ReadyMoney',
        },
        {
          ...basePipeline,
          id: 'pipe-needs-builder',
          venture_id: 'venture-builder',
          idea_title: 'SlowMoney',
          builder_output: null,
          payment_output: null,
        },
      ],
      ventures: [
        { id: 'venture-ready', name: 'ReadyMoney', stage: 'payment', mrr: '0' },
        { id: 'venture-builder', name: 'SlowMoney', stage: 'build', mrr: '0' },
      ],
      payments: [],
      campaignDrafts: [],
      autonomyActions: [],
      approvals: [],
      decisions: [],
    })

    expect(snapshot.summary.blockedRevenueEur).toBe(29)
    expect(snapshot.summary.recommendedAction).toMatchObject({
      type: 'create_checkout',
      ventureId: 'venture-ready',
      ventureName: 'ReadyMoney',
      blockedRevenueEur: 29,
      reason: 'Checkout Stripe manquant',
    })
    expect(snapshot.loops.map((loop) => loop.ventureName)).toEqual(['ReadyMoney', 'SlowMoney'])
  })

  it('place une approval revenue en tête même si une autre boucle est plus récente', () => {
    const snapshot = buildRevenueLoopSnapshot({
      pipelines: [
        {
          ...basePipeline,
          id: 'pipe-new',
          venture_id: 'venture-new',
          idea_title: 'NewLoop',
          created_at: '2026-05-18T12:00:00.000Z',
          updated_at: '2026-05-18T12:00:00.000Z',
        },
        {
          ...basePipeline,
          id: 'pipe-approval',
          venture_id: 'venture-approval',
          idea_title: 'BlockedCheckout',
          created_at: '2026-05-18T08:00:00.000Z',
          updated_at: '2026-05-18T08:00:00.000Z',
        },
      ],
      ventures: [
        { id: 'venture-new', name: 'NewLoop', stage: 'payment', mrr: '0' },
        { id: 'venture-approval', name: 'BlockedCheckout', stage: 'payment', mrr: '0' },
      ],
      payments: [],
      campaignDrafts: [],
      autonomyActions: [
        {
          id: 'action-approval',
          venture_id: 'venture-approval',
          action_type: 'create_checkout',
          status: 'blocked',
          created_at: '2026-05-18T08:05:00.000Z',
        },
      ],
      approvals: [
        {
          id: 'approval-approval',
          action_id: 'action-approval',
          status: 'pending',
          reason: 'Création Stripe Checkout en production',
          created_at: '2026-05-18T08:06:00.000Z',
        },
      ],
      decisions: [],
    })

    expect(snapshot.loops[0].ventureName).toBe('BlockedCheckout')
    expect(snapshot.summary.recommendedAction).toMatchObject({
      type: 'resolve_approval',
      ventureName: 'BlockedCheckout',
      actionType: 'create_checkout',
      priorityScore: 100,
    })
  })
})
