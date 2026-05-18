import Stripe from 'stripe'
import { describe, expect, it } from 'vitest'
import { createStripeClient, getStripeSecretKey, getStripeWebhookSecret } from './server'

describe('Stripe server adapter', () => {
  it('requires STRIPE_SECRET_KEY', () => {
    expect(() => getStripeSecretKey({} as NodeJS.ProcessEnv)).toThrow('STRIPE_SECRET_KEY missing')
  })

  it('reads STRIPE_SECRET_KEY from the environment', () => {
    expect(
      getStripeSecretKey({
        STRIPE_SECRET_KEY: 'sk_test_kenomi',
      } as unknown as NodeJS.ProcessEnv)
    ).toBe('sk_test_kenomi')
  })

  it('creates a Stripe client', () => {
    const client = createStripeClient({
      STRIPE_SECRET_KEY: 'sk_test_kenomi',
    } as unknown as NodeJS.ProcessEnv)

    expect(client).toBeInstanceOf(Stripe)
    expect(typeof client.checkout.sessions.create).toBe('function')
  })

  it('requires STRIPE_WEBHOOK_SECRET for webhook verification', () => {
    expect(() => getStripeWebhookSecret({} as NodeJS.ProcessEnv)).toThrow(
      'STRIPE_WEBHOOK_SECRET missing'
    )
    expect(
      getStripeWebhookSecret({
        STRIPE_WEBHOOK_SECRET: 'whsec_kenomi',
      } as unknown as NodeJS.ProcessEnv)
    ).toBe('whsec_kenomi')
  })
})
