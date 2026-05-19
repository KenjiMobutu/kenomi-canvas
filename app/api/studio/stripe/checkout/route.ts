import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requiresApproval } from '@/lib/autonomy/policy'
import { requireAllowedUser } from '@/lib/auth-server'
import { apiError } from '@/lib/api-response'
import { isRateLimited } from '@/lib/rate-limit'
import {
  buildCheckoutAutonomyAction,
  buildCheckoutSessionParams,
  getCheckoutEnvironment,
  parsePaymentOutput,
} from '@/lib/stripe/checkout-action'
import { createStripeClientFromSecretKey, getOptionalStripeSecretKey } from '@/lib/stripe/server'

const checkoutRequestSchema = z.object({
  ventureId: z.string().min(1).optional(),
  successUrl: z.string().url().optional(),
  cancelUrl: z.string().url().optional(),
})

type PipelineWithPayment = {
  id: string
  venture_id: string | null
  payment_output: string | null
}

function defaultCheckoutUrls(origin: string) {
  return {
    successUrl: `${origin}/studio/ventures?checkout=success`,
    cancelUrl: `${origin}/studio/ventures?checkout=cancelled`,
  }
}

async function getStripeSecretKeyForUser(input: {
  supabase: Awaited<ReturnType<typeof requireAllowedUser>>['supabase']
  userId: string
}): Promise<string | null> {
  const envKey = getOptionalStripeSecretKey()
  if (envKey) return envKey

  const { data, error } = await input.supabase
    .from('user_settings')
    .select('stripe_secret_key')
    .eq('user_id', input.userId)
    .maybeSingle()

  if (error) throw new Error(error.message)

  const key = data?.stripe_secret_key
  return typeof key === 'string' && key.trim().length > 0 ? key.trim() : null
}

export async function POST(req: NextRequest) {
  const cookieStore = await cookies()
  const { user, supabase, response } = await requireAllowedUser(cookieStore)
  if (response) return response

  if (isRateLimited(`stripe-checkout:${user!.id}`, { limit: 10, windowMs: 60_000 })) {
    return apiError('Trop de créations checkout. Réessayez dans une minute.', 429)
  }

  const parsedBody = checkoutRequestSchema.safeParse(await req.json().catch(() => ({})))
  if (!parsedBody.success) {
    return apiError('Payload checkout invalide', 400)
  }

  let pipelineQuery = supabase
    .from('venture_pipeline')
    .select('id, venture_id, payment_output')
    .eq('user_id', user!.id)
    .in('status', ['approved', 'done'])
    .not('venture_id', 'is', null)
    .not('payment_output', 'is', null)

  if (parsedBody.data.ventureId) {
    pipelineQuery = pipelineQuery.eq('venture_id', parsedBody.data.ventureId)
  }

  const { data: pipeline, error: pipelineError } = await pipelineQuery
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (pipelineError) return apiError(pipelineError.message, 500)

  const typedPipeline = pipeline as PipelineWithPayment | null
  if (!typedPipeline?.venture_id || !typedPipeline.payment_output) {
    return apiError('Aucun pipeline approuvé avec configuration paiement', 404)
  }

  let payment
  try {
    payment = parsePaymentOutput(typedPipeline.payment_output)
  } catch {
    return apiError('Configuration paiement invalide', 422)
  }

  const environment = getCheckoutEnvironment()
  const actionPolicy = buildCheckoutAutonomyAction({ environment })
  const approvalRequired = requiresApproval(actionPolicy)
  const nowIso = new Date().toISOString()
  const urls = {
    ...defaultCheckoutUrls(req.nextUrl.origin),
    ...parsedBody.data,
  }

  const { data: action, error: actionError } = await supabase
    .from('autonomy_actions')
    .insert({
      user_id: user!.id,
      venture_id: typedPipeline.venture_id,
      action_type: 'create_checkout',
      risk_level: actionPolicy.riskLevel,
      status: approvalRequired ? 'blocked' : 'running',
      input: {
        pipeline_id: typedPipeline.id,
        payment,
        environment,
        successUrl: urls.successUrl,
        cancelUrl: urls.cancelUrl,
      },
      output: {},
      created_at: nowIso,
      updated_at: nowIso,
    })
    .select('id')
    .single()

  if (actionError || !action?.id) {
    return apiError(actionError?.message ?? "Impossible de créer l'action checkout", 500)
  }

  if (approvalRequired) {
    const { error: approvalError } = await supabase.from('human_approvals').insert({
      user_id: user!.id,
      action_id: action.id,
      status: 'pending',
      reason: 'Création Stripe Checkout en production',
      created_at: nowIso,
      updated_at: nowIso,
    })

    if (approvalError) return apiError(approvalError.message, 500)

    return NextResponse.json(
      {
        ok: true,
        approvalRequired: true,
        actionId: action.id,
      },
      { status: 202 }
    )
  }

  try {
    const stripeSecretKey = await getStripeSecretKeyForUser({
      supabase,
      userId: user!.id,
    })
    if (!stripeSecretKey) throw new Error('STRIPE_SECRET_KEY missing')

    const stripe = createStripeClientFromSecretKey(stripeSecretKey)
    const session = await stripe.checkout.sessions.create(
      buildCheckoutSessionParams({
        payment,
        ventureId: typedPipeline.venture_id,
        successUrl: urls.successUrl,
        cancelUrl: urls.cancelUrl,
      })
    )

    const { error: paymentError } = await supabase.from('payments').insert({
      venture_id: typedPipeline.venture_id,
      stripe_session_id: session.id,
      stripe_payment_intent_id:
        typeof session.payment_intent === 'string' ? session.payment_intent : null,
      amount_eur: payment.price_amount / 100,
      currency: payment.price_currency.toLowerCase(),
      status: 'pending',
      provider_status: 'ready',
      provider_session_id: session.id,
      customer_email: session.customer_details?.email ?? null,
      checkout_url: session.url,
      checkout_mode: session.mode,
      autonomy_action_id: action.id,
      created_at: nowIso,
      updated_at: nowIso,
    })

    if (paymentError) throw new Error(paymentError.message)

    await supabase
      .from('autonomy_actions')
      .update({
        status: 'completed',
        output: {
          stripe_session_id: session.id,
          checkout_url: session.url,
        },
        updated_at: new Date().toISOString(),
      })
      .eq('id', action.id)

    return NextResponse.json({
      ok: true,
      approvalRequired: false,
      actionId: action.id,
      checkoutUrl: session.url,
      stripeSessionId: session.id,
    })
  } catch (error) {
    await supabase
      .from('autonomy_actions')
      .update({
        status: 'failed',
        output: {
          error: error instanceof Error ? error.message : 'Stripe checkout failed',
        },
        updated_at: new Date().toISOString(),
      })
      .eq('id', action.id)

    return apiError(
      error instanceof Error ? error.message : 'Création checkout Stripe échouée',
      500
    )
  }
}
