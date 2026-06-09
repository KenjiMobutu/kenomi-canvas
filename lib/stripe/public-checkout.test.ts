import { describe, expect, it, vi } from 'vitest'
import { createPublicCheckoutSession } from './public-checkout'

const paymentOutput = JSON.stringify({
  product_name: 'NoteFast',
  price_amount: 1999,
  price_currency: 'eur',
  billing: 'monthly',
  checkout_description: 'Notes actionnables pour independants.',
  trial_days: 7,
})

function createFakeSupabase(seed: Record<string, Record<string, unknown>[]>) {
  const tables = seed

  return {
    tables,
    from(tableName: string) {
      let rows = [...(tables[tableName] ?? [])]

      const builder = {
        select: () => builder,
        eq: (field: string, value: unknown) => {
          rows = rows.filter((row) => row[field] === value)
          return builder
        },
        in: (field: string, values: unknown[]) => {
          rows = rows.filter((row) => values.includes(row[field]))
          return builder
        },
        not: (field: string, operator: string, value: unknown) => {
          if (operator === 'is' && value === null) {
            rows = rows.filter((row) => row[field] !== null && row[field] !== undefined)
          }
          return builder
        },
        order: () => builder,
        limit: (count: number) => {
          rows = rows.slice(0, count)
          return builder
        },
        maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
        insert: async (row: Record<string, unknown>) => {
          tables[tableName] = [...(tables[tableName] ?? []), row]
          return { error: null }
        },
      }
      return builder
    },
  }
}

