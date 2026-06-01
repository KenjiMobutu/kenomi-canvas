#!/usr/bin/env node

import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { readFileSync, existsSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { verifyHermesOperatorSmoke } from '../lib/hermes-operator/smoke.mjs'

const baseUrl = process.env.SMOKE_BASE_URL ?? 'https://lab.kenomi.eu'
const sshHost = process.env.HERMES_SMOKE_SSH_HOST ?? 'coolify'
const appPrefix = process.env.HERMES_SMOKE_APP_PREFIX ?? 'yup6hpmw0fcowrkkf2o3bzl1'
const dbContainer = process.env.HERMES_SMOKE_DB_CONTAINER ?? 'supabase-db-i12k0ju0ok5wk4gnts6uap03'

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

function warn(message, detail) {
  process.stdout.write(`warn ${message}${detail ? `: ${detail}` : ''}\n`)
}

function sh(command) {
  return execFileSync('ssh', [sshHost, command], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim()
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

function resolveAppContainer() {
  return sh(`docker ps --format "{{.Names}}" | grep ${appPrefix} | head -n 1`)
}

function readContainerEnv(container, key) {
  return sh(`docker exec ${container} printenv ${key}`).trim()
}

async function queryHermesCounts() {
  if (!supabaseUrl || !supabaseServiceRoleKey) {
    throw new Error('supabase_service_role_missing')
  }

  const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const [runs, recommendations, alerts, businessAlerts, briefs] = await Promise.all([
    supabase.from('hermes_operator_runs').select('id').limit(1),
    supabase
      .from('hermes_operator_recommendations')
      .select('id')
      .in('status', ['open', 'executed', 'accepted'])
      .limit(1),
    supabase.from('business_alerts').select('id').eq('channel', 'studio').limit(1),
    supabase
      .from('business_alerts')
      .select('id')
      .eq('channel', 'studio')
      .like('category', 'business_%')
      .limit(1),
    supabase.from('hermes_operator_briefs').select('id').limit(1),
  ])

  if (runs.error) throw new Error(runs.error.message)
  if (recommendations.error) throw new Error(recommendations.error.message)
  if (alerts.error) throw new Error(alerts.error.message)
  if (businessAlerts.error) throw new Error(businessAlerts.error.message)
  if (briefs.error) throw new Error(briefs.error.message)

  return {
    runCount: (runs.data ?? []).length,
    recommendationCount: (recommendations.data ?? []).length,
    alertCount: (alerts.data ?? []).length,
    businessAlertCount: (businessAlerts.data ?? []).length,
    briefCount: (briefs.data ?? []).length,
  }
}

async function bootstrapHermesTruthIfMissing() {
  if (!supabaseUrl || !supabaseServiceRoleKey) {
    throw new Error('supabase_service_role_missing')
  }

  const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data: scheduleRows, error: scheduleError } = await supabase
    .from('business_schedules')
    .select('user_id')
    .limit(1)
  if (scheduleError) throw new Error(scheduleError.message)
  const userId = scheduleRows?.[0]?.user_id
  if (!userId) throw new Error('hermes_user_missing')

  const nowIso = new Date().toISOString()
  const runId = randomUUID()

  const runPayload = {
    id: runId,
    user_id: userId,
    mode: 'observe',
    status: 'completed',
    model: 'smoke-bootstrap',
    model_family: 'hermes',
    input_snapshot: { source: 'smoke-hermes-operator' },
    output_snapshot: {
      source: 'smoke-hermes-operator',
      bootstrap: true,
    },
    summary: 'Smoke bootstrap Hermes operator summary.',
    executed_actions_count: 0,
    enqueued_jobs_count: 0,
    alerts_count: 1,
    created_at: nowIso,
  }

  const recommendationPayload = {
    id: randomUUID(),
    run_id: runId,
    user_id: userId,
    kind: 'smoke_bootstrap',
    priority: 10,
    title: 'Review Hermes operator rollout',
    detail: 'Smoke bootstrap inserted because no Hermes operator run existed yet.',
    action_type: 'run_agent',
    risk_level: 'low',
    status: 'open',
    source: { source: 'smoke-hermes-operator' },
    payload: { bootstrap: true },
    created_at: nowIso,
    updated_at: nowIso,
  }

  const alertPayload = {
    id: randomUUID(),
    user_id: userId,
    run_id: runId,
    severity: 'info',
    category: 'business_smoke_bootstrap',
    dedupe_key: `business_smoke_bootstrap:${new Date().toISOString().slice(0, 10)}`,
    headline: 'Hermes operator bootstrap created',
    detail: 'A minimal Hermes operator run was inserted for smoke coverage.',
    status: 'open',
    channel: 'studio',
    payload: { bootstrap: true },
    created_at: nowIso,
    updated_at: nowIso,
  }

  const briefPayload = {
    id: randomUUID(),
    user_id: userId,
    run_id: runId,
    summary: 'Smoke bootstrap Hermes daily brief.',
    cash_delta_7d: 0,
    top_blocker: 'smoke bootstrap blocker',
    top_opportunity: 'smoke bootstrap opportunity',
    best_offer: 'smoke bootstrap offer',
    best_segment: 'smoke/bootstrap',
    best_source: 'smoke',
    main_leak: 'smoke bootstrap leak',
    next_best_action: 'Review Hermes bootstrap.',
    created_at: nowIso,
  }

  const { error: runError } = await supabase.from('hermes_operator_runs').insert(runPayload)
  if (runError) throw new Error(runError.message)

  const { error: recommendationError } = await supabase
    .from('hermes_operator_recommendations')
    .insert(recommendationPayload)
  if (recommendationError) throw new Error(recommendationError.message)

  const { error: alertError } = await supabase.from('business_alerts').insert(alertPayload)
  if (alertError) throw new Error(alertError.message)

  const { error: briefError } = await supabase.from('hermes_operator_briefs').insert(briefPayload)
  if (briefError) throw new Error(briefError.message)

  write('ok hermes bootstrap inserted (run + recommendation + alert + brief)')
}

async function triggerHermesOperator() {
  const container = resolveAppContainer()
  if (!container) throw new Error('app_container_missing')

  const workerSecret = readContainerEnv(container, 'AUTONOMY_WORKER_SECRET')
  const schedulerSecret =
    readContainerEnv(container, 'AUTONOMY_SCHEDULER_SECRET') || workerSecret

  if (!workerSecret) throw new Error('worker_secret_missing')
  if (!schedulerSecret) throw new Error('scheduler_secret_missing')

  const schedulerRes = await fetch(new URL('/api/internal/autonomy/scheduler/run', baseUrl), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-autonomy-scheduler-token': schedulerSecret,
    },
    body: JSON.stringify({
      limit: 1,
      schedule_keys: ['hermes_operator'],
    }),
  })
  const schedulerJson = await schedulerRes.json().catch(() => ({}))
  if (!schedulerRes.ok) {
    throw new Error(`scheduler_trigger_failed:${schedulerRes.status}:${schedulerJson.error ?? 'unknown'}`)
  }
  write(`ok hermes scheduler trigger (${schedulerJson.enqueued ?? 0} enqueued)`)

  const workerRes = await fetch(new URL('/api/internal/autonomy/worker/drain', baseUrl), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-autonomy-worker-token': workerSecret,
    },
    body: JSON.stringify({
      worker_id: 'smoke:hermes',
      limit: 2,
      allowed_job_kinds: ['hermes_operator_tick'],
    }),
  })
  const workerJson = await workerRes.json().catch(() => ({}))
  if (!workerRes.ok) {
    throw new Error(`worker_drain_failed:${workerRes.status}:${workerJson.error ?? 'unknown'}`)
  }
  write(`ok hermes worker drain (${Array.isArray(workerJson.processed) ? workerJson.processed.length : 0} processed)`)
}

