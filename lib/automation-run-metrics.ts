export interface AutomationRunMetricInput {
  workflow_id: string
  status: string
  duration_ms: number | null
  triggered_at: string
}

export interface AutomationRunMetric {
  workflow_id: string
  run_count: number
  success_count: number
  last_run_at: string | null
  avg_duration_ms: number | null
}

export function buildAutomationRunMetrics(
  runs: AutomationRunMetricInput[],
  workflowIds: string[]
): Record<string, AutomationRunMetric> {
  const metrics: Record<string, AutomationRunMetric> = {}
  workflowIds.forEach((workflowId) => {
    metrics[workflowId] = {
      workflow_id: workflowId,
      run_count: 0,
      success_count: 0,
      last_run_at: null,
      avg_duration_ms: null,
    }
  })

  const durationTotals = new Map<string, { sum: number; count: number }>()

  runs.forEach((run) => {
    const metric =
      metrics[run.workflow_id] ??
      (metrics[run.workflow_id] = {
        workflow_id: run.workflow_id,
        run_count: 0,
        success_count: 0,
        last_run_at: null,
        avg_duration_ms: null,
      })

    metric.run_count += 1
    if (run.status === 'success') metric.success_count += 1
    if (!metric.last_run_at || Date.parse(run.triggered_at) > Date.parse(metric.last_run_at)) {
      metric.last_run_at = run.triggered_at
    }
    if (typeof run.duration_ms === 'number' && Number.isFinite(run.duration_ms)) {
      const current = durationTotals.get(run.workflow_id) ?? { sum: 0, count: 0 }
      current.sum += run.duration_ms
      current.count += 1
      durationTotals.set(run.workflow_id, current)
    }
  })

  durationTotals.forEach((duration, workflowId) => {
    const metric = metrics[workflowId]
    if (metric && duration.count > 0) {
      metric.avg_duration_ms = Math.round(duration.sum / duration.count)
    }
  })

  return metrics
}
