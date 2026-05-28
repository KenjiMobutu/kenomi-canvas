import { describe, expect, it } from 'vitest'
import { buildCashOutcomeSnapshot } from './cash-outcomes'

describe('buildCashOutcomeSnapshot', () => {
  it('computes 7d and 30d outcomes with previous-window deltas', () => {
    const snapshot = buildCashOutcomeSnapshot({
      nowIso: '2026-05-28T12:00:00.000Z',
      activities: [
        { type: 'marked_sent', created_at: '2026-05-27T08:00:00.000Z' },
        { type: 'follow_up_marked_sent', created_at: '2026-05-26T08:00:00.000Z' },
        { type: 'marked_sent', created_at: '2026-05-18T08:00:00.000Z' },
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
      prospects: [
        { source: 'linkedin', pipeline_status: 'awaiting_approval', approval_status: 'awaiting_approval' },
        { source: 'linkedin', pipeline_status: 'replied', approval_status: 'no_approval' },
        { source: 'reddit', pipeline_status: 'won', approval_status: 'no_approval' },
        { source: 'reddit', pipeline_status: 'follow_up_due', approval_status: 'approved_to_send' },
        { source: 'other', pipeline_status: 'draft_created', approval_status: 'approved_to_send' },
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
    expect(snapshot.rates).toEqual({
      replyRate7d: 100,
      winRate7d: 50,
      replyRate30d: 100,
      winRate30d: 66.7,
    })
    expect(snapshot.sourceBreakdown).toEqual([
      { source: 'reddit', active: 1, replied: 0, won: 1, replyRate: 0, winRate: 100, qualityScore: 65 },
      { source: 'linkedin', active: 1, replied: 1, won: 0, replyRate: 100, winRate: 0, qualityScore: 35 },
      { source: 'other', active: 1, replied: 0, won: 0, replyRate: 0, winRate: 0, qualityScore: 0 },
    ])
    expect(snapshot.blockers).toEqual([
      { key: 'awaiting_approval', label: 'Awaiting approval', count: 1 },
      { key: 'draft_created', label: 'Drafts to send', count: 1 },
      { key: 'follow_up_due', label: 'Follow-ups due', count: 1 },
    ])
    expect(snapshot.blockerActions).toEqual([
      {
        key: 'awaiting_approval',
        label: 'Awaiting approval',
        count: 1,
        source: 'linkedin',
        ctaLabel: 'Review LinkedIn approval',
        href: '/studio/prospects?status=awaiting_approval&source=linkedin',
      },
      {
        key: 'draft_created',
        label: 'Drafts to send',
        count: 1,
        source: 'other',
        ctaLabel: 'Send Other draft',
        href: '/studio/prospects?status=draft_created&source=other',
      },
      {
        key: 'follow_up_due',
        label: 'Follow-ups due',
        count: 1,
        source: 'reddit',
        ctaLabel: 'Run Reddit follow-up',
        href: '/studio/prospects?status=follow_up_due&source=reddit',
      },
    ])
  })
})
