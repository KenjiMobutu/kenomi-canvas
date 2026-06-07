import { describe, expect, it } from 'vitest'
import {
  hasSyntheticBusinessMarker,
  isSyntheticOfferRow,
  isSyntheticPaymentAttributionRow,
  isSyntheticProspectRow,
  isSyntheticVentureRow,
} from '@/lib/revenue/synthetic-data'

describe('synthetic revenue data guard', () => {
  it('detects smoke and bootstrap markers in nested objects', () => {
    expect(hasSyntheticBusinessMarker({ tags: ['phase2', 'smoke'] })).toBe(true)
    expect(hasSyntheticBusinessMarker({ bestOffer: { title: 'bootstrap offer' } })).toBe(true)
    expect(hasSyntheticBusinessMarker({ tags: ['phase2', 'live'] })).toBe(false)
  })

  it('flags synthetic prospects, offers, payments, and ventures', () => {
    expect(
      isSyntheticProspectRow({
        company_name: 'Smoke Prospect Co abc',
        source: 'linkedin',
        metadata: { tags: ['smoke', 'phase2'] },
      })
    ).toBe(true)
    expect(
      isSyntheticPaymentAttributionRow({
        source: 'smoke',
        offer_variant: 'smoke-variant',
      })
    ).toBe(true)
    expect(isSyntheticOfferRow({ name: 'bootstrap offer' })).toBe(true)
    expect(isSyntheticVentureRow({ name: 'Bootstrap venture' })).toBe(true)
    expect(
      isSyntheticProspectRow({
        company_name: 'Acme Studio',
        source: 'linkedin',
        metadata: { tags: ['phase2'] },
      })
    ).toBe(false)
  })
})
