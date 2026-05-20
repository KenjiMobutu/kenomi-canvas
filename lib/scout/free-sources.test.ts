import { describe, expect, it } from 'vitest'
import {
  buildScoutSourceStatuses,
  buildScoutSourceBrief,
  collectFreeScoutSignals,
  FREE_SCOUT_SOURCES,
} from './free-sources'

describe('FREE_SCOUT_SOURCES', () => {
  it('priorise les sources gratuites utiles au Scout revenu-first', () => {
    expect(FREE_SCOUT_SOURCES.slice(0, 5).map((source) => source.id)).toEqual([
      'reddit',
      'hacker-news',
      'github',
      'npm',
      'stack-exchange',
    ])
    expect(FREE_SCOUT_SOURCES.every((source) => source.cost === 'free')).toBe(true)
  })
})

describe('collectFreeScoutSignals', () => {
  it('normalise les signaux gratuits en opportunités scorées', async () => {
    const fetchImpl = async (url: string): Promise<Response> => {
      if (url.includes('hn.algolia.com')) {
        return new Response(
          JSON.stringify({
            hits: [
              {
                title: 'Ask HN: Best tool to reconcile Stripe revenue?',
                url: 'https://news.ycombinator.com/item?id=1',
                points: 120,
                num_comments: 44,
                created_at: '2026-05-20T00:00:00.000Z',
              },
            ],
          })
        )
      }

      if (url.includes('registry.npmjs.org')) {
        return new Response(
          JSON.stringify({
            objects: [
              {
                package: {
                  name: 'stripe-reconcile',
                  description: 'Reconcile Stripe payments and invoices',
                  links: { npm: 'https://www.npmjs.com/package/stripe-reconcile' },
                },
                score: { final: 0.74 },
              },
            ],
          })
        )
      }

      return new Response(JSON.stringify({ items: [] }))
    }

    const result = await collectFreeScoutSignals({
      query: 'stripe revenue reconciliation',
      fetchImpl,
      now: () => new Date('2026-05-20T08:00:00.000Z'),
    })

    expect(result.signals.map((signal) => signal.sourceId)).toEqual(['hacker-news', 'npm'])
    expect(result.signals[0]).toMatchObject({
      sourceLabel: 'Hacker News',
      title: 'Ask HN: Best tool to reconcile Stripe revenue?',
      signalType: 'pain',
      sellableOffer: {
        buyer: expect.any(String),
        urgentPain: expect.any(String),
        concretePromise: expect.any(String),
        offer: expect.any(String),
        priceHypothesisEur: expect.any(Number),
        acquisitionChannel: expect.any(String),
        landingAngle: expect.any(String),
        evidenceUrl: 'https://news.ycombinator.com/item?id=1',
      },
    })
    expect(result.signals[0].score).toBeGreaterThan(result.signals[1].score)
  })
})

describe('buildScoutSourceBrief', () => {
  it('produit un brief actionnable pour durcir le Scout', () => {
    const brief = buildScoutSourceBrief({
      generatedAt: '2026-05-20T08:00:00.000Z',
      signals: [
        {
          sourceId: 'hacker-news',
          sourceLabel: 'Hacker News',
          signalType: 'pain',
          title: 'Ask HN: Best tool to reconcile Stripe revenue?',
          url: 'https://news.ycombinator.com/item?id=1',
          score: 86,
          evidence: '120 points, 44 commentaires',
          sellableOffer: {
            buyer: 'Finance ops teams using Stripe',
            urgentPain: 'Stripe revenue reconciliation is slow and error-prone',
            concretePromise: 'Reconcile Stripe revenue discrepancies before month-end close',
            offer: 'Stripe revenue reconciliation assistant',
            priceHypothesisEur: 79,
            acquisitionChannel: 'Hacker News founder discussions',
            landingAngle: 'Close Stripe revenue faster with fewer manual checks',
            evidenceUrl: 'https://news.ycombinator.com/item?id=1',
          },
        },
      ],
      failures: [],
    })

    expect(brief).toContain('Sources gratuites Scout')
    expect(brief).toContain('Hacker News')
    expect(brief).toContain('buyer_likelihood')
    expect(brief).toContain('scale/cut')
  })
})

describe('buildScoutSourceStatuses', () => {
  it('rend les sources vérifiables pour Settings sans confondre token requis et panne', () => {
    const statuses = buildScoutSourceStatuses({
      generatedAt: '2026-05-20T08:00:00.000Z',
      signals: [
        {
          sourceId: 'hacker-news',
          sourceLabel: 'Hacker News',
          signalType: 'pain',
          title: 'Ask HN: Best tool to reconcile Stripe revenue?',
          url: 'https://news.ycombinator.com/item?id=1',
          score: 86,
          evidence: '120 points, 44 commentaires',
          sellableOffer: {
            buyer: 'Finance ops teams using Stripe',
            urgentPain: 'Stripe revenue reconciliation is slow and error-prone',
            concretePromise: 'Reconcile Stripe revenue discrepancies before month-end close',
            offer: 'Stripe revenue reconciliation assistant',
            priceHypothesisEur: 79,
            acquisitionChannel: 'Hacker News founder discussions',
            landingAngle: 'Close Stripe revenue faster with fewer manual checks',
            evidenceUrl: 'https://news.ycombinator.com/item?id=1',
          },
        },
      ],
      failures: [{ sourceId: 'reddit', reason: 'HTTP 403' }],
    })

    expect(statuses.summary).toEqual({ live: 1, degraded: 1, configRequired: 1, planned: 6 })
    expect(statuses.sources.find((source) => source.id === 'hacker-news')).toMatchObject({
      status: 'live',
      signalCount: 1,
      topSignal: 'Ask HN: Best tool to reconcile Stripe revenue?',
    })
    expect(statuses.sources.find((source) => source.id === 'reddit')).toMatchObject({
      status: 'degraded',
      lastError: 'HTTP 403',
    })
    expect(statuses.sources.find((source) => source.id === 'product-hunt')).toMatchObject({
      status: 'config_required',
      lastError: 'Token API requis avant activation live.',
    })
  })
})
