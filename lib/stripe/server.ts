import Stripe from 'stripe'

export function getStripeSecretKey(env: NodeJS.ProcessEnv = process.env): string {
  const key = env.STRIPE_SECRET_KEY

  if (!key) {
    throw new Error('STRIPE_SECRET_KEY missing')
  }

  return key
}

export function getOptionalStripeSecretKey(env: NodeJS.ProcessEnv = process.env): string | null {
  const key = env.STRIPE_SECRET_KEY
  return key && key.trim().length > 0 ? key : null
}

export function createStripeClientFromSecretKey(secretKey: string): Stripe {
  if (!secretKey.trim()) {
    throw new Error('STRIPE_SECRET_KEY missing')
  }

  return new Stripe(secretKey, {
    apiVersion: '2026-05-27.dahlia',
  })
}

export function createStripeWebhookVerifierClient(): Stripe {
  return new Stripe('sk_webhook_verifier', {
    apiVersion: '2026-05-27.dahlia',
  })
}

export function createStripeClient(env: NodeJS.ProcessEnv = process.env): Stripe {
  return createStripeClientFromSecretKey(getStripeSecretKey(env))
}

export function getStripeWebhookSecret(env: NodeJS.ProcessEnv = process.env): string {
  const secret = env.STRIPE_WEBHOOK_SECRET

  if (!secret) {
    throw new Error('STRIPE_WEBHOOK_SECRET missing')
  }

  return secret
}
