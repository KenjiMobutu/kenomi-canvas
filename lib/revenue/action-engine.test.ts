import { describe, expect, it } from 'vitest'
import { scoreCashActionCandidate } from '@/lib/revenue/action-engine'

describe('scoreCashActionCandidate', () => {
  it('boosts actions aligned with best offer, best angle, and top segment', () => {
    const result = scoreCashActionCandidate({
      kind: 'send',
      basePriority: 98,
      prospect: {
        id: 'p1',
        company_name: 'Best Fit Co',
        source: 'linkedin',
        band: 'warm',
        score: 88,
        pipeline_status: 'draft_created',
        approval_status: 'approved_to_send',
        offer_id: 'offer-a',
        outreach_angle: 'speed',
      },
      segmentFocus: {
        source: 'linkedin',
        band: 'warm',
        qualityScore: 70,
        playbookHint: 'reply-heavy',
      },
      conversions: {
        bestOffer: { offerId: 'offer-a', closeRate: 40 },
        bestAngle: { offerId: 'offer-a', angle: 'speed', closeRate: 50 },
        segmentRepliesNoPay: null,
      },
    })

    expect(result.priority).toBeGreaterThan(98)
    expect(result.expectedCashEur).toBeGreaterThan(0)
    expect(result.expectedCashLabel).toMatch(/^expected cash /)
    expect(result.reasonLabel).toBe('best offer + angle')
  })

  it('flags stalled reply blockers from conversation truth', () => {
    const result = scoreCashActionCandidate({
      kind: 'follow_up',
      basePriority: 112,
      prospect: {
        id: 'p2',
        company_name: 'Blocked Co',
        source: 'reddit',
        band: 'hot',
        score: 77,
        pipeline_status: 'follow_up_due',
        approval_status: 'approved_to_send',
        latest_conversation_event_type: 'budget_block',
      },
      segmentFocus: {
        source: 'reddit',
        band: 'hot',
        qualityScore: 60,
        playbookHint: 'win-heavy',
      },
      conversions: {
        bestOffer: null,
        bestAngle: null,
        segmentRepliesNoPay: { source: 'reddit', band: 'hot', offerId: null, replied: 4, paid: 0 },
      },
    })

    expect(result.reasonLabel).toBe('stuck after reply')
    expect(result.expectedCashLabel).toContain('expected cash')
  })
})
