import { describe, expect, it } from 'vitest'
import { appendScoutSignals, buildScoutSignalRows } from './signal-log'
import { buildSellableOffer, type ScoutSourceCollection } from './free-sources'

function makeCollection(): ScoutSourceCollection {
  return {
    generatedAt: '2026-05-27T08:00:00.000Z',
    signals: [
      {
        sourceId: 'reddit',
        sourceLabel: 'Reddit',
        signalType: 'pain',
        subreddit: 'smallbusiness',
        title: 'Need a tool to stop manual recruiting ops',
        url: 'https://www.reddit.com/r/smallbusiness/comments/1/manual_recruiting',
        score: 82,
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
  }
}

describe('buildScoutSignalRows', () => {
  it('builds append-only scout signal rows with normalized payload', () => {
    const rows = buildScoutSignalRows({
      userId: 'user-1',
      collection: makeCollection(),
    })

    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      user_id: 'user-1',
      source_id: 'reddit',
      source_label: 'Reddit',
      signal_type: 'pain',
      subreddit: 'smallbusiness',
      title: 'Need a tool to stop manual recruiting ops',
      score: 82,
      normalized_payload: {
        subreddit: 'smallbusiness',
        title: 'Need a tool to stop manual recruiting ops',
      },
    })
  })
})

describe('appendScoutSignals', () => {
  it('writes recent signal rows to scout_signals', async () => {
    const inserted: unknown[] = []
    const supabase = {
      from(table: string) {
        return {
          insert(rows: unknown[]) {
            if (table === 'scout_signals') inserted.push(...rows)
            return Promise.resolve({ data: rows, error: null })
          },
        }
      },
    }

    await appendScoutSignals({
      supabase: supabase as never,
      userId: 'user-1',
      collection: makeCollection(),
    })

    expect(inserted).toHaveLength(1)
    expect(inserted[0]).toMatchObject({
      source_id: 'reddit',
      subreddit: 'smallbusiness',
    })
  })
})
