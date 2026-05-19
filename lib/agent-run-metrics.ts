export interface AgentRunMetricInput {
  id?: string
  agent_id: string
  duration_ms: number | null
  created_at: string
  fallback_triggered?: boolean | null
  total_tokens?: number | null
  cost_usd?: number | string | null
  provider?: string | null
  model?: string | null
}

export interface AgentRunMetric {
  agent_id: string
  run_count: number
  runs_24h: number
  last_run_at: string | null
  avg_duration_ms: number | null
  fallback_count: number
  total_tokens: number
  cost_usd: number
  providers: string[]
  last_model: string | null
}

function emptyMetric(agentId: string): AgentRunMetric {
  return {
    agent_id: agentId,
    run_count: 0,
    runs_24h: 0,
    last_run_at: null,
    avg_duration_ms: null,
    fallback_count: 0,
    total_tokens: 0,
    cost_usd: 0,
    providers: [],
    last_model: null,
  }
}

export function buildAgentRunMetrics(
  runs: AgentRunMetricInput[],
  agentIds: string[],
  now: Date = new Date()
): Record<string, AgentRunMetric> {
  const dayAgo = now.getTime() - 24 * 60 * 60 * 1000
  const metrics: Record<string, AgentRunMetric> = {}

  agentIds.forEach((agentId) => {
    metrics[agentId] = emptyMetric(agentId)
  })

  const durationTotals = new Map<string, { sum: number; count: number }>()
  const providers = new Map<string, Set<string>>()

  runs.forEach((run) => {
    const metric = metrics[run.agent_id] ?? (metrics[run.agent_id] = emptyMetric(run.agent_id))

    metric.run_count += 1
    metric.total_tokens += Number(run.total_tokens ?? 0)
    metric.cost_usd += Number(run.cost_usd ?? 0)

    const runTime = Date.parse(run.created_at)
    if (Number.isFinite(runTime) && runTime >= dayAgo) metric.runs_24h += 1
    if (!metric.last_run_at || Date.parse(run.created_at) > Date.parse(metric.last_run_at)) {
      metric.last_run_at = run.created_at
      metric.last_model = run.model ?? null
    }
    if (run.fallback_triggered) metric.fallback_count += 1
    if (run.provider) {
      const set = providers.get(run.agent_id) ?? new Set<string>()
      set.add(run.provider)
      providers.set(run.agent_id, set)
    }

    if (typeof run.duration_ms === 'number' && Number.isFinite(run.duration_ms)) {
      const current = durationTotals.get(run.agent_id) ?? { sum: 0, count: 0 }
      current.sum += run.duration_ms
      current.count += 1
      durationTotals.set(run.agent_id, current)
    }
  })

  durationTotals.forEach((duration, agentId) => {
    const metric = metrics[agentId]
    if (metric && duration.count > 0) {
      metric.avg_duration_ms = Math.round(duration.sum / duration.count)
    }
  })

  providers.forEach((set, agentId) => {
    const metric = metrics[agentId]
    if (metric) metric.providers = Array.from(set).sort()
  })

  return metrics
}

export function buildAgentActivitySeries(
  runs: AgentRunMetricInput[],
  agentId: string,
  size = 48
): number[] {
  const values = runs
    .filter((run) => run.agent_id === agentId)
    .sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at))
    .slice(-size)
    .map((run) => Math.max(1, Math.min(100, Math.round((run.duration_ms ?? 0) / 100))))

  if (values.length >= 2) return values
  if (values.length === 1) return [0, values[0]]
  return [0, 0]
}
