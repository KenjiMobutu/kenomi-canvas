import { describe, expect, it } from 'vitest'
import {
  DIAGNOSTIC_CASH_LANE,
  getDiagnosticLaneSegment,
  isDiagnosticLaneContactableProspect,
  isDiagnosticLaneProspect,
} from '@/lib/revenue/diagnostic-cash-lane'

describe('diagnostic cash lane', () => {
  it('exposes the active offer defaults', () => {
    expect(DIAGNOSTIC_CASH_LANE.offer.slug).toBe('300eur-diagnostic')
    expect(DIAGNOSTIC_CASH_LANE.offer.priceEur).toBe(300)
    expect(DIAGNOSTIC_CASH_LANE.segment.slug).toBe('freelancers-small-agencies')
    expect(DIAGNOSTIC_CASH_LANE.cta.kind).toBe('book_diagnostic_call')
  })

  it('accepts a contactable lane prospect', () => {
    expect(
      isDiagnosticLaneContactableProspect({
        source: 'reddit',
        contact_email: 'founder@example.com',
        offer_variant: '300eur-diagnostic',
        outreach_angle: 'diagnostic-call-outbound-v1',
        metadata: { lane_segment: 'freelancers-small-agencies' },
      })
    ).toBe(true)
  })

  it('rejects a prospect without contactability', () => {
    expect(
      isDiagnosticLaneContactableProspect({
        source: 'reddit',
        contact_email: null,
        offer_variant: '300eur-diagnostic',
        outreach_angle: 'diagnostic-call-outbound-v1',
        metadata: { lane_segment: 'freelancers-small-agencies' },
      })
    ).toBe(false)
  })

  it('matches lane prospects conservatively', () => {
    expect(
      isDiagnosticLaneProspect({
        offer_variant: '300eur-diagnostic',
        outreach_angle: 'diagnostic-call-outbound-v1',
        metadata: { lane_segment: 'freelancers-small-agencies' },
      })
    ).toBe(true)

    expect(
      isDiagnosticLaneProspect({
        offer_variant: 'other-offer',
        outreach_angle: 'diagnostic-call-outbound-v1',
        metadata: { lane_segment: 'ecommerce' },
      })
    ).toBe(false)
  })

  it('falls back to metadata when the segment column is absent', () => {
    expect(
      getDiagnosticLaneSegment({
        offer_variant: '300eur-diagnostic',
        outreach_angle: 'diagnostic-call-outbound-v1',
        metadata: { lane_segment: 'freelancers-small-agencies' },
      })
    ).toBe('freelancers-small-agencies')
  })
})
