import { describe, expect, it } from 'vitest'
import { evalRevenueTruthGate } from '@/lib/revenue/truth-smoke.mjs'

describe('evalRevenueTruthGate', () => {
  it('passes when the business-truth signals are present', () => {
    const result = evalRevenueTruthGate({
      healthOk: true,
      insightsProtected: true,
      prospectsWithOffer: 2,
      conversationEvents: 3,
      offerTaggedProspects: 2,
      sourceTaggedProspects: 2,
      bandTaggedProspects: 2,
      weeklyReviews: 1,
    })

    expect(result).toEqual({ ok: true, failures: [] })
  })

  it('fails when revenue-truth instrumentation is missing', () => {
    const result = evalRevenueTruthGate({
      healthOk: false,
      insightsProtected: false,
      prospectsWithOffer: 0,
      conversationEvents: 0,
      offerTaggedProspects: 0,
      sourceTaggedProspects: 0,
      bandTaggedProspects: 0,
      weeklyReviews: 0,
    })

    expect(result.ok).toBe(false)
    expect(result.failures).toEqual([
      'health_not_ok',
      'revenue_insights_not_protected',
      'offer_truth_missing',
      'conversation_truth_missing',
      'offer_tagged_prospects_missing',
      'source_truth_missing',
      'segment_truth_missing',
      'weekly_reviews_missing',
    ])
  })
})
