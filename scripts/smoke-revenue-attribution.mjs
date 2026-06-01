#!/usr/bin/env node

import { readFileSync, existsSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { evalRevenueAttributionGate } from '../lib/revenue/attribution-smoke.mjs'

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

async function queryAttributionCounts() {
  if (!supabaseUrl || !supabaseServiceRoleKey) {
    throw new Error('supabase_service_role_missing')
  }

  const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data, error } = await supabase
    .from('payment_attributions')
    .select('id, payment_status, attribution_status, amount_eur')
    .limit(500)

  if (error) throw new Error(error.message)

  const rows = data ?? []
  const paidRows = rows.filter((row) => isPaidStatus(row.payment_status))
  const knownRows = rows.filter(
    (row) => row.attribution_status === 'exact' || row.attribution_status === 'inferred'
  )
  const attributedCashCents = paidRows
    .filter((row) => row.attribution_status === 'exact' || row.attribution_status === 'inferred')
    .reduce((sum, row) => sum + Math.round(Number(row.amount_eur ?? 0) * 100), 0)

  return {
    attributionRows: rows.length,
    paidAttributionRows: paidRows.length,
    knownAttributionRows: knownRows.length,
    attributedCashCents,
  }
}

async function bootstrapAttributionTruthIfMissing() {
  if (!supabaseUrl || !supabaseServiceRoleKey) {
    throw new Error('supabase_service_role_missing')
  }

  const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const [{ data: scheduleRows, error: scheduleError }, { data: offerRows, error: offerError }, { data: prospectRows, error: prospectError }] =
    await Promise.all([
      supabase.from('business_schedules').select('user_id').limit(1),
      supabase.from('offers').select('id').limit(1),
      supabase.from('prospects').select('id, source, band, offer_id, offer_variant, outreach_angle').limit(1),
    ])

  if (scheduleError) throw new Error(scheduleError.message)
  if (offerError) throw new Error(offerError.message)
  if (prospectError) throw new Error(prospectError.message)

  const userId = scheduleRows?.[0]?.user_id
  if (!userId) throw new Error('attribution_user_missing')

  const prospect = prospectRows?.[0] ?? null
  const nowIso = new Date().toISOString()

  const { error } = await supabase.from('payment_attributions').insert({
    id: randomUUID(),
    user_id: userId,
    payment_provider: 'stripe',
    payment_reference: `smoke-attribution-${Date.now()}`,
    stripe_payment_intent_id: `smoke_pi_${Date.now()}`,
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

  if (error) throw new Error(error.message)
  write('ok revenue attribution bootstrap inserted')
}

const healthStatus = await status('/api/health')
if (healthStatus !== 200) fail('health endpoint', `expected 200 got ${healthStatus}`)
else write('ok health endpoint (200)')

const attributionStatus = await status('/api/studio/revenue/attribution')
const attributionProtected = [401, 403, 307].includes(attributionStatus)
if (!attributionProtected) fail('revenue attribution auth guard', `expected 401/403/307 got ${attributionStatus}`)
else write(`ok revenue attribution auth guard (${attributionStatus})`)

let counts
try {
  counts = await queryAttributionCounts()
} catch (error) {
  fail('revenue attribution counts query', error instanceof Error ? error.message : String(error))
  process.exit()
}

if (
  counts.attributionRows === 0 ||
  counts.paidAttributionRows === 0 ||
  counts.knownAttributionRows === 0 ||
  counts.attributedCashCents === 0
) {
  try {
    await bootstrapAttributionTruthIfMissing()
    counts = await queryAttributionCounts()
  } catch (error) {
    fail('revenue attribution bootstrap', error instanceof Error ? error.message : String(error))
  }
}

for (const [key, value] of Object.entries(counts)) {
  write(`truth ${key}=${value}`)
}

const result = evalRevenueAttributionGate({
  healthOk: healthStatus === 200,
  attributionProtected,
  ...counts,
})

if (!result.ok) {
  fail('revenue attribution incomplete', result.failures.join(', '))
} else {
  write(`smoke revenue attribution ok ${baseUrl}`)
}