describe('createPublicCheckoutSession', () => {
  it('crée une session Stripe neuve depuis une landing publique et trace le checkout', async () => {
    const supabase = createFakeSupabase({
      ventures: [{ id: 'venture-1', user_id: 'user-1', slug: 'notefast', statut: 'actif' }],
      prospects: [
        {
          id: 'prospect-1',
          user_id: 'user-1',
          source: 'other',
          band: 'warm',
          offer_variant: '300eur-diagnostic',
          outreach_angle: 'diagnostic-call-outbound-v6-direct-value',
        },
      ],
      venture_pipeline: [
        {
          id: 'pipeline-1',
          venture_id: 'venture-1',
          user_id: 'user-1',
          status: 'approved',
          payment_output: paymentOutput,
        },
      ],
      user_settings: [{ user_id: 'user-1', stripe_secret_key: 'sk_test_settings' }],
      payments: [],
      payment_attributions: [],
      venture_events: [],
    })
    const stripeCreate = vi.fn(async () => ({
      id: 'cs_test_public',
      url: 'https://checkout.stripe.test/public',
      mode: 'subscription' as const,
      payment_intent: null,
      customer_details: { email: null },
    }))

    const result = await createPublicCheckoutSession({
      supabase,
      stripeClientFactory: () => ({ checkout: { sessions: { create: stripeCreate } } }),
      slug: 'notefast',
      origin: 'https://lab.kenomi.eu',
      customerEmail: 'buyer@test.local',
      prospectId: 'prospect-1',
      attribution: {
        utm_source: 'linkedin',
        utm_medium: 'social',
        utm_campaign: 'audit-may',
        utm_content: 'hero-cta',
      },
      now: () => new Date('2026-05-19T21:40:00.000Z'),
    })

    expect(result).toEqual({
      checkoutUrl: 'https://checkout.stripe.test/public',
      stripeSessionId: 'cs_test_public',
      ventureId: 'venture-1',
      expectedAmountEur: 19.99,
    })
    expect(stripeCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        success_url: 'https://lab.kenomi.eu/notefast?payment=success',
        cancel_url: 'https://lab.kenomi.eu/notefast?payment=cancelled',
        customer_email: 'buyer@test.local',
        metadata: {
          venture_id: 'venture-1',
          source: 'public_landing',
          slug: 'notefast',
          pipeline_id: 'pipeline-1',
          prospect_id: 'prospect-1',
          outreach_angle: 'diagnostic-call-outbound-v6-direct-value',
          utm_source: 'linkedin',
          utm_medium: 'social',
          utm_campaign: 'audit-may',
          utm_content: 'hero-cta',
        },
      })
    )
    expect(supabase.tables.payments[0]).toMatchObject({
      venture_id: 'venture-1',
      stripe_session_id: 'cs_test_public',
      amount_eur: 19.99,
      expected_amount_eur: 19.99,
      collected_amount_eur: 0,
      trial_days: 7,
      provider_status: 'ready',
      customer_email: 'buyer@test.local',
    })
    expect(supabase.tables.payment_attributions[0]).toMatchObject({
      user_id: 'user-1',
      venture_id: 'venture-1',
      checkout_session_id: 'cs_test_public',
      amount_eur: 19.99,
      payment_status: 'pending',
      attribution_status: 'unknown',
      prospect_id: 'prospect-1',
      offer_variant: '300eur-diagnostic',
      outreach_angle: 'diagnostic-call-outbound-v6-direct-value',
      source: 'other',
      band: 'warm',
    })
    expect(supabase.tables.venture_events[0]).toMatchObject({
      user_id: 'user-1',
      venture_id: 'venture-1',
      event_type: 'checkout_started',
      source: 'public_landing',
      value: 1999,
      metadata: expect.objectContaining({
        prospect_id: 'prospect-1',
        outreach_angle: 'diagnostic-call-outbound-v6-direct-value',
        utm_source: 'linkedin',
        utm_medium: 'social',
        utm_campaign: 'audit-may',
        utm_content: 'hero-cta',
      }),
    })
    expect(supabase.tables.venture_events[1]).toMatchObject({
      user_id: 'user-1',
      venture_id: 'venture-1',
      event_type: 'high_intent_lead',
      source: 'public_landing',
      value: 1999,
      metadata: expect.objectContaining({
        customer_email: 'buyer@test.local',
        prospect_id: 'prospect-1',
        outreach_angle: 'diagnostic-call-outbound-v6-direct-value',
        utm_source: 'linkedin',
      }),
    })
  })

  it('échoue clairement si aucune configuration paiement publique existe', async () => {
    const supabase = createFakeSupabase({
      ventures: [{ id: 'venture-1', user_id: 'user-1', slug: 'notefast', statut: 'actif' }],
      venture_pipeline: [],
      user_settings: [{ user_id: 'user-1', stripe_secret_key: 'sk_test_settings' }],
    })

    await expect(
      createPublicCheckoutSession({
        supabase,
        stripeClientFactory: () => ({ checkout: { sessions: { create: vi.fn() } } }),
        slug: 'notefast',
        origin: 'https://lab.kenomi.eu',
      })
    ).rejects.toThrow('payment_configuration_missing')
  })

  it("retombe sur le prospect trouvé par email quand l'id tracké ne matche rien", async () => {
    const supabase = createFakeSupabase({
      ventures: [{ id: 'venture-1', user_id: 'user-1', slug: 'notefast', statut: 'actif' }],
      prospects: [
        {
          id: 'prospect-real',
          user_id: 'user-1',
          contact_email: 'buyer@test.local',
          source: 'other',
          band: 'hot',
          offer_variant: '300eur-diagnostic',
          outreach_angle: 'diagnostic-call-outbound-v7-permission-ask',
        },
      ],
      venture_pipeline: [
        {
          id: 'pipeline-1',
          venture_id: 'venture-1',
          user_id: 'user-1',
          status: 'approved',
          payment_output: paymentOutput,
        },
      ],
      user_settings: [{ user_id: 'user-1', stripe_secret_key: 'sk_test_settings' }],
      payments: [],
      payment_attributions: [],
      venture_events: [],
    })
    const stripeCreate = vi.fn(async () => ({
      id: 'cs_test_public_fallback',
      url: 'https://checkout.stripe.test/public-fallback',
      mode: 'subscription' as const,
      payment_intent: null,
      customer_details: { email: 'buyer@test.local' },
    }))

    await createPublicCheckoutSession({
      supabase,
      stripeClientFactory: () => ({ checkout: { sessions: { create: stripeCreate } } }),
      slug: 'notefast',
      origin: 'https://lab.kenomi.eu',
      customerEmail: 'buyer@test.local',
      prospectId: 'prospect-missing',
      now: () => new Date('2026-05-19T21:40:00.000Z'),
    })

    expect(stripeCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          prospect_id: 'prospect-real',
          outreach_angle: 'diagnostic-call-outbound-v7-permission-ask',
        }),
      })
    )
    expect(supabase.tables.payment_attributions[0]).toMatchObject({
      prospect_id: 'prospect-real',
      outreach_angle: 'diagnostic-call-outbound-v7-permission-ask',
      source: 'other',
      band: 'hot',
    })
    expect(supabase.tables.venture_events[0]).toMatchObject({
      metadata: expect.objectContaining({
        prospect_id: 'prospect-real',
      }),
    })
  })
})
