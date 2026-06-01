import { describe, expect, it } from 'vitest'
import { evalRevenueAttributionGate } from '@/lib/revenue/attribution-smoke.mjs'

describe('evalRevenueAttributionGate', () => {
  it('passes when attribution truth is present', () => {
    const result = evalRevenueAttributionGate({
      healthOk: true,
      attributionProtected: true,
      attributionRows: 2,
      paidAttributionRows: 1,
      knownAttributionRows: 1,
      attributedCashCents: 180000,
    })

    expect(result).toEqual({ ok: true, failures: [] })
  })

  it('fails when attribution truth is missing', () => {
    const result = evalRevenueAttributionGate({
      healthOk: false,
      attributionProtected: false,
      attributionRows: 0,
      paidAttributionRows: 0,
      knownAttributionRows: 0,
      attributedCashCents: 0,
    })

    expect(result.ok).toBe(false)
    expect(result.failures).toEqual([
      'health_not_ok',
      'revenue_attribution_not_protected',
      'payment_attributions_missing',
      'paid_attributions_missing',
      'known_attributions_missing',
      'attributed_cash_missing',
    ])
  })
})