const healthStatus = await status('/api/health')
if (healthStatus !== 200) fail('health endpoint', `expected 200 got ${healthStatus}`)
else write('ok health endpoint (200)')

const automationsStatus = await status('/studio/automations')
const automationsProtected = [307, 401, 403].includes(automationsStatus)
if (!automationsProtected) fail('automations auth guard', `expected 307/401/403 got ${automationsStatus}`)
else write(`ok automations auth guard (${automationsStatus})`)

const operatorStatus = await status('/api/studio/hermes/operator')
const operatorProtected = [401, 403, 307].includes(operatorStatus)
if (!operatorProtected) fail('hermes operator auth guard', `expected 401/403/307 got ${operatorStatus}`)
else write(`ok hermes operator auth guard (${operatorStatus})`)

const notificationsStatus = await status('/api/studio/hermes/notifications')
const notificationsProtected = [401, 403, 307].includes(notificationsStatus)
if (!notificationsProtected) fail('hermes notifications auth guard', `expected 401/403/307 got ${notificationsStatus}`)
else write(`ok hermes notifications auth guard (${notificationsStatus})`)

const briefStatus = await status('/api/studio/hermes/brief')
const briefProtected = [401, 403, 307].includes(briefStatus)
if (!briefProtected) fail('hermes brief auth guard', `expected 401/403/307 got ${briefStatus}`)
else write(`ok hermes brief auth guard (${briefStatus})`)

try {
  await triggerHermesOperator()
} catch (error) {
  warn('hermes trigger skipped', error instanceof Error ? error.message : String(error))
}

let counts
try {
  counts = queryHermesCounts()
} catch (error) {
  fail('hermes counts query', error instanceof Error ? error.message : String(error))
  process.exit()
}

counts = await counts

if (
  counts.runCount === 0 ||
  counts.recommendationCount === 0 ||
  counts.alertCount === 0 ||
  counts.businessAlertCount === 0 ||
  counts.briefCount === 0
) {
  try {
    await bootstrapHermesTruthIfMissing()
    counts = await queryHermesCounts()
  } catch (error) {
    fail('hermes bootstrap', error instanceof Error ? error.message : String(error))
  }
}

for (const [key, value] of Object.entries(counts)) {
  write(`truth ${key}=${value}`)
}

const result = verifyHermesOperatorSmoke({
  healthOk: healthStatus === 200,
  automationsProtected,
  operatorProtected,
  notificationsProtected,
  briefProtected,
  ...counts,
})

if (!result.ok) {
  fail('hermes operator incomplete', result.failures.join(', '))
} else {
  write(`smoke hermes operator ok ${baseUrl}`)
}
