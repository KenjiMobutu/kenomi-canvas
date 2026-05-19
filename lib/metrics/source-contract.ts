export type MetricSourceStatus = 'real' | 'empty' | 'partial' | 'unavailable'

export interface MetricSourceContract {
  source: string
  window: string
  rowCount: number
  status: MetricSourceStatus
  checkedAt: string
}

export function deriveMetricSourceStatus(input: {
  rowCount?: number
  partial?: boolean
  unavailable?: boolean
}): MetricSourceStatus {
  if (input.unavailable) return 'unavailable'
  if ((input.rowCount ?? 0) <= 0) return 'empty'
  if (input.partial) return 'partial'
  return 'real'
}

export function buildMetricSource(input: {
  source: string
  window: string
  rowCount: number
  partial?: boolean
  unavailable?: boolean
  checkedAt?: string
}): MetricSourceContract {
  return {
    source: input.source,
    window: input.window,
    rowCount: input.rowCount,
    status: deriveMetricSourceStatus(input),
    checkedAt: input.checkedAt ?? new Date().toISOString(),
  }
}
