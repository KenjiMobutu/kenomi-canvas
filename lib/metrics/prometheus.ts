import { Counter, Gauge, Histogram, register, collectDefaultMetrics } from 'prom-client'

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

export function buildBusinessGaugeSnapshot(input: {
  approvalsPending: number
  jobsFailed24h: number
  deployFailures24h: number
  dailyCycleAgeHours: number
}) {
  return [
    { name: 'kenomi_approval_backlog', value: input.approvalsPending },
    { name: 'kenomi_jobs_failed_24h', value: input.jobsFailed24h },
    { name: 'kenomi_deploy_failures_24h', value: input.deployFailures24h },
    { name: 'kenomi_daily_cycle_age_hours', value: input.dailyCycleAgeHours },
  ]
}

export const approvalBacklogGauge = new Gauge({
  name: 'kenomi_approval_backlog',
  help: 'Pending human approvals backlog',
  registers: [register],
})

export const jobsFailed24hGauge = new Gauge({
  name: 'kenomi_jobs_failed_24h',
  help: 'Failed autonomy jobs over the last 24 hours',
  registers: [register],
})

export const deployFailures24hGauge = new Gauge({
  name: 'kenomi_deploy_failures_24h',
  help: 'Failed deploy-related events over the last 24 hours',
  registers: [register],
})

export const dailyCycleAgeHoursGauge = new Gauge({
  name: 'kenomi_daily_cycle_age_hours',
  help: 'Age in hours of the latest revenue daily cycle event',
  registers: [register],
})

export { register }
