import Stripe from 'stripe'

export function getStripeSecretKey(
  env: NodeJS.ProcessEnv = process.env
): string {
  const key = env.STRIPE_SECRET_KEY

  if (!key) {
    throw new Error('STRIPE_SECRET_KEY missing')
  }

  return key
}

export function createStripeClient(
  env: NodeJS.ProcessEnv = process.env
): Stripe {
  return new Stripe(getStripeSecretKey(env), {
    apiVersion: '2026-04-22.dahlia',
  })
}

export function getStripeWebhookSecret(
  env: NodeJS.ProcessEnv = process.env
): string {
  const secret = env.STRIPE_WEBHOOK_SECRET

  if (!secret) {
    throw new Error('STRIPE_WEBHOOK_SECRET missing')
  }

  return secret
}
