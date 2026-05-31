import { describe, expect, it } from 'vitest'
import { buildCashAttributionSnapshot, syncPaymentAttribution } from '@/lib/revenue/cash-attribution'

function createFakeSupabase(seed?: { payment_attributions?: Record<string, unknown>[] }) {
  const tables = {
    payment_attributions: seed?.payment_attributions ?? [],
  }

  return {
    tables,
    from(tableName: keyof typeof tables) {
      const state = {
        filters: [] as Array<{ field: string; value: unknown }>,
        insertRow: null as Record<string, unknown> | null,
        updateRow: null as Record<string, unknown> | null,
      }

      const matchingRows = () =>
        tables[tableName].filter((row) =>
          state.filters.every((filter) => row[filter.field] === filter.value)
        )

      const execute = async () => {
        if (state.insertRow) {
          const inserted = {
            id: `attr-${tables[tableName].length + 1}`,
            ...state.insertRow,
          }
          tables[tableName].push(inserted)
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
        maybeSingle: async () => {
          const result = await execute()
          return { data: (result.data as Record<string, unknown>[])[0] ?? null, error: null }
        },
        insert: (row: Record<string, unknown>) => {
          state.insertRow = row
          return builder
        },
        update: (row: Record<string, unknown>) => {
          state.updateRow = row
          return builder
        },
        then: (onfulfilled: (value: Awaited<ReturnType<typeof execute>>) => unknown) =>
          execute().then(onfulfilled),
      }

      return builder
    },
  }
}

describe('cash attribution', () => {
  it('builds paid cash truth by offer and segment', () => {
    const snapshot = buildCashAttributionSnapshot({
      rows: [
        {
          checkout_session_id: 'cs_1',
          offer_id: 'offer-a',
          offer_variant: 'core',
          source: 'linkedin',
          band: 'warm',
          amount_eur: 2900,
          currency: 'eur',
          payment_status: 'completed',
          attribution_status: 'exact',
          confidence_score: 1,
        },
        {
          checkout_session_id: 'cs_2',
          offer_id: 'offer-a',
          offer_variant: 'core',
          source: 'linkedin',
          band: 'warm',
          amount_eur: 1900,
          currency: 'eur',
          payment_status: 'pending',
          attribution_status: 'inferred',
          confidence_score: 0.6,
        },
        {
          checkout_session_id: 'cs_3',
          offer_id: 'offer-b',
          offer_variant: 'audit',
          source: 'reddit',
          band: 'hot',
          amount_eur: 4900,
          currency: 'eur',
          payment_status: 'completed',
          attribution_status: 'unknown',
          confidence_score: 0.2,
        },
      ],
    })

    expect(snapshot.overview).toMatchObject({
      totalRows: 3,
      paidRows: 2,
      attributedCashEur: 78,
      pendingCashEur: 19,
      exactRows: 1,
      inferredRows: 1,
      unknownRows: 1,
      confidenceRate: 53.3,
    })
    expect(snapshot.offerBreakdown[0]).toMatchObject({
      offerId: 'offer-b',
      offerVariant: 'audit',
      paidCashEur: 49,
    })
    expect(snapshot.segmentBreakdown[0]).toMatchObject({
      key: 'reddit:hot',
      paidCashEur: 49,
      pendingCashEur: 0,
    })
    expect(snapshot.segmentBreakdown[1]).toMatchObject({
      key: 'linkedin:warm',
      paidCashEur: 29,
      pendingCashEur: 19,
    })
    expect(snapshot.bestOfferByCash).toMatchObject({
      offerId: 'offer-b',
      offerVariant: 'audit',
      paidCashEur: 49,
    })
    expect(snapshot.bestSegmentByCash).toMatchObject({
      key: 'reddit:hot',
      paidCashEur: 49,
    })
  })

  it('updates an existing attribution row by checkout session', async () => {
    const supabase = createFakeSupabase({
      payment_attributions: [
        {
          id: 'attr-1',
          checkout_session_id: 'cs_1',
          payment_status: 'pending',
          amount_eur: 29,
          attribution_status: 'inferred',
          confidence_score: 0.4,
        },
      ],
    })

    await syncPaymentAttribution({
      supabase,
      row: {
        user_id: 'user-1',
        checkout_session_id: 'cs_1',
        stripe_payment_intent_id: 'pi_1',
        payment_status: 'completed',
        amount_eur: 29,
        currency: 'eur',
        attribution_status: 'exact',
        confidence_score: 1,
      },
    })

    expect(supabase.tables.payment_attributions[0]).toMatchObject({
      checkout_session_id: 'cs_1',
      stripe_payment_intent_id: 'pi_1',
      payment_status: 'completed',
      attribution_status: 'exact',
      confidence_score: 1,
    })
  })
})
