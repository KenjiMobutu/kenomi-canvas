import type { HermesOperatorAlert } from '@/lib/hermes-operator/engine'

interface QueryResult<T> {
  data: T | null
  error: { message: string } | null
}

interface QueryBuilder<T = unknown> extends PromiseLike<QueryResult<T[]>> {
  select(columns?: string): QueryBuilder<T>
  eq(field: string, value: unknown): QueryBuilder<T>
  insert(row: Record<string, unknown> | Record<string, unknown>[]): QueryBuilder<T>
  update(row: Record<string, unknown>): QueryBuilder<T>
  maybeSingle(): Promise<QueryResult<T>>
}

export interface HermesAlertsSupabase {
  from(table: string): QueryBuilder<any>
}

type ExistingAlert = {
  id: string
  status?: string | null
}

async function readSingle<T>(query: QueryBuilder<T>): Promise<T | null> {
  const result = await query.maybeSingle()
  if (result.error) throw new Error(result.error.message)
  return result.data
}

export async function persistOperatorAlerts(input: {
  supabase: HermesAlertsSupabase
  userId: string
  runId: string
  alerts: HermesOperatorAlert[]
  now?: Date
}) {
  const nowIso = (input.now ?? new Date()).toISOString()

  for (const alert of input.alerts) {
    const existing = await readSingle<ExistingAlert>(
      input.supabase
        .from('business_alerts')
        .select('id, status')
        .eq('user_id', input.userId)
        .eq('dedupe_key', alert.dedupeKey)
    )

    if (existing?.id) {
      const result = await input.supabase
        .from('business_alerts')
        .update({
          run_id: input.runId,
          severity: alert.severity,
          category: alert.category,
          headline: alert.headline,
          detail: alert.detail,
          channel: alert.channel,
          payload: alert.payload,
          updated_at: nowIso,
        })
        .eq('id', existing.id)
      const resolved = await result
      if (resolved.error) throw new Error(resolved.error.message)
      continue
    }

    const insertResult = await input.supabase.from('business_alerts').insert({
      user_id: input.userId,
      run_id: input.runId,
      severity: alert.severity,
      category: alert.category,
      dedupe_key: alert.dedupeKey,
      headline: alert.headline,
      detail: alert.detail,
      status: 'open',
      channel: alert.channel,
      payload: alert.payload,
      created_at: nowIso,
      updated_at: nowIso,
    })
    const resolved = await insertResult
    if (resolved.error) throw new Error(resolved.error.message)
  }
}
