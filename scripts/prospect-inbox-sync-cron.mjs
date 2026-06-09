#!/usr/bin/env node

const baseUrl = process.env.AUTONOMY_BASE_URL ?? 'http://127.0.0.1:3000'
const secret = process.env.AUTONOMY_WORKER_SECRET
const userId = process.env.TARGET_USER_ID ?? process.env.AGENT_ORCHESTRATOR_USER_ID

if (!secret) {
  console.error('AUTONOMY_WORKER_SECRET is required to run inbox sync.')
  process.exit(1)
}

if (!userId) {
  console.error('TARGET_USER_ID or AGENT_ORCHESTRATOR_USER_ID is required to run inbox sync.')
  process.exit(1)
}

const endpoint = new URL('/api/internal/prospects/inbox-sync', baseUrl)
const response = await fetch(endpoint, {
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    'x-autonomy-worker-token': secret,
  },
  body: JSON.stringify({
    user_id: userId,
    limit: 20,
    mark_seen: true,
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
        error: body?.error ?? body ?? 'Inbox sync failed',
      },
      null,
      2
    )
  )
  process.exit(1)
}

console.log(JSON.stringify(body, null, 2))
