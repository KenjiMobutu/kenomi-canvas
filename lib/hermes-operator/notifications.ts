import type { HermesOperatorAlert } from '@/lib/hermes-operator/engine'
import type { HermesOperatorSettings } from '@/lib/hermes-operator/settings'

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
  settings?: Pick<
    HermesOperatorSettings,
    'notificationMode' | 'telegramEnabled' | 'telegramNotificationsEnabled' | 'telegramBotLabel'
  >
  brief?: {
    summary: string
    nextBestAction: string
  }
  execution?: {
    enqueuedJobsCount: number
    blockedByPolicyCount: number
    topBlockedReason: string | null
  }
  now?: Date
}) {
  const nowIso = (input.now ?? new Date()).toISOString()
  let sent = 0
  let telegramSent = 0

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

  if (
    input.settings?.notificationMode === 'webhook' &&
    input.settings.telegramEnabled &&
    input.settings.telegramNotificationsEnabled
  ) {
    const url = process.env.TELEGRAM_OPERATOR_NOTIFY_URL
    const secret = process.env.TELEGRAM_OPERATOR_SHARED_SECRET
    const hasTelegramUpdate =
      input.alerts.length > 0 ||
      Boolean(input.brief) ||
      Number(input.execution?.enqueuedJobsCount ?? 0) > 0 ||
      Number(input.execution?.blockedByPolicyCount ?? 0) > 0

    if (url && secret && hasTelegramUpdate) {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${secret}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          user_id: input.userId,
          bot_label: input.settings.telegramBotLabel,
          alerts: input.alerts.map((alert) => ({
            severity: alert.severity,
            category: alert.category,
            headline: alert.headline,
            detail: alert.detail,
            dedupe_key: alert.dedupeKey,
            payload: alert.payload,
          })),
          brief: input.brief
            ? {
                summary: input.brief.summary,
                next_best_action: input.brief.nextBestAction,
              }
            : null,
          execution: input.execution
            ? {
                enqueued_jobs_count: input.execution.enqueuedJobsCount,
                blocked_by_policy_count: input.execution.blockedByPolicyCount,
                top_blocked_reason: input.execution.topBlockedReason,
              }
            : null,
        }),
      })

      if (!response.ok) {
        throw new Error(`Telegram notify failed: ${response.status}`)
      }
      telegramSent = Math.max(input.alerts.length, 1)
    }
  }

  return { sent, telegramSent }
}
