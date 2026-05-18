import type { AutonomyActionView } from './approval-view-model'

export interface AutonomyJobView {
  id: string
  venture_id?: string | null
  kind: string
  status: string
  attempt_count?: number | null
  next_run_at?: string | null
  locked_at?: string | null
  last_error?: string | null
  payload?: Record<string, unknown> | null
  created_at: string
  updated_at?: string | null
}

export interface ActionListItem {
  id: string
  label: string
  status: string
  riskLevel: string
  provider: string | null
  model: string | null
  durationMs: number | null
  retryCount: number | null
  lastError: string | null
  createdAt: string
}

export interface JobListItem {
  id: string
  label: string
  status: string
  retryCount: number
  lastError: string | null
  nextRunAt: string | null
  createdAt: string
}

function titleize(value: string): string {
  return value.replaceAll('_', ' ')
}

function readString(
  record: Record<string, unknown> | null | undefined,
  key: string
): string | null {
  const value = record?.[key]
  return typeof value === 'string' && value.length > 0 ? value : null
}

function readNumber(
  record: Record<string, unknown> | null | undefined,
  key: string
): number | null {
  const value = record?.[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

export function buildActionList(actions: AutonomyActionView[]): ActionListItem[] {
  return actions
    .map((action) => ({
      id: action.id,
      label: titleize(action.action_type),
      status: action.status,
      riskLevel: action.risk_level,
      provider: readString(action.output, 'provider') ?? readString(action.input, 'provider'),
      model: readString(action.output, 'model') ?? readString(action.input, 'model'),
      durationMs:
        readNumber(action.output, 'duration_ms') ?? readNumber(action.output, 'durationMs'),
      retryCount: readNumber(action.output, 'retry_count') ?? null,
      lastError: readString(action.output, 'error') ?? readString(action.output, 'last_error'),
      createdAt: action.created_at,
    }))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
}

export function buildJobList(jobs: AutonomyJobView[]): JobListItem[] {
  return jobs
    .map((job) => ({
      id: job.id,
      label: titleize(job.kind),
      status: job.status,
      retryCount: job.attempt_count ?? 0,
      lastError: job.last_error ?? null,
      nextRunAt: job.next_run_at ?? null,
      createdAt: job.created_at,
    }))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
}
