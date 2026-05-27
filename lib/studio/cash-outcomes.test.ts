import { describe, expect, it } from 'vitest'
import { buildCashOutcomeSnapshot } from './cash-outcomes'

describe('buildCashOutcomeSnapshot', () => {
  it('computes 7d and 30d outcomes with previous-window deltas', () => {
    const snapshot = buildCashOutcomeSnapshot({
      nowIso: '2026-05-28T12:00:00.000Z',
      activities: [
        { type: 'marked_replied', created_at: '2026-05-27T10:00:00.000Z' },
        { type: 'marked_replied', created_at: '2026-05-26T10:00:00.000Z' },
        { type: 'marked_won', created_at: '2026-05-25T10:00:00.000Z' },
        { type: 'marked_replied', created_at: '2026-05-18T10:00:00.000Z' },
        { type: 'marked_won', created_at: '2026-05-15T10:00:00.000Z' },
      ],
      payments: [
        { status: 'completed', created_at: '2026-05-27T09:00:00.000Z', amount_eur: 200 },
        { status: 'completed', created_at: '2026-05-22T09:00:00.000Z', collected_amount_eur: 150 },
        { status: 'completed', created_at: '2026-05-16T09:00:00.000Z', amount_eur: 80 },
        { status: 'pending', created_at: '2026-05-27T09:00:00.000Z', amount_eur: 999 },
      ],
    })

    expect(snapshot.last7d).toEqual({
      replies: 2,
      deals: 1,
      cashEur: 350,
    })
    expect(snapshot.previous7d).toEqual({
      replies: 1,
      deals: 1,
      cashEur: 80,
    })
    expect(snapshot.delta7d).toEqual({
      replies: 1,
      deals: 0,
      cashEur: 270,
    })
    expect(snapshot.last30d).toEqual({
      replies: 3,
      deals: 2,
      cashEur: 430,
    })
    expect(snapshot.previous30d).toEqual({
      replies: 0,
      deals: 0,
      cashEur: 0,
    })
  })
})
