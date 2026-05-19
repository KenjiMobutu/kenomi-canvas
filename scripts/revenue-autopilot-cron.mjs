#!/usr/bin/env node

const baseUrl = process.env.AUTOPILOT_BASE_URL ?? process.env.APP_ORIGIN ?? 'https://lab.kenomi.eu'
const secret = process.env.AGENT_ORCHESTRATOR_SECRET
const dryRun = process.argv.includes('--dry-run')

if (!secret) {
  console.error('AGENT_ORCHESTRATOR_SECRET is required to run revenue autopilot.')
  process.exit(1)
}

const endpoint = new URL('/api/studio/revenue/autopilot', baseUrl)
const response = await fetch(endpoint, {
  method: dryRun ? 'GET' : 'POST',
  headers: {
    authorization: `Bearer ${secret}`,
    'content-type': 'application/json',
  },
})

const body = await response.json().catch(() => null)
if (!response.ok || body?.ok === false) {
  console.error(
    JSON.stringify(
      {
        ok: false,
        status: response.status,
        endpoint: endpoint.origin + endpoint.pathname,
        error: body?.error ?? body ?? 'Revenue autopilot failed',
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
      mode: body?.plan?.mode,
      revenueEur: body?.plan?.revenueEur,
      blockedRevenueEur: body?.plan?.blockedRevenueEur,
      cycle: body?.cycle
        ? {
            mode: body.cycle.mode,
            summary: body.cycle.summary,
            stages: body.cycle.stages?.map((stage) => ({
              key: stage.key,
              status: stage.status,
              source: stage.source,
            })),
          }
        : null,
      steps: body?.plan?.steps?.map((step) => ({
        kind: step.kind,
        execution: step.execution,
        ventureId: step.ventureId ?? null,
        recommendedBudgetEur: step.recommendedBudgetEur ?? null,
      })),
      executed: body?.executed ?? [],
    },
    null,
    2
  )
)
