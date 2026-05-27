import { describe, expect, it } from 'vitest'
import { buildScoutSignalsApiView } from './api-view'

describe('buildScoutSignalsApiView', () => {
  it('returns recent signals in descending recency order', () => {
    const view = buildScoutSignalsApiView([
      {
        source_id: 'reddit',
        source_label: 'Reddit',
        signal_type: 'pain',
        subreddit: 'smallbusiness',
        title: 'Older signal',
        url: 'https://www.reddit.com/r/smallbusiness/comments/1/older',
        score: 61,
        evidence: 'old',
        created_at: '2026-05-27T07:00:00.000Z',
      },
      {
        source_id: 'reddit',
        source_label: 'Reddit',
        signal_type: 'pain',
        subreddit: 'SaaS',
        title: 'Newer signal',
        url: 'https://www.reddit.com/r/SaaS/comments/2/newer',
        score: 74,
        evidence: 'new',
        created_at: '2026-05-27T08:00:00.000Z',
      },
    ])

    expect(view.status).toBe('live')
    expect(view.lastFetchedAt).toBe('2026-05-27T08:00:00.000Z')
    expect(view.signals.map((signal) => signal.title)).toEqual(['Newer signal', 'Older signal'])
  })

  it('returns degraded when no usable signals exist', () => {
    const view = buildScoutSignalsApiView([])

    expect(view).toEqual({
      status: 'degraded',
      lastFetchedAt: null,
      signals: [],
    })
  })
})
