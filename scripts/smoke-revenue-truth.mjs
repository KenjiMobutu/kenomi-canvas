#!/usr/bin/env node

import { execFileSync } from 'node:child_process'
import { evalRevenueTruthGate } from '../lib/revenue/truth-smoke.mjs'

const baseUrl = process.env.SMOKE_BASE_URL ?? 'https://lab.kenomi.eu'
const sshHost = process.env.REVENUE_PROOF_SSH_HOST ?? 'coolify'
const dbContainer = process.env.REVENUE_PROOF_DB_CONTAINER ?? 'supabase-db-i12k0ju0ok5wk4gnts6uap03'

function write(line) {
  process.stdout.write(`${line}\n`)
}

function fail(message, detail) {
  process.stderr.write(`not ok ${message}${detail ? `: ${detail}` : ''}\n`)
  process.exitCode = 1
}

function shQuote(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`
}

async function status(path, init) {
  const res = await fetch(new URL(path, baseUrl), {
    redirect: 'manual',
    ...init,
  })
  return res.status
}

function queryTruthCounts() {
  const sql = [
    'select',
    "(select count(*) from public.prospects where offer_id is not null or nullif(trim(coalesce(offer_variant, '')), '') is not null) as prospects_with_offer,",
    "(select count(*) from public.prospect_conversation_events) as conversation_events,",
    "(select count(*) from public.prospects where offer_id is not null) as offer_tagged_prospects,",
    "(select count(*) from public.prospects where nullif(trim(coalesce(source, '')), '') is not null) as source_tagged_prospects,",
    "(select count(*) from public.prospects where nullif(trim(coalesce(band, '')), '') is not null) as band_tagged_prospects,",
    "(select count(*) from public.weekly_revenue_reviews) as weekly_reviews",
  ].join(' ')

  const remote = [
    'docker',
    'exec',
    dbContainer,
    'psql',
    '-U',
    'supabase_admin',
    '-d',
    'postgres',
    '-t',
    '-A',
    '-F',
    shQuote(','),
    '-c',
    shQuote(sql),
  ].join(' ')

  const raw = execFileSync('ssh', [sshHost, remote], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim()
  const values = raw.split(',').map((value) => Number(value.trim()))
  return {
    prospectsWithOffer: values[0] ?? 0,
    conversationEvents: values[1] ?? 0,
    offerTaggedProspects: values[2] ?? 0,
    sourceTaggedProspects: values[3] ?? 0,
    bandTaggedProspects: values[4] ?? 0,
    weeklyReviews: values[5] ?? 0,
  }
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
  counts = queryTruthCounts()
} catch (error) {
  fail('revenue truth DB query', error instanceof Error ? error.message : String(error))
  process.exit()
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
