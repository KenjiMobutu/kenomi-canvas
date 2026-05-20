import { z } from 'zod'
import type Stripe from 'stripe'
import type { AutonomyAction, AutonomyEnvironment } from '@/lib/autonomy/types'

const paymentOutputSchema = z.object({
  product_name: z.string().min(1),
  price_amount: z.number().int().positive(),
  price_currency: z.string().length(3),
  billing: z.enum(['one_time', 'monthly', 'yearly']),
  checkout_description: z.string().min(1),
  trial_days: z.number().int().min(0).max(30),
})

export type PaymentOutput = z.infer<typeof paymentOutputSchema>

export function getCanonicalCheckoutSurface(): 'public_landing' {
  return 'public_landing'
}

export function parsePaymentOutputPayload(raw: unknown): PaymentOutput {
  try {
    return paymentOutputSchema.parse(raw)
  } catch {
    throw new Error('Invalid payment output')
  }
}

export function parsePaymentOutput(raw: string): PaymentOutput {
  try {
    return parsePaymentOutputPayload(JSON.parse(raw))
  } catch {
    throw new Error('Invalid payment output')
  }
}

export function buildCheckoutAutonomyAction(input: {
  environment: AutonomyEnvironment
  estimatedCostEur?: number
  budgetCapEur?: number
}): AutonomyAction {
  return {
    actionType: 'create_checkout',
    riskLevel: 'medium',
    environment: input.environment,
    estimatedCostEur: input.estimatedCostEur ?? 0,
    budgetCapEur: input.budgetCapEur,
  }
}

export function getCheckoutEnvironment(env: NodeJS.ProcessEnv = process.env): AutonomyEnvironment {
  if (
    env.KENOMI_ENV === 'development' ||
    env.KENOMI_ENV === 'staging' ||
    env.KENOMI_ENV === 'production'
  ) {
    return env.KENOMI_ENV
  }

  if (env.VERCEL_ENV === 'production' || env.NODE_ENV === 'production') {
    return 'production'
  }

  if (env.VERCEL_ENV === 'preview') {
    return 'staging'
  }

  return 'development'
}

export function buildCheckoutSessionParams(input: {
  payment: PaymentOutput
  ventureId: string
  successUrl: string
  cancelUrl: string
  customerEmail?: string | null
  metadata?: Record<string, string>
}): Stripe.Checkout.SessionCreateParams {
  const mode = input.payment.billing === 'one_time' ? 'payment' : 'subscription'
  const allowTrials = process.env.KENOMI_ALLOW_STRIPE_TRIALS === 'true'
  const effectiveTrialDays = allowTrials ? input.payment.trial_days : 0

  const priceData: NonNullable<
    NonNullable<Stripe.Checkout.SessionCreateParams['line_items']>[number]['price_data']
  > = {
    currency: input.payment.price_currency.toLowerCase(),
    unit_amount: input.payment.price_amount,
    product_data: {
      name: input.payment.product_name,
      description: input.payment.checkout_description,
    },
  }

  if (mode === 'subscription') {
    priceData.recurring = {
      interval: input.payment.billing === 'yearly' ? 'year' : 'month',
    }
  }

  return {
    mode,
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
    metadata: { venture_id: input.ventureId, ...(input.metadata ?? {}) },
    ...(input.customerEmail ? { customer_email: input.customerEmail } : {}),
    line_items: [
      {
        quantity: 1,
        price_data: priceData,
      },
    ],
    ...(mode === 'subscription' && effectiveTrialDays > 0
      ? { subscription_data: { trial_period_days: effectiveTrialDays } }
      : {}),
  }
}
