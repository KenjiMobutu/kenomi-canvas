import { describe, expect, it } from 'vitest'
import { buildWeeklyRevenueReview } from '@/lib/revenue/weekly-review'
import type { ConversionTruthSnapshot } from '@/lib/revenue/conversion-truth'

function makeSnapshot(): ConversionTruthSnapshot {
  return {
    overview: {
      contacted: 12,
      replied: 5,
      qualifiedReplies: 3,
      meetingsBooked: 1,
      checkoutsCreated: 1,
      paid: 1,
      replyRate: 41.7,
      qualifiedRate: 25,
      closeRate: 8.3,
      leadToReplyHours: 18,
      replyToCloseDays: 4,
    },
    offerBreakdown: [
      {
        offerId: 'offer-a',
        offerName: 'Outbound Sprint',
        offerVariant: null,
        contacted: 8,
        replied: 4,
        qualifiedReplies: 3,
        meetingsBooked: 1,
        checkoutsCreated: 1,
        paid: 1,
        replyRate: 50,
        qualifiedRate: 37.5,
        closeRate: 12.5,
      },
    ],
    angleBreakdown: [
      {
        key: 'offer-a:speed',
        offerId: 'offer-a',
        offerName: 'Outbound Sprint',
        angle: 'speed',
        contacted: 6,
        replied: 4,
        qualifiedReplies: 3,
        meetingsBooked: 1,
        checkoutsCreated: 1,
        paid: 1,
        replyRate: 66.7,
        qualifiedRate: 50,
        closeRate: 16.7,
      },
    ],
    segmentOfferBreakdown: [
      {
        key: 'reddit:hot:offer-a',
        source: 'reddit',
        band: 'hot',
        offerId: 'offer-a',
        offerName: 'Outbound Sprint',
        contacted: 5,
        replied: 3,
        qualifiedReplies: 2,
        meetingsBooked: 0,
        checkoutsCreated: 0,
        paid: 0,
        replyRate: 60,
        qualifiedRate: 40,
        closeRate: 0,
      },
      {
        key: 'linkedin:warm:offer-a',
        source: 'linkedin',
        band: 'warm',
        offerId: 'offer-a',
        offerName: 'Outbound Sprint',
        contacted: 4,
        replied: 1,
        qualifiedReplies: 1,
        meetingsBooked: 1,
        checkoutsCreated: 1,
        paid: 1,
        replyRate: 25,
        qualifiedRate: 25,
        closeRate: 25,
      },
    ],
    bestOffer: {
      offerId: 'offer-a',
      offerName: 'Outbound Sprint',
      offerVariant: null,
      contacted: 8,
      replied: 4,
      qualifiedReplies: 3,
      meetingsBooked: 1,
      checkoutsCreated: 1,
      paid: 1,
      replyRate: 50,
      qualifiedRate: 37.5,
      closeRate: 12.5,
    },
    bestAngle: {
      key: 'offer-a:speed',
      offerId: 'offer-a',
      offerName: 'Outbound Sprint',
      angle: 'speed',
      contacted: 6,
      replied: 4,
      qualifiedReplies: 3,
      meetingsBooked: 1,
      checkoutsCreated: 1,
      paid: 1,
      replyRate: 66.7,
      qualifiedRate: 50,
      closeRate: 16.7,
    },
    segmentRepliesNoPay: {
      key: 'reddit:hot:offer-a',
      source: 'reddit',
      band: 'hot',
      offerId: 'offer-a',
      offerName: 'Outbound Sprint',
      contacted: 5,
      replied: 3,
      qualifiedReplies: 2,
      meetingsBooked: 0,
      checkoutsCreated: 0,
      paid: 0,
      replyRate: 60,
      qualifiedRate: 40,
      closeRate: 0,
    },
    sourceClosesFastest: {
      source: 'linkedin',
      contacted: 4,
      replied: 1,
      qualifiedReplies: 1,
      meetingsBooked: 1,
      checkoutsCreated: 1,
      paid: 1,
      replyRate: 25,
      qualifiedRate: 25,
      closeRate: 25,
      leadToReplyHours: 12,
      replyToCloseDays: 3,
    },
    commonObjections: [{ type: 'budget_block', count: 3 }],
    lostReasons: [{ type: 'timing_block', count: 2 }],
    repeatNext: {
      title: 'Outbound Sprint · speed',
      detail: 'Repeat this positioning next.',
    },
    stopNext: {
      title: 'reddit/hot · Outbound Sprint',
      detail: 'Change offer, angle, or sequence before adding more volume.',
    },
  }
}

describe('buildWeeklyRevenueReview', () => {
  it('builds a weekly commercial review from conversion truth', () => {
    const review = buildWeeklyRevenueReview({
      conversions: makeSnapshot(),
      nowIso: '2026-05-28T12:00:00.000Z',
    })

    expect(review.bestSource).toMatchObject({
      title: 'linkedin',
    })
    expect(review.bestSegment).toMatchObject({
      title: 'reddit/hot · Outbound Sprint',
    })
    expect(review.bestOffer).toMatchObject({
      title: 'Outbound Sprint',
    })
    expect(review.bestAngle).toMatchObject({
      title: 'Outbound Sprint · speed',
    })
    expect(review.topObjection).toMatchObject({
      title: 'budget block',
    })
    expect(review.mainLeak).toMatchObject({
      stageKey: 'contact_to_reply',
    })
    expect(review.nextExperiment).toMatchObject({
      title: 'Fix close friction on reddit/hot',
      focus: 'segment',
    })
  })
})
