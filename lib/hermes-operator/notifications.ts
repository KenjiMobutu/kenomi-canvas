import type { HermesOperatorAlert } from '@/lib/hermes-operator/engine'

interface QueryResult<T> {
  data: T | null
  error: { message: string } | null
}

interface QueryBuilder<T = unknown> extends PromiseLike<QueryResult<T[]>> {
  eq(field: string, value: unknown): QueryBuilder<T>
  update(row: Record<string, unknown>): QueryBuilder<T>
}

export interface HermesNotificationSupabase {
  from(table: string): QueryBuilder<any>
}

export async function dispatchOperatorNotifications(input: {
  supabase: HermesNotificationSupabase
  userId: string
  alerts: HermesOperatorAlert[]
  now?: Date
}) {
  const nowIso = (input.now ?? new Date()).toISOString()
  let sent = 0

  for (const alert of input.alerts) {
    if (alert.channel !== 'studio') continue

    const result = await input.supabase
      .from('business_alerts')
      .update({
        status: 'sent',
        updated_at: nowIso,
      })
      .eq('user_id', input.userId)
      .eq('dedupe_key', alert.dedupeKey)
    const resolved = await result
    if (resolved.error) throw new Error(resolved.error.message)
    sent += 1
  }

  return { sent }
}
