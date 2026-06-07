import { describe, expect, it } from 'vitest'
import {
  DIAGNOSTIC_CASH_LANE,
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
        segment: 'freelancers-small-agencies',
        offer_variant: '300eur-diagnostic',
      })
    ).toBe(true)
  })

  it('rejects a prospect without contactability', () => {
    expect(
      isDiagnosticLaneContactableProspect({
        source: 'reddit',
        contact_email: null,
        segment: 'freelancers-small-agencies',
        offer_variant: '300eur-diagnostic',
      })
    ).toBe(false)
  })

  it('matches lane prospects conservatively', () => {
    expect(
      isDiagnosticLaneProspect({
        segment: 'freelancers-small-agencies',
        offer_variant: '300eur-diagnostic',
      })
    ).toBe(true)

    expect(
      isDiagnosticLaneProspect({
        segment: 'ecommerce',
        offer_variant: 'other-offer',
      })
    ).toBe(false)
  })
})
