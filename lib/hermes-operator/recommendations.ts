import type { HermesOperatorRecommendation } from '@/lib/hermes-operator/engine'

interface QueryResult<T> {
  data: T | null
  error: { message: string } | null
}

interface QueryBuilder<T = unknown> extends PromiseLike<QueryResult<T[]>> {
  select(columns?: string): QueryBuilder<T>
  insert(row: Record<string, unknown> | Record<string, unknown>[]): QueryBuilder<T>
}

export interface HermesRecommendationsSupabase {
  from(table: string): QueryBuilder<any>
}

export type PersistedOperatorRecommendation = {
  id: string
  kind: string
  priority: number
  title: string
  detail: string
  actionType: string | null
  riskLevel: string | null
  status: string
  source: Record<string, unknown>
  payload: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export async function persistOperatorRecommendations(input: {
  supabase: HermesRecommendationsSupabase
  userId: string
  runId: string
  recommendations: HermesOperatorRecommendation[]
  now?: Date
}): Promise<PersistedOperatorRecommendation[]> {
  const nowIso = (input.now ?? new Date()).toISOString()
  if (input.recommendations.length === 0) return []

  const result = await input.supabase.from('hermes_operator_recommendations').insert(
    input.recommendations.map((recommendation) => ({
      user_id: input.userId,
      run_id: input.runId,
      kind: recommendation.kind,
      priority: recommendation.priority,
      title: recommendation.title,
      detail: recommendation.detail,
      action_type: recommendation.actionType,
      risk_level: recommendation.riskLevel,
      status: 'open',
      source: recommendation.source,
      payload: recommendation.payload,
      created_at: nowIso,
      updated_at: nowIso,
    }))
  ).select('id, kind, priority, title, detail, action_type, risk_level, status, source, payload, created_at, updated_at')

  const resolved = await result
  if (resolved.error) throw new Error(resolved.error.message)

  return (resolved.data ?? []).map((row) => ({
    id: String(row.id),
    kind: String(row.kind ?? ''),
    priority: Number(row.priority ?? 0),
    title: String(row.title ?? ''),
    detail: String(row.detail ?? ''),
    actionType: typeof row.action_type === 'string' ? row.action_type : null,
    riskLevel: typeof row.risk_level === 'string' ? row.risk_level : null,
    status: String(row.status ?? 'open'),
    source:
      row.source && typeof row.source === 'object' && !Array.isArray(row.source)
        ? (row.source as Record<string, unknown>)
        : {},
    payload:
      row.payload && typeof row.payload === 'object' && !Array.isArray(row.payload)
        ? (row.payload as Record<string, unknown>)
        : {},
    createdAt: String(row.created_at ?? nowIso),
    updatedAt: String(row.updated_at ?? nowIso),
  }))
}
