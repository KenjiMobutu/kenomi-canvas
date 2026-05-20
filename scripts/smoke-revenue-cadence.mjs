#!/usr/bin/env node

const baseUrl = process.env.SMOKE_BASE_URL ?? process.env.APP_ORIGIN ?? 'https://lab.kenomi.eu'
const headers = process.env.AGENT_ORCHESTRATOR_SECRET
  ? { authorization: `Bearer ${process.env.AGENT_ORCHESTRATOR_SECRET}` }
  : {}

const response = await fetch(new URL('/api/studio/revenue/autopilot', baseUrl), {
  method: 'GET',
  headers,
})

const body = await response.json().catch(() => null)
if (!response.ok || body?.ok !== true) {
  console.error(JSON.stringify({ ok: false, status: response.status, body }, null, 2))
  process.exit(1)
}

const stages = Array.isArray(body?.cycle?.stages) ? body.cycle.stages : []
const blocked = stages
  .filter((stage) => stage?.status === 'blocked')
  .map((stage) => stage?.key)
  .filter(Boolean)

console.log(
  JSON.stringify(
    {
      ok: true,
      mode: body?.cycle?.mode ?? null,
      summary: body?.cycle?.summary ?? null,
      blocked,
    },
    null,
    2
  )
)
