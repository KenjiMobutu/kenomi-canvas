import type Stripe from 'stripe'
import { describe, expect, it } from 'vitest'
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
    ventures: [
      {
        id: 'venture-1',
        user_id: 'user-1',
        revenus_total: seed?.revenue ?? 0,
      },
    ],
    venture_events: [] as Record<string, unknown>[],
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
          ;(tables[table] as Record<string, unknown>[]).push(state.insertRow)
          return { data: state.insertRow, error: null }
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

    const result = await handleStripeWebhookEvent({
      supabase: supabase as unknown as StripeWebhookSupabase,
      event: checkoutCompletedEvent(),
      now: () => new Date('2026-05-18T12:00:00.000Z'),
    })

    expect(result).toEqual({ ok: true, handled: true })
    expect(supabase.tables.payments[0]).toMatchObject({
      status: 'completed',
      stripe_payment_intent_id: 'pi_test_123',
      customer_email: 'founder@example.com',
    })
    expect(supabase.tables.venture_events[0]).toMatchObject({
      user_id: 'user-1',
      venture_id: 'venture-1',
      event_type: 'payment_succeeded',
      source: 'stripe',
      value: 2900,
    })
    expect(supabase.tables.ventures[0].revenus_total).toBe(29)
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
})
