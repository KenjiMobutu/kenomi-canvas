import { describe, expect, it } from 'vitest'
import {
  evaluateVentureCommerceReadiness,
  getNextCommercialRepairAction,
} from './venture-commerce-readiness'

describe('venture commerce readiness', () => {
  it('marks a validated venture ready only when it owns a slug, landing, payment config, and checkout', () => {
    const readiness = evaluateVentureCommerceReadiness({
      venture: {
        id: 'venture-1',
        name: 'NoteFast',
        slug: 'notefast',
        stage: 'launch',
        statut: 'actif',
      },
      landingPages: [
        {
          venture_id: 'venture-1',
          statut: 'deployed',
          health_status: 'ready',
        },
      ],
      pipelines: [
        {
          venture_id: 'venture-1',
          payment_output: JSON.stringify({
            product_name: 'NoteFast',
            price_amount: 1999,
            price_currency: 'eur',
            billing: 'one_time',
            checkout_description: 'Notes actionnables',
            trial_days: 0,
          }),
        },
      ],
      payments: [
        {
          venture_id: 'venture-1',
          checkout_url: 'https://checkout.stripe.test/session',
          provider_status: 'ready',
        },
      ],
    })

    expect(readiness).toEqual({
      status: 'ready',
      reasons: [],
      hasSlug: true,
      hasLanding: true,
      hasPaymentConfig: true,
      hasCheckout: true,
    })
  })

  it('returns ordered repair reasons and starts with landing before payment', () => {
    const readiness = evaluateVentureCommerceReadiness({
      venture: {
        id: 'venture-2',
        name: 'InvoicePilot',
        slug: null,
        stage: 'validation',
        statut: 'actif',
      },
      landingPages: [],
      pipelines: [],
      payments: [],
    })

    expect(readiness.status).toBe('repair_required')
    expect(readiness.reasons).toEqual([
      'missing_slug',
      'missing_landing',
      'missing_payment_config',
      'missing_checkout',
    ])
    expect(getNextCommercialRepairAction({ ventureName: 'InvoicePilot', readiness })).toEqual({
      id: 'run-builder',
      label: 'Créer landing',
      detail: 'Venture validée sans landing publique dédiée pour InvoicePilot.',
      href: '/studio/agents',
      agentId: 'builder',
      tone: 'warn',
    })
  })

  it('requires checkout creation after payment config exists', () => {
    const readiness = evaluateVentureCommerceReadiness({
      venture: {
        id: 'venture-3',
        name: 'ClientBrief',
        slug: 'clientbrief',
        stage: 'build',
        statut: 'actif',
      },
      landingPages: [
        {
          venture_id: 'venture-3',
          statut: 'deployed',
          health_status: 'ready',
        },
      ],
      pipelines: [{ venture_id: 'venture-3', payment_output: '{"price_amount":1999}' }],
      payments: [],
    })

    expect(getNextCommercialRepairAction({ ventureName: 'ClientBrief', readiness })).toEqual({
      id: 'create-checkout',
      label: 'Créer checkout',
      detail: 'Payment agent prêt, mais aucun checkout Stripe dédié.',
      href: '/studio/revenue',
      tone: 'warn',
    })
  })
})
