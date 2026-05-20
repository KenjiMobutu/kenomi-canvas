import type Stripe from 'stripe'
import { insertAuditEvent } from '@/lib/audit-log'
import { createN8nFulfillmentProvider } from '@/lib/fulfillment/n8n'
import { triggerFulfillmentForPayment } from '@/lib/fulfillment/trigger'
import type { FulfillmentProvider } from '@/lib/fulfillment/types'
import { buildVentureEventInsert } from '@/lib/venture-events'

interface QueryBuilder {
  select(columns?: string): QueryBuilder
  eq(field: string, value: unknown): QueryBuilder
  insert(row: Record<string, unknown>): QueryBuilder
  update(row: Record<string, unknown>): QueryBuilder
  single(): Promise<{ data: unknown; error: { message: string } | null }>
  maybeSingle(): Promise<{ data: unknown; error: { message: string } | null }>
  then<TResult1 = { data: unknown; error: { message: string } | null }, TResult2 = never>(
    onfulfilled?:
      | ((value: {
          data: unknown
          error: { message: string } | null
        }) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): PromiseLike<TResult1 | TResult2>
}

export interface StripeWebhookSupabase {
  from(table: string): QueryBuilder
}

type WebhookResult =
  | { ok: true; handled: true }
  | { ok: true; handled: false; reason: string }
  | { ok: false; error: string }

interface PaymentRow {
  id?: string
  venture_id: string | null
  stripe_session_id: string | null
  amount_eur: number | string
  expected_amount_eur?: number | string | null
  collected_amount_eur?: number | string | null
  status: string | null
  customer_email?: string | null
}

interface VentureRow {
  id: string
  user_id: string
}

function getStringId(value: string | Stripe.PaymentIntent | null): string | null {
  if (typeof value === 'string') return value
  return value?.id ?? null
}

function getCustomerEmail(session: Stripe.Checkout.Session): string | null {
  return session.customer_details?.email ?? session.customer_email ?? null
}

async function maybeSingle<T>(query: QueryBuilder): Promise<T | null> {
  const { data, error } = await query.maybeSingle()
  if (error) throw new Error(error.message)
  return data as T | null
}

async function recalculateVentureRevenue(input: {
  supabase: StripeWebhookSupabase
  ventureId: string
}) {
  const { data, error } = await input.supabase
    .from('payments')
    .select('amount_eur, collected_amount_eur')
    .eq('venture_id', input.ventureId)
    .eq('status', 'completed')

  if (error) throw new Error(error.message)

  const revenue = (
    (data as Array<{
      amount_eur: number | string
      collected_amount_eur?: number | string | null
    }> | null) ?? []
  ).reduce(
    (sum, payment) => sum + Number(payment.collected_amount_eur ?? payment.amount_eur ?? 0),
    0
  )

  const update = await input.supabase
    .from('ventures')
    .update({ revenus_total: revenue })
    .eq('id', input.ventureId)

  if (update.error) throw new Error(update.error.message)
}

export async function handleStripeWebhookEvent(input: {
  supabase: StripeWebhookSupabase
  event: Stripe.Event
  now?: () => Date
  fulfillmentProvider?: FulfillmentProvider
  fulfillmentOfferName?: string
}): Promise<WebhookResult> {
  if (input.event.type !== 'checkout.session.completed') {
    return { ok: true, handled: false, reason: 'ignored_event' }
  }

  const session = input.event.data.object as Stripe.Checkout.Session
  const payment = await maybeSingle<PaymentRow>(
    input.supabase
      .from('payments')
      .select(
        'id, venture_id, stripe_session_id, amount_eur, expected_amount_eur, collected_amount_eur, status, customer_email'
      )
      .eq('stripe_session_id', session.id)
  )

  if (!payment?.venture_id) {
    return { ok: true, handled: false, reason: 'payment_not_found' }
  }

  if (payment.status === 'completed') {
    return { ok: true, handled: false, reason: 'already_completed' }
  }

  const venture = await maybeSingle<VentureRow>(
    input.supabase.from('ventures').select('id, user_id').eq('id', payment.venture_id)
  )

  if (!venture) {
    return { ok: true, handled: false, reason: 'venture_not_found' }
  }

  const nowIso = (input.now ?? (() => new Date()))().toISOString()
  const amountCents =
    typeof session.amount_total === 'number'
      ? session.amount_total
      : Math.round(Number(payment.amount_eur || 0) * 100)
  const expectedAmountEur = Number(payment.expected_amount_eur ?? payment.amount_eur ?? 0)
  const collectedAmountEur = amountCents / 100

  const paymentUpdate = await input.supabase
    .from('payments')
    .update({
      status: 'completed',
      provider_status: 'completed',
      expected_amount_eur: expectedAmountEur,
      collected_amount_eur: collectedAmountEur,
      stripe_payment_intent_id: getStringId(session.payment_intent),
      customer_email: getCustomerEmail(session),
      updated_at: nowIso,
    })
    .eq('stripe_session_id', session.id)

  if (paymentUpdate.error) return { ok: false, error: paymentUpdate.error.message }

  const eventInsert = await input.supabase.from('venture_events').insert(
    buildVentureEventInsert({
      userId: venture.user_id,
      ventureId: venture.id,
      eventType: 'payment_succeeded',
      source: 'stripe',
      value: amountCents,
      metadata: {
        stripe_session_id: session.id,
        stripe_payment_intent_id: getStringId(session.payment_intent),
        currency: session.currency,
      },
      occurredAt: input.now?.(),
    })
  )

  if (eventInsert.error) return { ok: false, error: eventInsert.error.message }

  await recalculateVentureRevenue({
    supabase: input.supabase,
    ventureId: venture.id,
  })

  try {
    await triggerFulfillmentForPayment({
      supabase: input.supabase,
      provider: input.fulfillmentProvider ?? createN8nFulfillmentProvider(),
      payment: {
        id: payment.id ?? session.id,
        user_id: venture.user_id,
        venture_id: venture.id,
        customer_email: getCustomerEmail(session) ?? payment.customer_email ?? null,
        amount_eur: collectedAmountEur || Number(payment.collected_amount_eur ?? payment.amount_eur ?? 0),
      },
      offerName: input.fulfillmentOfferName ?? 'Kenomi delivery',
      now: input.now,
    })
  } catch (error) {
    await insertAuditEvent(input.supabase, {
      user_id: venture.user_id,
      event_type: 'fulfillment_delivery_failed',
      severity: 'error',
      metadata: {
        venture_id: venture.id,
        payment_id: payment.id ?? session.id,
        stripe_session_id: session.id,
        message: error instanceof Error ? error.message : String(error),
      },
    })
  }

  return { ok: true, handled: true }
}
