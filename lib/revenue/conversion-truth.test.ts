import { describe, expect, it } from 'vitest'
import { buildConversionTruthSnapshot } from '@/lib/revenue/conversion-truth'

describe('conversion truth snapshot', () => {
  it('pivots cash truth from won to paid when payment attribution exists', () => {
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
          metadata: { model: 'hermes3:8b', model_family: 'hermes' },
          source: 'linkedin',
          band: 'warm',
          pipeline_status: 'won',
          created_at: '2026-05-20T10:00:00.000Z',
        },
        {
          id: 'p2',
          offer_id: 'offer-a',
          outreach_angle: 'speed',
          metadata: { model: 'hermes3:8b', model_family: 'hermes' },
          source: 'linkedin',
          band: 'warm',
          pipeline_status: 'won',
          created_at: '2026-05-21T10:00:00.000Z',
        },
        {
          id: 'p3',
          offer_id: 'offer-b',
          outreach_angle: 'roi',
          metadata: { model: 'qwen3:8b', model_family: 'qwen' },
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
        { prospect_id: 'p2', type: 'marked_won', created_at: '2026-05-25T11:00:00.000Z' },
        { prospect_id: 'p3', type: 'marked_sent', created_at: '2026-05-22T11:00:00.000Z' },
      ],
      conversationEvents: [
        { prospect_id: 'p1', event_type: 'meeting_booked', created_at: '2026-05-21T10:00:00.000Z' },
        { prospect_id: 'p1', event_type: 'closed_won', created_at: '2026-05-24T13:00:00.000Z' },
        { prospect_id: 'p2', event_type: 'soft_interest', created_at: '2026-05-22T11:10:00.000Z' },
        { prospect_id: 'p2', event_type: 'closed_won', created_at: '2026-05-25T11:00:00.000Z' },
        { prospect_id: 'p3', event_type: 'budget_block', created_at: '2026-05-23T09:00:00.000Z' },
        { prospect_id: 'p3', event_type: 'closed_lost', created_at: '2026-05-24T09:00:00.000Z' },
      ],
      paymentAttributions: [
        {
          prospect_id: 'p1',
          offer_id: 'offer-a',
          outreach_angle: 'speed',
          source: 'linkedin',
          band: 'warm',
          amount_eur: 2400,
          payment_status: 'paid',
        },
        {
          prospect_id: 'p3',
          offer_id: 'offer-b',
          outreach_angle: 'roi',
          source: 'reddit',
          band: 'hot',
          amount_eur: 500,
          payment_status: 'pending',
        },
      ],
    })

    expect(snapshot.overview).toMatchObject({
      contacted: 3,
      replied: 2,
      qualifiedReplies: 2,
      meetingsBooked: 2,
      wonCount: 2,
      paidCount: 1,
      paidCashEur: 2400,
      wonToPaidRate: 50,
      replyToPaidRate: 50,
      replyRate: 66.7,
      closeRate: 33.3,
    })
    expect(snapshot.bestOffer).toMatchObject({
      offerId: 'offer-a',
      offerName: 'Outbound Sprint',
      wonCount: 2,
      paidCount: 1,
      paidCashEur: 2400,
    })
    expect(snapshot.bestOfferToWin).toMatchObject({
      offerId: 'offer-a',
      wonCount: 2,
    })
    expect(snapshot.bestAngle).toMatchObject({
      angle: 'speed',
      offerName: 'Outbound Sprint',
      wonCount: 2,
      paidCount: 1,
    })
    expect(snapshot.segmentRepliesNoPay).toMatchObject({
      key: 'linkedin:warm:offer-a',
      replied: 2,
      wonCount: 2,
      paidCount: 1,
    })
    expect(snapshot.segmentWinsNoCash).toBeNull()
    expect(snapshot.sourceClosesFastest).toMatchObject({
      source: 'linkedin',
      paidCount: 1,
    })
    expect(snapshot.sourceCollectsFastest).toMatchObject({
      source: 'linkedin',
      paidCount: 1,
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
      wonCount: 2,
      paidCount: 1,
      paidCashEur: 2400,
    })
    expect(snapshot.bestModel).toMatchObject({
      model: 'hermes3:8b',
      modelFamily: 'hermes',
      contacted: 2,
      replied: 2,
      wonCount: 2,
      paidCount: 1,
      paidCashEur: 2400,
    })
    expect(snapshot.modelBreakdown[0]).toMatchObject({
      model: 'hermes3:8b',
      modelFamily: 'hermes',
    })
    expect(snapshot.bestMessageFamily).toMatchObject({
      messageFamily: 'speed',
      paidCount: 1,
      paidCashEur: 2400,
    })
    expect(snapshot.messageFamilyBreakdown[0]).toMatchObject({
      messageFamily: 'speed',
      replyRate: 100,
      paidRate: 50,
    })
  })

  it('excludes smoke and bootstrap rows from conversion truth', () => {
    const snapshot = buildConversionTruthSnapshot({
      offers: [
        { id: 'offer-a', name: 'Outbound Sprint' },
        { id: 'offer-smoke', name: 'bootstrap offer' },
      ],
      prospects: [
        {
          id: 'real-1',
          company_name: 'Acme Studio',
          offer_id: 'offer-a',
          outreach_angle: 'speed',
          source: 'linkedin',
          band: 'warm',
          pipeline_status: 'won',
          created_at: '2026-05-20T10:00:00.000Z',
          metadata: { model: 'hermes3:8b', model_family: 'hermes' },
        },
        {
          id: 'smoke-1',
          company_name: 'Smoke Prospect Co abc',
          offer_id: 'offer-smoke',
          offer_variant: 'smoke-variant',
          outreach_angle: 'smoke-angle',
          source: 'linkedin',
          band: 'warm',
          pipeline_status: 'won',
          created_at: '2026-05-21T10:00:00.000Z',
          metadata: { tags: ['smoke', 'phase2'] },
        },
      ],
      activities: [
        { prospect_id: 'real-1', type: 'marked_sent', created_at: '2026-05-20T11:00:00.000Z' },
        { prospect_id: 'real-1', type: 'marked_replied', created_at: '2026-05-20T12:00:00.000Z' },
        { prospect_id: 'real-1', type: 'marked_won', created_at: '2026-05-21T12:00:00.000Z' },
        { prospect_id: 'smoke-1', type: 'marked_sent', created_at: '2026-05-21T11:00:00.000Z' },
      ],
      conversationEvents: [
        { prospect_id: 'real-1', event_type: 'closed_won', created_at: '2026-05-21T12:00:00.000Z' },
        { prospect_id: 'smoke-1', event_type: 'closed_won', created_at: '2026-05-22T12:00:00.000Z' },
      ],
      paymentAttributions: [
        {
          prospect_id: 'real-1',
          offer_id: 'offer-a',
          source: 'linkedin',
          band: 'warm',
          outreach_angle: 'speed',
          amount_eur: 1800,
          payment_status: 'paid',
        },
        {
          prospect_id: 'smoke-1',
          offer_id: 'offer-smoke',
          source: 'smoke',
          band: 'warm',
          outreach_angle: 'smoke-angle',
          offer_variant: 'smoke-variant',
          amount_eur: 9999,
          payment_status: 'paid',
        },
      ],
    })

    expect(snapshot.overview.contacted).toBe(1)
    expect(snapshot.overview.paidCashEur).toBe(1800)
    expect(snapshot.bestOffer?.offerName).toBe('Outbound Sprint')
    expect(snapshot.offerBreakdown).toHaveLength(1)
    expect(snapshot.messageFamilyBreakdown).toHaveLength(1)
  })
})
