#!/usr/bin/env node

const baseUrl = process.env.AUTONOMY_BASE_URL ?? 'http://127.0.0.1:3000'
const secret = process.env.AUTONOMY_WORKER_SECRET

if (!secret) {
  console.error('AUTONOMY_WORKER_SECRET is required to run the autonomy worker.')
  process.exit(1)
}

const endpoint = new URL('/api/internal/autonomy/worker/drain', baseUrl)
const response = await fetch(endpoint, {
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    'x-autonomy-worker-token': secret,
  },
  body: JSON.stringify({
    worker_id: 'coolify-scheduled-task',
    limit: 10,
    allowed_job_kinds: ['run_agent', 'follow_up_scan', 'hermes_operator_tick'],
  }),
})

const body = await response.json().catch(() => null)
if (!response.ok || body?.ok === false) {
  console.error(
    JSON.stringify(
      {
        ok: false,
        status: response.status,
        endpoint: endpoint.origin + endpoint.pathname,
        error: body?.error ?? body ?? 'Autonomy worker failed',
      },
      null,
      2
    )
  )
  process.exit(1)
}

console.log(
  JSON.stringify(
    {
      ok: true,
      claimed: body?.claimed ?? 0,
      processed: body?.processed ?? 0,
      drainedKinds: body?.drainedKinds ?? [],
      results: body?.results ?? [],
    },
    null,
    2
  )
)
