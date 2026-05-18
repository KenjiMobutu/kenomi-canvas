import { describe, expect, it } from 'vitest'
import {
  aggregateVentureMetrics,
  buildDecisionMetricsContext,
  buildVentureMetricSnapshots,
  type VentureMetricEvent,
  type VentureMetricSourceRow,
} from './venture-metrics'

describe('aggregateVentureMetrics', () => {
  it('calcule visites, signups, revenus, coûts, profit et ROI', () => {
    const events: VentureMetricEvent[] = [
      { event_type: 'page_view', value: null },
      { event_type: 'page_view', value: null },
      { event_type: 'waitlist_signup', value: null },
      { event_type: 'payment_succeeded', value: 2900 },
      { event_type: 'campaign_spend', value: 500 },
    ]

    expect(aggregateVentureMetrics(events)).toEqual({
      visits: 2,
      signups: 1,
      signupRate: 0.5,
      revenueCents: 2900,
      spendCents: 500,
      profitCents: 2400,
      roi: 4.8,
    })
  })

  it('retourne des zéros sûrs sans événements', () => {
    expect(aggregateVentureMetrics([])).toEqual({
      visits: 0,
      signups: 0,
      signupRate: 0,
      revenueCents: 0,
      spendCents: 0,
      profitCents: 0,
      roi: 0,
    })
  })

  it('évite les divisions par zéro quand aucun coût n’est connu', () => {
    const metrics = aggregateVentureMetrics([
      { event_type: 'payment_succeeded', value: 2900 },
    ])

    expect(metrics.roi).toBe(0)
    expect(metrics.profitCents).toBe(2900)
  })
})

describe('buildVentureMetricSnapshots', () => {
  it('groupe les événements par venture et conserve les ventures sans événement', () => {
    const ventures = [
      { id: 'venture-1', name: 'Inbox Pulse', slug: 'inbox-pulse' },
      { id: 'venture-2', name: 'Quiet CRM', slug: 'quiet-crm' },
    ]
    const events: VentureMetricSourceRow[] = [
      { venture_id: 'venture-1', event_type: 'page_view', value: null },
      { venture_id: 'venture-1', event_type: 'waitlist_signup', value: null },
      { venture_id: 'venture-1', event_type: 'payment_succeeded', value: 2900 },
    ]

    expect(buildVentureMetricSnapshots(ventures, events)).toEqual([
      {
        ventureId: 'venture-1',
        name: 'Inbox Pulse',
        slug: 'inbox-pulse',
        metrics: {
          visits: 1,
          signups: 1,
          signupRate: 1,
          revenueCents: 2900,
          spendCents: 0,
          profitCents: 2900,
          roi: 0,
        },
      },
      {
        ventureId: 'venture-2',
        name: 'Quiet CRM',
        slug: 'quiet-crm',
        metrics: {
          visits: 0,
          signups: 0,
          signupRate: 0,
          revenueCents: 0,
          spendCents: 0,
          profitCents: 0,
          roi: 0,
        },
      },
    ])
  })
})

describe('buildDecisionMetricsContext', () => {
  it('résume les métriques de venture pour un prompt Decision', () => {
    const context = buildDecisionMetricsContext({
      visits: 20,
      signups: 5,
      signupRate: 0.25,
      revenueCents: 5800,
      spendCents: 1000,
      profitCents: 4800,
      roi: 4.8,
    })

    expect(context).toContain('Visites : 20')
    expect(context).toContain('Taux signup : 25.0%')
    expect(context).toContain('Revenu : 58.00 EUR')
    expect(context).toContain('ROI : 4.80')
  })
})
