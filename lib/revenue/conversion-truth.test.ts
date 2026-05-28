import { describe, expect, it } from 'vitest'
import { buildConversionTruthSnapshot } from '@/lib/revenue/conversion-truth'

describe('conversion truth snapshot', () => {
  it('aggregates offer, angle, and segment conversion cuts', () => {
    const snapshot = buildConversionTruthSnapshot({
      offers: [
        { id: 'offer-a', name: 'Outbound Sprint' },
        { id: 'offer-b', name: 'Audit Retainer' },
      ],
      prospects: [
        {
          id: 'p1',
          offer_id: 'offer-a',
          outreach_angle: 'speed',
          source: 'linkedin',
          band: 'warm',
          pipeline_status: 'won',
          created_at: '2026-05-20T10:00:00.000Z',
        },
        {
          id: 'p2',
          offer_id: 'offer-a',
          outreach_angle: 'speed',
          source: 'linkedin',
          band: 'warm',
          pipeline_status: 'replied',
          created_at: '2026-05-21T10:00:00.000Z',
        },
        {
          id: 'p3',
          offer_id: 'offer-b',
          outreach_angle: 'roi',
          source: 'reddit',
          band: 'hot',
          pipeline_status: 'sent',
          created_at: '2026-05-22T10:00:00.000Z',
        },
      ],
      activities: [
        { prospect_id: 'p1', type: 'marked_sent', created_at: '2026-05-20T11:00:00.000Z' },
        { prospect_id: 'p1', type: 'marked_replied', created_at: '2026-05-20T13:00:00.000Z' },
        { prospect_id: 'p1', type: 'marked_won', created_at: '2026-05-24T13:00:00.000Z' },
        { prospect_id: 'p2', type: 'marked_sent', created_at: '2026-05-21T11:00:00.000Z' },
        { prospect_id: 'p2', type: 'marked_replied', created_at: '2026-05-22T11:00:00.000Z' },
        { prospect_id: 'p3', type: 'marked_sent', created_at: '2026-05-22T11:00:00.000Z' },
      ],
      conversationEvents: [
        { prospect_id: 'p1', event_type: 'meeting_booked', created_at: '2026-05-21T10:00:00.000Z' },
        { prospect_id: 'p1', event_type: 'closed_won', created_at: '2026-05-24T13:00:00.000Z' },
        { prospect_id: 'p2', event_type: 'soft_interest', created_at: '2026-05-22T11:10:00.000Z' },
        { prospect_id: 'p3', event_type: 'budget_block', created_at: '2026-05-23T09:00:00.000Z' },
        { prospect_id: 'p3', event_type: 'closed_lost', created_at: '2026-05-24T09:00:00.000Z' },
      ],
    })

    expect(snapshot.overview).toMatchObject({
      contacted: 3,
      replied: 2,
      qualifiedReplies: 2,
      meetingsBooked: 1,
      paid: 1,
      replyRate: 66.7,
      closeRate: 33.3,
    })
    expect(snapshot.bestOffer).toMatchObject({
      offerId: 'offer-a',
      offerName: 'Outbound Sprint',
      paid: 1,
    })
    expect(snapshot.bestAngle).toMatchObject({
      angle: 'speed',
      offerName: 'Outbound Sprint',
      paid: 1,
    })
    expect(snapshot.segmentRepliesNoPay).toMatchObject({
      key: 'linkedin:warm:offer-a',
      replied: 2,
      paid: 1,
    })
    expect(snapshot.sourceClosesFastest).toMatchObject({
      source: 'linkedin',
      paid: 1,
    })
    expect(snapshot.commonObjections[0]).toMatchObject({
      type: 'budget_block',
      count: 1,
    })
    expect(snapshot.lostReasons[0]).toMatchObject({
      count: 1,
    })
    expect(snapshot.repeatNext).toMatchObject({
      title: 'Outbound Sprint · speed',
    })
    expect(snapshot.stopNext).toMatchObject({
      title: 'reddit/hot · Audit Retainer',
    })
    expect(snapshot.offerBreakdown[0]).toMatchObject({
      offerId: 'offer-a',
      contacted: 2,
      replied: 2,
      paid: 1,
    })
  })
})
