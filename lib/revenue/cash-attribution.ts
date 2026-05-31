type PaymentAttributionRow = {
  id?: string
  user_id?: string | null
  venture_id?: string | null
  payment_provider?: string | null
  payment_reference?: string | null
  checkout_session_id?: string | null
  stripe_payment_intent_id?: string | null
  prospect_id?: string | null
  offer_id?: string | null
  offer_variant?: string | null
  outreach_angle?: string | null
  source?: string | null
  band?: string | null
  amount_eur?: number | string | null
  currency?: string | null
  payment_status?: string | null
  attribution_status?: string | null
  confidence_score?: number | string | null
  attributed_at?: string | null
  created_at?: string | null
  updated_at?: string | null
}

type QueryBuilder = {
  select(columns?: string): QueryBuilder
  eq(field: string, value: unknown): QueryBuilder
  maybeSingle(): Promise<{ data: unknown; error: { message: string } | null }>
  insert(row: Record<string, unknown>): QueryBuilder | Promise<{ error: { message: string } | null }>
  update?(row: Record<string, unknown>): QueryBuilder
  then?: <TResult1 = { data: unknown; error: { message: string } | null }, TResult2 = never>(
    onfulfilled?:
      | ((value: { data: unknown; error: { message: string } | null }) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ) => PromiseLike<TResult1 | TResult2>
}

type PaymentAttributionSupabase = {
  from(table: string): QueryBuilder
}

export type CashAttributionSnapshot = {
  overview: {
    totalRows: number
    paidRows: number
    attributedCashEur: number
    pendingCashEur: number
    exactRows: number
    inferredRows: number
    unknownRows: number
    confidenceRate: number
  }
  offerBreakdown: Array<{
    offerId: string | null
    offerVariant: string | null
    paidCashEur: number
    pendingCashEur: number
    paidRows: number
    totalRows: number
  }>
  segmentBreakdown: Array<{
    key: string
    source: string
    band: string
    paidCashEur: number
    pendingCashEur: number
    paidRows: number
    totalRows: number
  }>
  bestOfferByCash:
    | {
        offerId: string | null
        offerVariant: string | null
        paidCashEur: number
        pendingCashEur: number
        paidRows: number
        totalRows: number
      }
    | null
  bestSegmentByCash:
    | {
        key: string
        source: string
        band: string
        paidCashEur: number
        pendingCashEur: number
        paidRows: number
        totalRows: number
      }
    | null
}

function normalizeText(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
}

function toNumber(value: unknown) {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

function roundCurrency(value: number) {
  return Math.round(value * 100) / 100
}

function isPaidStatus(status: string | null | undefined) {
  return ['paid', 'completed', 'succeeded', 'success'].includes(String(status ?? '').toLowerCase())
}

function toEur(value: unknown) {
  const amount = toNumber(value)
  return amount > 1000 ? roundCurrency(amount / 100) : roundCurrency(amount)
}

function sortByCash(left: { paidCashEur: number; paidRows: number }, right: { paidCashEur: number; paidRows: number }) {
  return right.paidCashEur - left.paidCashEur || right.paidRows - left.paidRows
}

export function buildCashAttributionSnapshot(input: {
  rows: PaymentAttributionRow[]
}): CashAttributionSnapshot {
  const offerMap = new Map<string, CashAttributionSnapshot['offerBreakdown'][number]>()
  const segmentMap = new Map<string, CashAttributionSnapshot['segmentBreakdown'][number]>()

  let paidRows = 0
  let attributedCashEur = 0
  let pendingCashEur = 0
  let exactRows = 0
  let inferredRows = 0
  let unknownRows = 0

  for (const row of input.rows) {
    const paid = isPaidStatus(row.payment_status)
    const amountEur = toEur(row.amount_eur)
    const attributionStatus = normalizeText(row.attribution_status) ?? 'unknown'

    if (paid) {
      paidRows += 1
      attributedCashEur += amountEur
    } else {
      pendingCashEur += amountEur
    }

    if (attributionStatus === 'exact') exactRows += 1
    else if (attributionStatus === 'inferred') inferredRows += 1
    else unknownRows += 1

    const offerId = normalizeText(row.offer_id)
    const offerVariant = normalizeText(row.offer_variant)
    const offerKey = `${offerId ?? 'unassigned'}:${offerVariant ?? 'unassigned'}`
    const offerEntry = offerMap.get(offerKey) ?? {
      offerId,
      offerVariant,
      paidCashEur: 0,
      pendingCashEur: 0,
      paidRows: 0,
      totalRows: 0,
    }
    offerEntry.totalRows += 1
    if (paid) {
      offerEntry.paidRows += 1
      offerEntry.paidCashEur = roundCurrency(offerEntry.paidCashEur + amountEur)
    } else {
      offerEntry.pendingCashEur = roundCurrency(offerEntry.pendingCashEur + amountEur)
    }
    offerMap.set(offerKey, offerEntry)

    const source = normalizeText(row.source) ?? 'unknown'
    const band = normalizeText(row.band) ?? 'unknown'
    const segmentKey = `${source}:${band}`
    const segmentEntry = segmentMap.get(segmentKey) ?? {
      key: segmentKey,
      source,
      band,
      paidCashEur: 0,
      pendingCashEur: 0,
      paidRows: 0,
      totalRows: 0,
    }
    segmentEntry.totalRows += 1
    if (paid) {
      segmentEntry.paidRows += 1
      segmentEntry.paidCashEur = roundCurrency(segmentEntry.paidCashEur + amountEur)
    } else {
      segmentEntry.pendingCashEur = roundCurrency(segmentEntry.pendingCashEur + amountEur)
    }
    segmentMap.set(segmentKey, segmentEntry)
  }

  return {
    overview: {
      totalRows: input.rows.length,
      paidRows,
      attributedCashEur: roundCurrency(attributedCashEur),
      pendingCashEur: roundCurrency(pendingCashEur),
      exactRows,
      inferredRows,
      unknownRows,
      confidenceRate: ratio(exactRows + inferredRows * 0.6, input.rows.length),
    },
    offerBreakdown: [...offerMap.values()].sort(sortByCash),
    segmentBreakdown: [...segmentMap.values()].sort(sortByCash),
    bestOfferByCash: [...offerMap.values()].sort(sortByCash)[0] ?? null,
    bestSegmentByCash: [...segmentMap.values()].sort(sortByCash)[0] ?? null,
  }
}

function ratio(score: number, total: number) {
  if (total <= 0) return 0
  return Math.round((score / total) * 1000) / 10
}

async function maybeSingle<T>(query: QueryBuilder): Promise<T | null> {
  const { data, error } = await query.maybeSingle()
  if (error) throw new Error(error.message)
  return data as T | null
}

async function executeMutation(
  result:
    | Promise<{ error: { message: string } | null }>
    | QueryBuilder
) {
  const output = await Promise.resolve(
    result as PromiseLike<{ error: { message: string } | null }> | { error: { message: string } | null }
  )
  if (output?.error) throw new Error(output.error.message)
}

export async function syncPaymentAttribution(input: {
  supabase: PaymentAttributionSupabase
  row: PaymentAttributionRow
}) {
  const checkoutSessionId = normalizeText(input.row.checkout_session_id)
  const paymentIntentId = normalizeText(input.row.stripe_payment_intent_id)

  let existing: PaymentAttributionRow | null = null
  if (checkoutSessionId) {
    existing = await maybeSingle<PaymentAttributionRow>(
      input.supabase
        .from('payment_attributions')
        .select('*')
        .eq('checkout_session_id', checkoutSessionId)
    )
  }

  if (!existing && paymentIntentId) {
    existing = await maybeSingle<PaymentAttributionRow>(
      input.supabase
        .from('payment_attributions')
        .select('*')
        .eq('stripe_payment_intent_id', paymentIntentId)
    )
  }

  const nowIso = new Date().toISOString()
  const row = {
    ...input.row,
    checkout_session_id: checkoutSessionId,
    stripe_payment_intent_id: paymentIntentId,
    offer_id: normalizeText(input.row.offer_id),
    offer_variant: normalizeText(input.row.offer_variant),
    outreach_angle: normalizeText(input.row.outreach_angle),
    source: normalizeText(input.row.source),
    band: normalizeText(input.row.band),
    currency: normalizeText(input.row.currency) ?? 'eur',
    attribution_status: normalizeText(input.row.attribution_status) ?? 'unknown',
    confidence_score: toNumber(input.row.confidence_score),
    payment_status: normalizeText(input.row.payment_status) ?? 'pending',
    amount_eur: toEur(input.row.amount_eur),
    attributed_at: input.row.attributed_at ?? nowIso,
    updated_at: nowIso,
  }

  if (existing?.id) {
    const updateBuilder = input.supabase.from('payment_attributions')
    if (typeof updateBuilder.update !== 'function') {
      throw new Error('payment_attributions_update_not_supported')
    }
    await executeMutation(
      updateBuilder.update(row).eq('id', existing.id)
    )
    return
  }

  await executeMutation(
    input.supabase.from('payment_attributions').insert({
      ...row,
      created_at: nowIso,
    })
  )
}
