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
  it('passe à la distribution quand Payment a produit une offre vendable pour la landing publique', () => {
    const snapshot = buildRevenueLoopSnapshot({
      pipelines: [basePipeline],
      ventures: [
        { id: 'venture-1', name: 'InboxPulse', slug: 'inboxpulse', stage: 'payment', mrr: '0' },
      ],
      payments: [],
      campaignDrafts: [],
      autonomyActions: [],
      approvals: [],
      decisions: [],
    })

    expect(snapshot.summary.readyCheckouts).toBe(1)
    expect(snapshot.summary.revenueEur).toBe(0)
    expect(snapshot.loops[0].publicLandingUrl).toBe('/inboxpulse')
    expect(snapshot.loops[0].nextAction).toMatchObject({
      type: 'run_agent',
      agentId: 'marketing',
      label: 'Lancer Marketing',
      ventureId: 'venture-1',
    })
    expect(snapshot.loops[0].stages.map((stage) => [stage.key, stage.status])).toContainEqual([
      'payment',
      'done',
    ])
  })

  it('bloque une venture validée sans landing dédiée avant de créer le checkout', () => {
    const snapshot = buildRevenueLoopSnapshot({
      pipelines: [basePipeline],
      ventures: [
        {
          id: 'venture-1',
          name: 'InboxPulse',
          slug: 'inboxpulse',
          stage: 'launch',
          statut: 'actif',
          mrr: '0',
        },
      ],
      landingPages: [],
      payments: [],
      campaignDrafts: [],
      autonomyActions: [],
      approvals: [],
      decisions: [],
    })

    expect(snapshot.loops[0].stages).toContainEqual({
      key: 'landing',
      label: 'Landing',
      status: 'blocked',
    })
    expect(snapshot.loops[0].nextAction).toMatchObject({
      type: 'run_agent',
      agentId: 'builder',
      label: 'Créer landing dédiée',
    })
    expect(snapshot.summary.recommendedAction).toMatchObject({
      reason: 'Landing dédiée manquante',
    })
  })

  it('demande de régénérer la copy de vente quand la landing publique existe mais ne convertira pas', () => {
    const snapshot = buildRevenueLoopSnapshot({
      pipelines: [basePipeline],
      ventures: [
        {
          id: 'venture-1',
          name: 'InboxPulse',
          slug: 'inboxpulse',
          stage: 'launch',
          statut: 'actif',
          mrr: '0',
        },
      ],
      landingPages: [
        {
          venture_id: 'venture-1',
          statut: 'deployed',
          health_status: 'repair_required',
          health_reasons: ['missing_price_anchor', 'missing_objection_handling'],
        },
      ],
      payments: [],
      campaignDrafts: [],
      autonomyActions: [],
      approvals: [],
      decisions: [],
    })

    expect(snapshot.loops[0].stages).toContainEqual({
      key: 'landing',
      label: 'Landing',
      status: 'blocked',
    })
    expect(snapshot.loops[0].nextAction).toMatchObject({
      type: 'run_agent',
      agentId: 'builder',
      label: 'Regenerer copy de vente',
    })
  })

  it('bloque une venture validée sans système de paiement dédié après la landing', () => {
    const snapshot = buildRevenueLoopSnapshot({
      pipelines: [{ ...basePipeline, payment_output: null }],
      ventures: [
        {
          id: 'venture-1',
          name: 'InboxPulse',
          slug: 'inboxpulse',
          stage: 'launch',
          statut: 'actif',
          mrr: '0',
        },
      ],
      landingPages: [
        {
          venture_id: 'venture-1',
          statut: 'deployed',
          health_status: 'ready',
        },
      ],
      payments: [],
      campaignDrafts: [],
      autonomyActions: [],
      approvals: [],
      decisions: [],
    })

    expect(snapshot.loops[0].stages).toContainEqual({
      key: 'payment',
      label: 'Payment',
      status: 'blocked',
    })
    expect(snapshot.loops[0].nextAction).toMatchObject({
      type: 'run_agent',
      agentId: 'payment',
      label: 'Créer paiement dédié',
    })
  })

  it('ignore les approvals legacy create_checkout dans la boucle revenue publique', () => {
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
    expect(snapshot.summary.blockedLoops).toBe(0)
    expect(snapshot.loops[0].nextAction).toMatchObject({
      type: 'run_agent',
      agentId: 'marketing',
      ventureId: 'venture-1',
    })
  })

  it('ignore un failed create_checkout legacy quand la landing publique reste la surface canonique', () => {
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

    expect(snapshot.summary.blockedLoops).toBe(0)
    expect(snapshot.loops[0].nextAction).toMatchObject({
      type: 'run_agent',
      agentId: 'marketing',
      ventureId: 'venture-1',
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

  it('ne compte pas un checkout trial a 0 EUR comme revenu encaisse', () => {
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
      type: 'run_agent',
      agentId: 'marketing',
      ventureId: 'venture-ready',
      ventureName: 'ReadyMoney',
      blockedRevenueEur: 29,
      reason: 'Distribution manquante',
    })
    expect(snapshot.loops.map((loop) => loop.ventureName)).toEqual(['ReadyMoney', 'SlowMoney'])
  })

  it('ne laisse plus une approval legacy create_checkout prendre la tête sur une boucle active', () => {
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

    expect(snapshot.loops[0].ventureName).toBe('NewLoop')
    expect(snapshot.summary.recommendedAction).toMatchObject({
      type: 'run_agent',
      ventureName: 'NewLoop',
      agentId: 'marketing',
    })
  })
})
