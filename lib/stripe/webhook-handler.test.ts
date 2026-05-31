import type Stripe from 'stripe'
import { describe, expect, it, vi } from 'vitest'
import { handleStripeWebhookEvent, type StripeWebhookSupabase } from './webhook-handler'

function createFakeSupabase(seed?: { paymentStatus?: string; revenue?: number }) {
  const tables = {
    payments: [
      {
        id: 'payment-1',
        venture_id: 'venture-1',
        stripe_session_id: 'cs_test_123',
        stripe_payment_intent_id: null,
        amount_eur: 29,
        currency: 'eur',
        status: seed?.paymentStatus ?? 'pending',
        customer_email: null,
      },
    ],
    payment_attributions: [
      {
        id: 'attr-1',
        user_id: 'user-1',
        venture_id: 'venture-1',
        checkout_session_id: 'cs_test_123',
        amount_eur: 29,
        currency: 'eur',
        payment_status: 'pending',
        attribution_status: 'unknown',
        confidence_score: 0,
      },
    ],
    ventures: [
      {
        id: 'venture-1',
        user_id: 'user-1',
        revenus_total: seed?.revenue ?? 0,
      },
    ],
    venture_events: [] as Record<string, unknown>[],
    fulfillment_deliveries: [] as Record<string, unknown>[],
    agent_events: [] as Record<string, unknown>[],
  }

  const supabase = {
    tables,
    from(table: keyof typeof tables) {
      const state = {
        filters: [] as Array<{ field: string; value: unknown }>,
        insertRow: null as Record<string, unknown> | null,
        updateRow: null as Record<string, unknown> | null,
      }

      const matchingRows = () =>
        (tables[table] as Record<string, unknown>[]).filter((row) =>
          state.filters.every((filter) => row[filter.field] === filter.value)
        )

      const execute = async () => {
        if (state.insertRow) {
          const inserted = {
            id: `row-${(tables[table] as Record<string, unknown>[]).length + 1}`,
            ...state.insertRow,
          }
          ;(tables[table] as Record<string, unknown>[]).push(inserted)
          return { data: inserted, error: null }
        }

        if (state.updateRow) {
          matchingRows().forEach((row) => Object.assign(row, state.updateRow))
          return { data: matchingRows(), error: null }
        }

        return { data: matchingRows(), error: null }
      }

      const builder = {
        select: () => builder,
        eq: (field: string, value: unknown) => {
          state.filters.push({ field, value })
          return builder
        },
        insert: (row: Record<string, unknown>) => {
          state.insertRow = row
          return builder
        },
        update: (row: Record<string, unknown>) => {
          state.updateRow = row
          return builder
        },
        maybeSingle: async () => {
          const result = await execute()
          return { data: (result.data as unknown[])[0] ?? null, error: null }
        },
        single: async () => {
          const result = await execute()
          return { data: result.data as Record<string, unknown>, error: null }
        },
        then: (onFulfilled: (value: Awaited<ReturnType<typeof execute>>) => unknown) =>
          execute().then(onFulfilled),
      }
      return builder
    },
  }

  return supabase
}

function checkoutCompletedEvent(): Stripe.Event {
  return {
    id: 'evt_123',
    type: 'checkout.session.completed',
    data: {
      object: {
        id: 'cs_test_123',
        object: 'checkout.session',
        amount_total: 2900,
        currency: 'eur',
        customer_details: { email: 'founder@example.com' },
        metadata: { venture_id: 'venture-1' },
        payment_intent: 'pi_test_123',
      },
    },
  } as unknown as Stripe.Event
}

