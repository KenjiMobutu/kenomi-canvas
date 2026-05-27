import { describe, expect, it } from 'vitest'
import { buildSellableOffer } from './free-sources'
import { collectRedditSignals, scoreRedditCandidate, toScoutRedditSignal } from './reddit'

describe('scoreRedditCandidate', () => {
  it('boosts explicit operational pain in relevant subreddits', () => {
    const score = scoreRedditCandidate({
      title: 'Need a tool to stop our manual recruiting spreadsheet hell',
      selftext: 'We are still reconciling applicants manually every week and it is slow.',
      permalink: '/r/smallbusiness/comments/abc/test',
      subreddit: 'smallbusiness',
      score: 34,
      num_comments: 21,
      over_18: false,
      is_self: true,
      created_utc: 1,
    })

    expect(score).toBeGreaterThanOrEqual(70)
  })

  it('penalizes self-promo style posts', () => {
    const score = scoreRedditCandidate({
      title: 'I built a new SaaS, check out our promo',
      selftext: 'Launch discount available now.',
      permalink: '/r/SaaS/comments/def/test',
      subreddit: 'SaaS',
      score: 40,
      num_comments: 8,
      over_18: false,
      is_self: true,
      created_utc: 1,
    })

    expect(score).toBeLessThan(45)
  })
})

describe('toScoutRedditSignal', () => {
  it('rejects low-information or noisy posts', () => {
    const signal = toScoutRedditSignal({
      candidate: {
        title: 'Launch promo',
        selftext: '',
        permalink: '/r/SaaS/comments/ghi/test',
        subreddit: 'SaaS',
        score: 2,
        num_comments: 0,
        over_18: false,
        is_self: true,
        created_utc: 1,
      },
      buildSellableOffer,
    })

    expect(signal).toBeNull()
  })
})

describe('collectRedditSignals', () => {
  it('normalizes reddit search payloads into ranked ScoutSourceSignal rows', async () => {
    const fetchImpl = async (): Promise<Response> =>
      new Response(
        JSON.stringify({
          data: {
            children: [
              {
                data: {
                  title: 'Looking for software to stop manual recruiting ops',
                  selftext:
                    'Our team still tracks applicants in spreadsheets and coordination is slow.',
                  permalink: '/r/smallbusiness/comments/123/recruiting_ops',
                  subreddit: 'smallbusiness',
                  score: 58,
                  num_comments: 17,
                  over_18: false,
                  is_self: true,
                  created_utc: 1710000000,
                },
              },
              {
                data: {
                  title: 'I built a launch promo for my tool',
                  selftext: 'Discount this week only.',
                  permalink: '/r/SaaS/comments/999/promo',
                  subreddit: 'SaaS',
                  score: 90,
                  num_comments: 10,
                  over_18: false,
                  is_self: true,
                  created_utc: 1710000000,
                },
              },
            ],
          },
        })
      )

    const signals = await collectRedditSignals({
      query: 'recruiting operations',
      fetchImpl,
      subredditAllowlist: ['smallbusiness'],
      buildSellableOffer,
    })

    expect(signals).toHaveLength(1)
    expect(signals[0]).toMatchObject({
      sourceId: 'reddit',
      sourceLabel: 'Reddit',
      signalType: 'pain',
      subreddit: 'smallbusiness',
      title: 'Looking for software to stop manual recruiting ops',
      url: 'https://www.reddit.com/r/smallbusiness/comments/123/recruiting_ops',
      score: expect.any(Number),
      sellableOffer: {
        acquisitionChannel: 'reddit',
        evidenceUrl: 'https://www.reddit.com/r/smallbusiness/comments/123/recruiting_ops',
      },
    })
    expect(signals[0].evidence).toContain('r/smallbusiness')
  })
})
