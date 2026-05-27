import { describe, expect, it } from 'vitest'
import {
  buildScoutSourceStatuses,
  buildScoutSourceBrief,
  collectFreeScoutSignals,
  buildSellableOffer,
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
      if (url.includes('reddit.com')) {
        return new Response(
          JSON.stringify({
            data: {
              children: [
                {
                  data: {
                    title: 'Need a tool to stop manual recruiting ops',
                    selftext:
                      'We are still using spreadsheets to coordinate applicants and it is slow.',
                    permalink: '/r/smallbusiness/comments/1/manual_recruiting',
                    subreddit: 'smallbusiness',
                    score: 56,
                    num_comments: 19,
                    over_18: false,
                    is_self: true,
                    created_utc: '2026-05-20T00:00:00.000Z',
                  },
                },
              ],
            },
          })
        )
      }

      return new Response(JSON.stringify({ data: { children: [] } }))
    }

    const result = await collectFreeScoutSignals({
      query: 'recruiting operations',
      fetchImpl,
      now: () => new Date('2026-05-20T08:00:00.000Z'),
    })

    expect(result.signals.map((signal) => signal.sourceId)).toEqual(['reddit'])
    expect(result.signals[0]).toMatchObject({
      sourceLabel: 'Reddit',
      title: 'Need a tool to stop manual recruiting ops',
      signalType: 'pain',
      sellableOffer: {
        buyer: expect.any(String),
        urgentPain: expect.any(String),
        concretePromise: expect.any(String),
        offer: expect.any(String),
        priceHypothesisEur: expect.any(Number),
        acquisitionChannel: 'reddit',
        landingAngle: expect.any(String),
        evidenceUrl: 'https://www.reddit.com/r/smallbusiness/comments/1/manual_recruiting',
      },
    })
  })
})

describe('buildScoutSourceBrief', () => {
  it('produit un brief actionnable pour durcir le Scout', () => {
    const brief = buildScoutSourceBrief({
      generatedAt: '2026-05-20T08:00:00.000Z',
      signals: [
        {
          sourceId: 'reddit',
          sourceLabel: 'Reddit',
          signalType: 'pain',
          title: 'Need a tool to stop manual recruiting ops',
          url: 'https://www.reddit.com/r/smallbusiness/comments/1/manual_recruiting',
          score: 86,
          evidence: 'r/smallbusiness · 56 upvotes · 19 comments',
          sellableOffer: buildSellableOffer({
            sourceId: 'reddit',
            signalType: 'pain',
            title: 'Need a tool to stop manual recruiting ops',
            url: 'https://www.reddit.com/r/smallbusiness/comments/1/manual_recruiting',
            evidence: 'r/smallbusiness · 56 upvotes · 19 comments',
          }),
        },
      ],
      failures: [],
    })

    expect(brief).toContain('Sources gratuites Scout')
    expect(brief).toContain('Reddit')
    expect(brief).toContain('buyer_likelihood')
    expect(brief).toContain('scale/cut')
    expect(brief).toContain('https://www.reddit.com/')
  })
})

describe('buildScoutSourceStatuses', () => {
  it('rend les sources vérifiables pour Settings sans confondre token requis et panne', () => {
    const statuses = buildScoutSourceStatuses({
      generatedAt: '2026-05-20T08:00:00.000Z',
      signals: [
        {
          sourceId: 'reddit',
          sourceLabel: 'Reddit',
          signalType: 'pain',
          title: 'Need a tool to stop manual recruiting ops',
          url: 'https://www.reddit.com/r/smallbusiness/comments/1/manual_recruiting',
          score: 86,
          evidence: 'r/smallbusiness · 56 upvotes · 19 comments',
          sellableOffer: buildSellableOffer({
            sourceId: 'reddit',
            signalType: 'pain',
            title: 'Need a tool to stop manual recruiting ops',
            url: 'https://www.reddit.com/r/smallbusiness/comments/1/manual_recruiting',
            evidence: 'r/smallbusiness · 56 upvotes · 19 comments',
          }),
        },
      ],
      failures: [{ sourceId: 'hacker-news', reason: 'HTTP 403' }],
    })

    expect(statuses.summary).toEqual({ live: 1, degraded: 1, configRequired: 1, planned: 6 })
    expect(statuses.sources.find((source) => source.id === 'reddit')).toMatchObject({
      status: 'live',
      signalCount: 1,
      topSignal: 'Need a tool to stop manual recruiting ops',
    })
    expect(statuses.sources.find((source) => source.id === 'hacker-news')).toMatchObject({
      status: 'degraded',
      lastError: 'HTTP 403',
    })
    expect(statuses.sources.find((source) => source.id === 'product-hunt')).toMatchObject({
      status: 'config_required',
      lastError: 'Token API requis avant activation live.',
    })
  })
})
