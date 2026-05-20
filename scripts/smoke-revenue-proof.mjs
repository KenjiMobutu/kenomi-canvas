#!/usr/bin/env node

import { execFileSync } from 'node:child_process'

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

async function status(path, init) {
  const res = await fetch(new URL(path, baseUrl), {
    redirect: 'manual',
    ...init,
  })
  return res.status
}

function evalGate(input) {
  const failures = []

  if (!input.healthOk) failures.push('health_not_ok')
  if (!input.routeProtected) failures.push('revenue_proof_route_not_protected')
  if (missing(input.paymentsWithCheckout)) failures.push('checkout_missing')
  if (missing(input.completedPaymentsWithCheckout)) failures.push('completed_public_checkout_missing')
  if (missing(input.completedPayments)) failures.push('completed_payment_missing')
  if (missing(input.paymentSucceededEvents)) failures.push('payment_succeeded_event_missing')
  if (missing(input.campaignPublishedEvents)) failures.push('campaign_published_event_missing')
  if (missing(input.campaignSpendEvents)) failures.push('campaign_spend_event_missing')
  if (missing(input.pageViewEvents)) failures.push('page_view_event_missing')
  if (missing(input.checkoutStartedEvents)) failures.push('checkout_started_event_missing')
  if (missing(input.waitlistSignupEvents)) failures.push('waitlist_signup_event_missing')
  if (missing(input.highIntentLeadEvents)) failures.push('high_intent_lead_event_missing')
  if (missing(input.completedFulfillments)) failures.push('fulfillment_missing')
  if (process.env.REQUIRE_LIVE_MARKETING === 'true' && missing(input.livePublishedCampaigns)) {
    failures.push('live_marketing_missing')
  }
  if (missing(input.decisions)) failures.push('decision_missing')

  return { ok: failures.length === 0, failures }
}

function missing(count) {
  return !Number.isFinite(count) || count <= 0
}

function shQuote(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`
}

function queryProofCounts() {
  const sql = [
    'select',
    '(select count(*) from public.payments where checkout_url is not null) as payments_with_checkout,',
    "(select count(*) from public.payments where checkout_url is not null and (status='completed' or provider_status='completed')) as completed_payments_with_checkout,",
    "(select count(*) from public.payments where status='completed' or provider_status='completed') as completed_payments,",
    "(select count(*) from public.venture_events where event_type='payment_succeeded') as payment_succeeded_events,",
    "(select count(*) from public.venture_events where event_type='campaign_published') as campaign_published_events,",
    "(select count(*) from public.venture_events where event_type='campaign_spend') as campaign_spend_events,",
    "(select count(*) from public.venture_events where event_type='page_view') as page_view_events,",
    "(select count(*) from public.venture_events where event_type='checkout_started') as checkout_started_events,",
    "(select count(*) from public.venture_events where event_type='waitlist_signup') as waitlist_signup_events,",
    "(select count(*) from public.venture_events where event_type='high_intent_lead') as high_intent_lead_events,",
    "(select count(*) from public.fulfillment_deliveries where status='completed') as completed_fulfillments,",
    "(select count(*) from public.decisions where decision in ('scale','cut','hold')) as decisions,",
    "(select count(*) from public.campaign_drafts where status='published' and coalesce(metadata->>'adapter','')='n8n') as live_published_campaigns,",
    "(select count(*) from public.campaign_drafts where status='published' and coalesce(metadata->>'adapter','')='mock') as mock_published_campaigns",
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
    paymentsWithCheckout: values[0] ?? 0,
    completedPaymentsWithCheckout: values[1] ?? 0,
    completedPayments: values[2] ?? 0,
    paymentSucceededEvents: values[3] ?? 0,
    campaignPublishedEvents: values[4] ?? 0,
    campaignSpendEvents: values[5] ?? 0,
    pageViewEvents: values[6] ?? 0,
    checkoutStartedEvents: values[7] ?? 0,
    waitlistSignupEvents: values[8] ?? 0,
    highIntentLeadEvents: values[9] ?? 0,
    completedFulfillments: values[10] ?? 0,
    decisions: values[11] ?? 0,
    livePublishedCampaigns: values[12] ?? 0,
    mockPublishedCampaigns: values[13] ?? 0,
  }
}

const healthStatus = await status('/api/health')
if (healthStatus !== 200) fail('health endpoint', `expected 200 got ${healthStatus}`)
else write('ok health endpoint (200)')

const proofGetStatus = await status('/api/studio/revenue/proof')
if (proofGetStatus !== 405) fail('revenue proof GET guard', `expected 405 got ${proofGetStatus}`)
else write('ok revenue proof GET guard (405)')

const proofPostStatus = await status('/api/studio/revenue/proof', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ action: 'publish_controlled_campaign' }),
})
const routeProtected = [401, 403, 307].includes(proofPostStatus)
if (!routeProtected) fail('revenue proof auth guard', `expected 401/403/307 got ${proofPostStatus}`)
else write(`ok revenue proof auth guard (${proofPostStatus})`)

let counts
try {
  counts = queryProofCounts()
} catch (error) {
  fail('revenue proof DB query', error instanceof Error ? error.message : String(error))
  process.exit()
}

const result = evalGate({
  healthOk: healthStatus === 200,
  routeProtected,
  ...counts,
})

for (const [key, value] of Object.entries(counts)) {
  write(`proof ${key}=${value}`)
}

if (process.env.REQUIRE_LIVE_MARKETING !== 'true' && missing(counts.livePublishedCampaigns)) {
  write('warn marketing live proof missing: campaigns are mock-controlled')
}

if (!result.ok) {
  fail('revenue proof incomplete', result.failures.join(', '))
} else {
  write(`smoke revenue proof ok ${baseUrl}`)
}
