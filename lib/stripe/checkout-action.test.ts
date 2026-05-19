import { describe, expect, it } from 'vitest'
import { requiresApproval } from '@/lib/autonomy/policy'
import {
  buildCheckoutAutonomyAction,
  buildCheckoutSessionParams,
  parsePaymentOutputPayload,
  parsePaymentOutput,
  type PaymentOutput,
} from './checkout-action'

const payment: PaymentOutput = {
  product_name: 'Kenomi Leads',
  price_amount: 2900,
  price_currency: 'EUR',
  billing: 'monthly',
  checkout_description: 'AI lead discovery for solo founders.',
  trial_days: 7,
}

describe('buildCheckoutSessionParams', () => {
  it('builds subscription Checkout params from payment output', () => {
    const params = buildCheckoutSessionParams({
      payment,
      ventureId: 'venture_123',
      successUrl: 'https://kenomi.test/success',
      cancelUrl: 'https://kenomi.test/cancel',
    })

    expect(params.mode).toBe('subscription')
    expect(params.success_url).toBe('https://kenomi.test/success')
    expect(params.cancel_url).toBe('https://kenomi.test/cancel')
    expect(params.metadata).toEqual({ venture_id: 'venture_123' })
    expect(params.line_items?.[0]?.price_data?.currency).toBe('eur')
    expect(params.line_items?.[0]?.price_data?.unit_amount).toBe(2900)
    expect(params.line_items?.[0]?.price_data?.recurring).toEqual({
      interval: 'month',
    })
    expect(params.subscription_data).toEqual({ trial_period_days: 7 })
  })

  it('builds one-time Checkout params without recurring price data', () => {
    const params = buildCheckoutSessionParams({
      payment: { ...payment, billing: 'one_time', trial_days: 0 },
      ventureId: 'venture_123',
      successUrl: 'https://kenomi.test/success',
      cancelUrl: 'https://kenomi.test/cancel',
    })

    expect(params.mode).toBe('payment')
    expect(params.line_items?.[0]?.price_data?.recurring).toBeUndefined()
    expect(params.subscription_data).toBeUndefined()
  })

  it('validates payment output before checkout creation', () => {
    expect(() => parsePaymentOutput('{"price_amount": -1}')).toThrow('Invalid payment output')
    expect(parsePaymentOutput(JSON.stringify(payment))).toEqual(payment)
    expect(parsePaymentOutputPayload(payment)).toEqual(payment)
    expect(() => parsePaymentOutputPayload({ ...payment, price_amount: 0 })).toThrow(
      'Invalid payment output'
    )
  })
})

describe('buildCheckoutAutonomyAction', () => {
  it('requires human approval for production checkout creation', () => {
    expect(
      requiresApproval(
        buildCheckoutAutonomyAction({
          environment: 'production',
        })
      )
    ).toBe(true)
  })

  it('allows non-production checkout creation without approval', () => {
    expect(
      requiresApproval(
        buildCheckoutAutonomyAction({
          environment: 'staging',
        })
      )
    ).toBe(false)
  })
})
