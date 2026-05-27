const baseUrl = process.env.SMOKE_BASE_URL ?? 'http://localhost:3000'
const studioCookie = process.env.SMOKE_STUDIO_COOKIE
const workerSecret = process.env.AUTONOMY_WORKER_SECRET
const schedulerSecret = process.env.AUTONOMY_SCHEDULER_SECRET ?? workerSecret

if (!studioCookie) {
  console.error('SMOKE_STUDIO_COOKIE is required')
  console.error('Example: export SMOKE_STUDIO_COOKIE="sb-supabase-auth-token=base64-..."')
  process.exit(1)
}
if (!workerSecret) {
  console.error('AUTONOMY_WORKER_SECRET is required')
  process.exit(1)
}
if (!schedulerSecret) {
  console.error('AUTONOMY_SCHEDULER_SECRET or AUTONOMY_WORKER_SECRET is required')
  process.exit(1)
}

const headers = {
  Cookie: studioCookie,
  'Content-Type': 'application/json',
}

async function request(path, init = {}) {
  const response = await fetch(new URL(path, baseUrl), {
    ...init,
    headers: {
      ...(init.headers ?? {}),
      ...headers,
    },
  })

  const text = await response.text()
  let json = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    json = null
  }

  return { response, json, text }
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

const schedulesRes = await request('/api/studio/schedules')
assert(schedulesRes.response.status === 200, `schedules fetch failed: ${schedulesRes.response.status} ${schedulesRes.text}`)
const devopsSchedule = Array.isArray(schedulesRes.json?.schedules)
  ? schedulesRes.json.schedules.find((schedule) => schedule?.schedule_key === 'devops')
  : null
assert(devopsSchedule?.id, `missing devops schedule: ${schedulesRes.text}`)
process.stdout.write(`ok schedules endpoint (${schedulesRes.json.schedules.length} schedules)\n`)

const runNow = await request('/api/studio/schedules', {
  method: 'PATCH',
  body: JSON.stringify({
    scheduleKey: 'devops',
    nextRunAt: new Date().toISOString(),
  }),
})
assert(runNow.response.status === 200, `schedule nextRunAt failed: ${runNow.response.status} ${runNow.text}`)
process.stdout.write('ok marked devops schedule due\n')

const schedulerRun = await fetch(new URL('/api/internal/autonomy/scheduler/run', baseUrl), {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-autonomy-scheduler-token': schedulerSecret,
  },
  body: JSON.stringify({
    limit: 4,
    schedule_keys: ['devops'],
  }),
})
const schedulerText = await schedulerRun.text()
const schedulerJson = schedulerText ? JSON.parse(schedulerText) : null
assert(
  schedulerRun.status === 200,
  `scheduler trigger failed: ${schedulerRun.status} ${schedulerText}`
)
assert(schedulerJson?.enqueued >= 1, `scheduler did not enqueue devops: ${schedulerText}`)
const scheduledJobId = Array.isArray(schedulerJson?.report) ? schedulerJson.report[0]?.jobId : null
assert(typeof scheduledJobId === 'string' && scheduledJobId.length > 0, `missing scheduled job id: ${schedulerText}`)
process.stdout.write(`ok scheduler enqueued ${schedulerJson.enqueued}\n`)

const workerRun = await fetch(new URL('/api/internal/autonomy/worker/drain', baseUrl), {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-autonomy-worker-token': workerSecret,
  },
  body: JSON.stringify({
    worker_id: 'smoke:devops',
    limit: 1,
    allowed_job_kinds: ['run_agent'],
    async: true,
  }),
})
const workerText = await workerRun.text()
let workerJson = null
try {
  workerJson = workerText ? JSON.parse(workerText) : null
} catch {
  workerJson = null
}
assert(
  workerRun.status === 200 || workerRun.status === 202,
  `worker drain failed: ${workerRun.status} ${workerText}`
)
process.stdout.write(`ok worker accepted ${workerJson?.accepted === true ? 1 : 0}\n`)

let completedJob = null
for (let attempt = 0; attempt < 30; attempt += 1) {
  const jobsRes = await request('/api/studio/autonomy/jobs?agent_id=devops')
  assert(
    jobsRes.response.status === 200 || jobsRes.response.status === 207,
    `jobs endpoint failed: ${jobsRes.response.status} ${jobsRes.text}`
  )
  completedJob = Array.isArray(jobsRes.json?.jobs)
    ? jobsRes.json.jobs.find(
        (job) => job?.id === scheduledJobId && (job?.status === 'completed' || job?.status === 'failed')
      ) ?? null
    : null
  if (completedJob) break
  await fetch(new URL('/api/internal/autonomy/worker/drain', baseUrl), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-autonomy-worker-token': workerSecret,
    },
    body: JSON.stringify({
      worker_id: `smoke:devops:${attempt + 1}`,
      limit: 1,
      allowed_job_kinds: ['run_agent'],
      async: true,
    }),
  }).catch(() => null)
  await sleep(2000)
}
assert(completedJob, 'timed out waiting for devops scheduled job completion')
assert(completedJob.status === 'completed', `scheduled devops job failed: ${completedJob.last_error ?? ''}`)
process.stdout.write(`ok worker completed ${scheduledJobId}\n`)

const diagnosticsRes = await request('/api/studio/infra/diagnostics')
assert(
  diagnosticsRes.response.status === 200 || diagnosticsRes.response.status === 207,
  `infra diagnostics failed: ${diagnosticsRes.response.status} ${diagnosticsRes.text}`
)
assert(diagnosticsRes.json?.devopsSummary, `missing devopsSummary in diagnostics route: ${diagnosticsRes.text}`)
assert(
  typeof diagnosticsRes.json.devopsSummary.headline === 'string' &&
    diagnosticsRes.json.devopsSummary.headline.length > 0,
  `missing devopsSummary headline: ${diagnosticsRes.text}`
)
assert(Array.isArray(diagnosticsRes.json?.recentIncidents), `missing recentIncidents: ${diagnosticsRes.text}`)
assert(diagnosticsRes.json?.deploymentParity, `missing deploymentParity: ${diagnosticsRes.text}`)
process.stdout.write(
  `ok diagnostics summary ${diagnosticsRes.json.devopsSummary.status} incidents=${diagnosticsRes.json.recentIncidents.length}\n`
)

const historyRes = await request('/api/studio/infra/diagnostics/history')
assert(
  historyRes.response.status === 200,
  `infra diagnostics history failed: ${historyRes.response.status} ${historyRes.text}`
)
assert(Array.isArray(historyRes.json?.incidents), `missing incidents in history route: ${historyRes.text}`)
process.stdout.write(`ok history incidents ${historyRes.json.incidents.length}\n`)

process.stdout.write(`smoke devops diagnostics ok ${baseUrl}\n`)
