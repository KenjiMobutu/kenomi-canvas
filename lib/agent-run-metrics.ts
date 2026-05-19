export interface AgentRunMetricInput {
  id?: string
  agent_id: string
  duration_ms: number | null
  created_at: string
  fallback_triggered?: boolean | null
}

export interface AgentRunMetric {
  agent_id: string
  run_count: number
  runs_24h: number
  last_run_at: string | null
  avg_duration_ms: number | null
  fallback_count: number
}

export function buildAgentRunMetrics(
  runs: AgentRunMetricInput[],
  agentIds: string[],
  now: Date = new Date()
): Record<string, AgentRunMetric> {
  const dayAgo = now.getTime() - 24 * 60 * 60 * 1000
  const metrics: Record<string, AgentRunMetric> = {}

  agentIds.forEach((agentId) => {
    metrics[agentId] = {
      agent_id: agentId,
      run_count: 0,
      runs_24h: 0,
      last_run_at: null,
      avg_duration_ms: null,
      fallback_count: 0,
    }
  })

  const durationTotals = new Map<string, { sum: number; count: number }>()

  runs.forEach((run) => {
    const metric =
      metrics[run.agent_id] ??
      (metrics[run.agent_id] = {
        agent_id: run.agent_id,
        run_count: 0,
        runs_24h: 0,
        last_run_at: null,
        avg_duration_ms: null,
        fallback_count: 0,
      })

    metric.run_count += 1

    const runTime = Date.parse(run.created_at)
    if (Number.isFinite(runTime) && runTime >= dayAgo) metric.runs_24h += 1
    if (!metric.last_run_at || Date.parse(run.created_at) > Date.parse(metric.last_run_at)) {
      metric.last_run_at = run.created_at
    }
    if (run.fallback_triggered) metric.fallback_count += 1

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
