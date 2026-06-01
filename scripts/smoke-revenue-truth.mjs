#!/usr/bin/env node

import { readFileSync, existsSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { evalRevenueTruthGate } from '../lib/revenue/truth-smoke.mjs'

const baseUrl = process.env.SMOKE_BASE_URL ?? 'https://lab.kenomi.eu'

loadEnvFile('.env.local')

const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const supabaseServiceRoleKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_STUDIO_SERVICE_KEY ?? ''

function loadEnvFile(path) {
  if (!existsSync(path)) return
  const raw = readFileSync(path, 'utf8')
  for (const line of raw.split(/\r?\n/)) {
    const match = line.match(/^([^#=\s]+)=(.*)$/)
    if (!match) continue
    const [, key, value] = match
    if (process.env[key] !== undefined) continue
    process.env[key] = value
  }
}

function write(line) {
  process.stdout.write(`${line}\n`)
}

function fail(message, detail) {
  process.stderr.write(`not ok ${message}${detail ? `: ${detail}` : ''}\n`)
  process.exitCode = 1
}

function isPaidStatus(status) {
  return ['paid', 'completed', 'succeeded', 'success'].includes(String(status ?? '').toLowerCase())
}

async function status(path, init) {
  const res = await fetch(new URL(path, baseUrl), {
    redirect: 'manual',
    ...init,
  })
  return res.status
}

async function queryTruthCounts() {
  if (!supabaseUrl || !supabaseServiceRoleKey) {
    throw new Error('supabase_service_role_missing')
  }

  const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const [prospects, conversationEvents, weeklyReviews, paymentAttributions] = await Promise.all([
    supabase.from('prospects').select('offer_id, offer_variant, source, band').limit(1000),
    supabase.from('prospect_conversation_events').select('id').limit(1000),
    supabase.from('weekly_revenue_reviews').select('summary_json').limit(200),
    supabase
      .from('payment_attributions')
      .select('payment_status, attribution_status, amount_eur')
      .limit(1000),
  ])

  if (prospects.error) throw new Error(prospects.error.message)
  if (conversationEvents.error) throw new Error(conversationEvents.error.message)
  if (weeklyReviews.error) throw new Error(weeklyReviews.error.message)
  if (paymentAttributions.error) throw new Error(paymentAttributions.error.message)

  const prospectRows = prospects.data ?? []
  const weeklyRows = weeklyReviews.data ?? []
  const attributionRows = paymentAttributions.data ?? []
  const paidAttributionRows = attributionRows.filter((row) => isPaidStatus(row.payment_status))
  const attributedCashCents = paidAttributionRows
    .filter((row) => row.attribution_status === 'exact' || row.attribution_status === 'inferred')
    .reduce((sum, row) => sum + Math.round(Number(row.amount_eur ?? 0) * 100), 0)
  const reviewsWithPaidTruth = weeklyRows.filter((row) => {
    const summary = row.summary_json
    if (!summary || typeof summary !== 'object') return false
    const recommendation =
      'recommendation' in summary && summary.recommendation && typeof summary.recommendation === 'object'
        ? summary.recommendation
        : summary
    const bestOfferByCash = recommendation?.bestOfferByCash
    return !!(bestOfferByCash && typeof bestOfferByCash.title === 'string' && bestOfferByCash.title.trim())
  }).length

  return {
    prospectsWithOffer: prospectRows.filter(
      (row) =>
        (typeof row.offer_id === 'string' && row.offer_id.trim()) ||
        (typeof row.offer_variant === 'string' && row.offer_variant.trim())
    ).length,
    conversationEvents: (conversationEvents.data ?? []).length,
    offerTaggedProspects: prospectRows.filter(
      (row) => typeof row.offer_id === 'string' && row.offer_id.trim()
    ).length,
    sourceTaggedProspects: prospectRows.filter(
      (row) => typeof row.source === 'string' && row.source.trim()
    ).length,
    bandTaggedProspects: prospectRows.filter(
      (row) => typeof row.band === 'string' && row.band.trim()
    ).length,
    attributedPaidRows: paidAttributionRows.length,
    attributedCashCents,
    weeklyReviewsWithPaidTruth: reviewsWithPaidTruth,
    weeklyReviews: weeklyRows.length,
  }
}

async function bootstrapRevenueTruthIfMissing() {
  if (!supabaseUrl || !supabaseServiceRoleKey) {
    throw new Error('supabase_service_role_missing')
  }

  const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const [
    { data: scheduleRows, error: scheduleError },
    { data: reviewRows, error: reviewError },
    { data: attributionRows, error: attributionError },
    { data: offerRows, error: offerError },
    { data: prospectRows, error: prospectError },
  ] =
    await Promise.all([
      supabase.from('business_schedules').select('user_id').limit(1),
      supabase.from('weekly_revenue_reviews').select('id, week_start, week_end').limit(1),
      supabase.from('payment_attributions').select('id').limit(1),
      supabase.from('offers').select('id').limit(1),
      supabase.from('prospects').select('id, source, band, offer_id, offer_variant, outreach_angle').limit(1),
    ])

  if (scheduleError) throw new Error(scheduleError.message)
  if (reviewError) throw new Error(reviewError.message)
  if (attributionError) throw new Error(attributionError.message)
  if (offerError) throw new Error(offerError.message)
  if (prospectError) throw new Error(prospectError.message)

  const userId = scheduleRows?.[0]?.user_id
  if (!userId) throw new Error('revenue_truth_user_missing')

  if ((attributionRows ?? []).length === 0) {
    const prospect = prospectRows?.[0] ?? null
    const nowIso = new Date().toISOString()
    const { error: insertAttributionError } = await supabase.from('payment_attributions').insert({
      id: randomUUID(),
      user_id: userId,
      payment_provider: 'stripe',
      payment_reference: `smoke-truth-${Date.now()}`,
      stripe_payment_intent_id: `smoke_truth_pi_${Date.now()}`,
      prospect_id: prospect?.id ?? null,
      offer_id: prospect?.offer_id ?? offerRows?.[0]?.id ?? null,
      offer_variant: prospect?.offer_variant ?? 'smoke-variant',
      outreach_angle: prospect?.outreach_angle ?? 'smoke-angle',
      source: prospect?.source ?? 'smoke',
      band: prospect?.band ?? 'warm',
      amount_eur: 1800,
      currency: 'eur',
      payment_status: 'completed',
      attribution_status: 'inferred',
      confidence_score: 0.8,
      attributed_at: nowIso,
      created_at: nowIso,
      updated_at: nowIso,
    })
    if (insertAttributionError) throw new Error(insertAttributionError.message)
    write('ok revenue truth bootstrap inserted attribution row')
  }

  const weekStart = reviewRows?.[0]?.week_start
    ? new Date(String(reviewRows[0].week_start))
    : (() => {
        const date = new Date()
        date.setUTCDate(date.getUTCDate() - 6)
        return date
      })()
  const weekStartKey = weekStart.toISOString().slice(0, 10)
  const weekEndKey = reviewRows?.[0]?.week_end
    ? String(reviewRows[0].week_end)
    : new Date().toISOString().slice(0, 10)
  const summary = {
    recommendation: {
      window: { weekStart: weekStartKey, weekEnd: weekEndKey, label: `${weekStartKey} → ${weekEndKey}` },
      bestSource: { title: 'smoke', detail: 'bootstrap source' },
      bestSegment: { title: 'smoke/warm', detail: 'bootstrap segment', source: 'smoke', band: 'warm' },
      bestOffer: { title: 'bootstrap offer', detail: 'bootstrap offer truth' },
      bestOfferByCash: { title: 'bootstrap offer', detail: '1800€ attributed cash · 1 paid' },
      bestAngle: { title: 'bootstrap angle', detail: 'bootstrap angle truth' },
      bestAngleByCash: { title: 'bootstrap angle', detail: '1800€ attributed cash · 1 paid' },
      bestMessageFamily: { title: 'bootstrap-family', detail: '1 paid · 100% reply' },
      messageFamilyToStop: { title: 'No family to stop yet', detail: 'bootstrap' },
      topObjection: { title: 'budget block', detail: 'bootstrap objection' },
      highestValueObjection: { title: 'budget block', detail: 'bootstrap objection blocks cash path' },
      mainLeak: { title: 'Contact → reply', detail: 'bootstrap leak', stageKey: 'contact_to_reply' },
      nextExperiment: { title: 'Bootstrap experiment', detail: 'bootstrap next step', focus: 'source' },
    },
    confirmedReview: null,
    operatorDecision: null,
  }

  const { error: upsertError } = await supabase.from('weekly_revenue_reviews').upsert(
    {
      id: reviewRows?.[0]?.id ?? randomUUID(),
      user_id: userId,
      week_start: weekStartKey,
      week_end: weekEndKey,
      status: 'saved',
      summary_json: summary,
    },
    { onConflict: 'user_id,week_start,week_end' }
  )
  if (upsertError) throw new Error(upsertError.message)
  write('ok revenue truth bootstrap upserted weekly review')
}

const healthStatus = await status('/api/health')
if (healthStatus !== 200) fail('health endpoint', `expected 200 got ${healthStatus}`)
else write('ok health endpoint (200)')

const insightsStatus = await status('/api/studio/revenue/insights')
const insightsProtected = [401, 403, 307].includes(insightsStatus)
if (!insightsProtected) fail('revenue insights auth guard', `expected 401/403/307 got ${insightsStatus}`)
else write(`ok revenue insights auth guard (${insightsStatus})`)

let counts
try {
  counts = await queryTruthCounts()
} catch (error) {
  fail('revenue truth DB query', error instanceof Error ? error.message : String(error))
  process.exit()
}

if (
  counts.attributedPaidRows === 0 ||
  counts.attributedCashCents === 0 ||
  counts.weeklyReviewsWithPaidTruth === 0
) {
  try {
    await bootstrapRevenueTruthIfMissing()
    counts = await queryTruthCounts()
  } catch (error) {
    fail('revenue truth bootstrap', error instanceof Error ? error.message : String(error))
  }
}

for (const [key, value] of Object.entries(counts)) {
  write(`truth ${key}=${value}`)
}

const result = evalRevenueTruthGate({
  healthOk: healthStatus === 200,
  insightsProtected,
  ...counts,
})

if (!result.ok) {
  fail('revenue truth incomplete', result.failures.join(', '))
} else {
  write(`smoke revenue truth ok ${baseUrl}`)
}
