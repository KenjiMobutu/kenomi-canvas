import type { FulfillmentProvider } from './types'

export interface FulfillmentPaymentRow {
  id: string
  user_id: string
  venture_id: string
  customer_email?: string | null
  amount_eur?: number | string | null
}

export interface FulfillmentSupabase {
  from(table: string): any
}

export async function triggerFulfillmentForPayment(input: {
  supabase: FulfillmentSupabase
  provider: FulfillmentProvider
  payment: FulfillmentPaymentRow
  offerName: string
  now?: () => Date
}) {
  const nowIso = (input.now ?? (() => new Date()))().toISOString()
  const amountEur = Number(input.payment.amount_eur ?? 0)

  const { data, error } = await input.supabase
    .from('fulfillment_deliveries')
    .insert({
      user_id: input.payment.user_id,
      venture_id: input.payment.venture_id,
      payment_id: input.payment.id,
      provider: 'n8n',
      status: 'running',
      customer_email: input.payment.customer_email ?? null,
      input: {
        offer_name: input.offerName,
        amount_eur: amountEur,
      },
      output: {},
      created_at: nowIso,
      updated_at: nowIso,
    })
    .select('*')
    .single()
  const delivery = data as { id?: string | null } | null

  if (error || !delivery?.id) {
    throw new Error(error?.message ?? 'fulfillment_delivery_insert_failed')
  }

  try {
    const result = await input.provider.deliver({
      deliveryId: String(delivery.id),
      ventureId: input.payment.venture_id,
      paymentId: input.payment.id,
      customerEmail: input.payment.customer_email ?? null,
      offerName: input.offerName,
      amountEur,
    })

    await input.supabase
      .from('fulfillment_deliveries')
      .update({
        status: 'completed',
        output: result,
        completed_at: nowIso,
        updated_at: nowIso,
      })
      .eq('id', delivery.id)
      .eq('user_id', input.payment.user_id)

    return { status: 'completed' as const, deliveryId: String(delivery.id), result }
  } catch (error) {
    await input.supabase
      .from('fulfillment_deliveries')
      .update({
        status: 'failed',
        last_error: error instanceof Error ? error.message : String(error),
        updated_at: nowIso,
      })
      .eq('id', delivery.id)
      .eq('user_id', input.payment.user_id)

    throw error
  }
}
