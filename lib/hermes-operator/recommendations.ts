import type { HermesOperatorRecommendation } from '@/lib/hermes-operator/engine'

interface QueryResult<T> {
  data: T | null
  error: { message: string } | null
}

interface QueryBuilder<T = unknown> extends PromiseLike<QueryResult<T[]>> {
  insert(row: Record<string, unknown> | Record<string, unknown>[]): QueryBuilder<T>
}

export interface HermesRecommendationsSupabase {
  from(table: string): QueryBuilder<any>
}

export async function persistOperatorRecommendations(input: {
  supabase: HermesRecommendationsSupabase
  userId: string
  runId: string
  recommendations: HermesOperatorRecommendation[]
  now?: Date
}) {
  const nowIso = (input.now ?? new Date()).toISOString()
  if (input.recommendations.length === 0) return

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
  )

  const resolved = await result
  if (resolved.error) throw new Error(resolved.error.message)
}