describe('handleStripeWebhookEvent', () => {
  it('updates payment, records event, and recalculates venture revenue', async () => {
    const supabase = createFakeSupabase()
    const fulfillmentProvider = {
      deliver: vi.fn().mockResolvedValue({
        externalId: 'fulfill-1',
        accessUrl: 'https://x.test/access',
      }),
    }

    const result = await handleStripeWebhookEvent({
      supabase: supabase as unknown as StripeWebhookSupabase,
      event: checkoutCompletedEvent(),
      now: () => new Date('2026-05-18T12:00:00.000Z'),
      fulfillmentProvider,
    })

    expect(result).toEqual({ ok: true, handled: true })
    expect(supabase.tables.payments[0]).toMatchObject({
      status: 'completed',
      provider_status: 'completed',
      stripe_payment_intent_id: 'pi_test_123',
      customer_email: 'founder@example.com',
    })
    expect(supabase.tables.payment_attributions[0]).toMatchObject({
      checkout_session_id: 'cs_test_123',
      stripe_payment_intent_id: 'pi_test_123',
      payment_status: 'completed',
      amount_eur: 29,
    })
    expect(supabase.tables.venture_events[0]).toMatchObject({
      user_id: 'user-1',
      venture_id: 'venture-1',
      event_type: 'payment_succeeded',
      source: 'stripe',
      value: 2900,
    })
    expect(supabase.tables.ventures[0].revenus_total).toBe(29)
    expect(fulfillmentProvider.deliver).toHaveBeenCalledWith(
      expect.objectContaining({
        paymentId: 'payment-1',
        ventureId: 'venture-1',
        customerEmail: 'founder@example.com',
        amountEur: 29,
      })
    )
  })

  it('distingue montant attendu et montant encaisse pour un checkout trial a 0 EUR', async () => {
    const supabase = createFakeSupabase()
    const event = checkoutCompletedEvent()
    ;(event.data.object as Stripe.Checkout.Session).amount_total = 0
    ;(event.data.object as Stripe.Checkout.Session).payment_intent = null

    const result = await handleStripeWebhookEvent({
      supabase: supabase as unknown as StripeWebhookSupabase,
      event,
      now: () => new Date('2026-05-18T12:00:00.000Z'),
    })

    expect(result).toEqual({ ok: true, handled: true })
    expect(supabase.tables.payments[0]).toMatchObject({
      amount_eur: 29,
      expected_amount_eur: 29,
      collected_amount_eur: 0,
      status: 'completed',
      provider_status: 'completed',
    })
    expect(supabase.tables.venture_events[0]).toMatchObject({
      event_type: 'payment_succeeded',
      value: 0,
    })
    expect(supabase.tables.ventures[0].revenus_total).toBe(0)
  })

  it('does not duplicate events for already completed payments', async () => {
    const supabase = createFakeSupabase({ paymentStatus: 'completed', revenue: 29 })

    const result = await handleStripeWebhookEvent({
      supabase: supabase as unknown as StripeWebhookSupabase,
      event: checkoutCompletedEvent(),
    })

    expect(result).toEqual({ ok: true, handled: false, reason: 'already_completed' })
    expect(supabase.tables.venture_events).toEqual([])
    expect(supabase.tables.ventures[0].revenus_total).toBe(29)
  })

  it('ignores unsupported Stripe events', async () => {
    const supabase = createFakeSupabase()

    const result = await handleStripeWebhookEvent({
      supabase: supabase as unknown as StripeWebhookSupabase,
      event: { type: 'customer.created', data: { object: {} } } as Stripe.Event,
    })

    expect(result).toEqual({ ok: true, handled: false, reason: 'ignored_event' })
  })

  it('ignores unknown checkout sessions without crashing', async () => {
    const supabase = createFakeSupabase()
    supabase.tables.payments = []

    const result = await handleStripeWebhookEvent({
      supabase: supabase as unknown as StripeWebhookSupabase,
      event: checkoutCompletedEvent(),
    })

    expect(result).toEqual({ ok: true, handled: false, reason: 'payment_not_found' })
    expect(supabase.tables.venture_events).toEqual([])
  })

  it('logs fulfillment failures without failing the paid webhook', async () => {
    const supabase = createFakeSupabase()
    const fulfillmentProvider = {
      deliver: vi.fn().mockRejectedValue(new Error('n8n offline')),
    }

    const result = await handleStripeWebhookEvent({
      supabase: supabase as unknown as StripeWebhookSupabase,
      event: checkoutCompletedEvent(),
      now: () => new Date('2026-05-18T12:00:00.000Z'),
      fulfillmentProvider,
    })

    expect(result).toEqual({ ok: true, handled: true })
    expect(supabase.tables.payments[0]).toMatchObject({ status: 'completed' })
    expect(supabase.tables.agent_events[0]).toMatchObject({
      user_id: 'user-1',
      event_type: 'fulfillment_delivery_failed',
      severity: 'error',
    })
  })
})
