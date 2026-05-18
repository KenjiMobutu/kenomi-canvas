import { Counter, Histogram, register, collectDefaultMetrics } from 'prom-client'

let initialized = false

function ensureInit(): void {
  if (initialized) return
  initialized = true
  collectDefaultMetrics({ register, prefix: 'kenomi_' })
}

ensureInit()

export const httpRequestsTotal = new Counter({
  name: 'kenomi_http_requests_total',
  help: 'Total HTTP requests',
  labelNames: ['method', 'route', 'status'] as const,
  registers: [register],
})

export const httpRequestDurationMs = new Histogram({
  name: 'kenomi_http_request_duration_ms',
  help: 'HTTP request duration in ms',
  labelNames: ['method', 'route', 'status'] as const,
  buckets: [10, 50, 100, 250, 500, 1000, 2500, 5000, 10000],
  registers: [register],
})

export const agentRunsTotal = new Counter({
  name: 'kenomi_agent_runs_total',
  help: 'Total agent runs',
  labelNames: ['agent_id', 'provider', 'fallback'] as const,
  registers: [register],
})

export const agentRunCostUsdTotal = new Counter({
  name: 'kenomi_agent_run_cost_usd_total',
  help: 'Total agent run cost in USD',
  labelNames: ['agent_id', 'model'] as const,
  registers: [register],
})

export { register }
