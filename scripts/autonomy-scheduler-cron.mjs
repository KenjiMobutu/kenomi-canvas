#!/usr/bin/env node

const baseUrl = process.env.AUTONOMY_BASE_URL ?? 'http://127.0.0.1:3000'
const secret = process.env.AUTONOMY_WORKER_SECRET

if (!secret) {
  console.error('AUTONOMY_WORKER_SECRET is required to run the autonomy scheduler.')
  process.exit(1)
}

const endpoint = new URL('/api/internal/autonomy/scheduler/run', baseUrl)
const response = await fetch(endpoint, {
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    'x-autonomy-scheduler-token': secret,
  },
  body: JSON.stringify({
    limit: 10,
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
        error: body?.error ?? body ?? 'Autonomy scheduler failed',
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
      enqueued: body?.enqueued ?? 0,
      schedules: body?.schedules ?? [],
    },
    null,
    2
  )
)
