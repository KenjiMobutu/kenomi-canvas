import { afterEach, describe, expect, it, vi } from 'vitest'
import { dispatchOperatorNotifications } from '@/lib/hermes-operator/notifications'

function createFakeSupabase(seed?: Record<string, Record<string, unknown>[]>) {
  const tables: Record<string, Record<string, unknown>[]> = {
    business_alerts: seed?.business_alerts ?? [],
  }

  return {
    tables,
    from(table: string) {
      if (!(table in tables)) throw new Error(`Unexpected table ${table}`)
      const state = {
        filters: [] as Array<{ field: string; value: unknown }>,
      }

      const matches = (row: Record<string, unknown>) =>
        state.filters.every((filter) => row[filter.field] === filter.value)

      const builder = {
        eq(field: string, value: unknown) {
          state.filters.push({ field, value })
          return builder
        },
        update(patch: Record<string, unknown>) {
          tables[table].filter(matches).forEach((row) => Object.assign(row, patch))
          return builder
        },
        then: (resolve: (value: { data: Record<string, unknown>[]; error: null }) => unknown) =>
          Promise.resolve(resolve({ data: tables[table].filter(matches), error: null })),
      }

      return builder
    },
  }
}

describe('dispatchOperatorNotifications', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('marks studio alerts as sent', async () => {
    const supabase = createFakeSupabase({
      business_alerts: [
        {
          id: 'alert-1',
          user_id: 'user-1',
          dedupe_key: 'cash:reddit',
          status: 'open',
          channel: 'studio',
        },
        {
          id: 'alert-2',
          user_id: 'user-1',
          dedupe_key: 'infra:degraded',
          status: 'open',
          channel: 'studio',
        },
      ],
    })

    const result = await dispatchOperatorNotifications({
      supabase: supabase as never,
      userId: 'user-1',
      now: new Date('2026-05-28T10:30:00.000Z'),
      alerts: [
        {
          severity: 'warn',
          category: 'cash_blocker',
          dedupeKey: 'cash:reddit',
          headline: 'Cash stuck',
          detail: 'Replies but no wins.',
          channel: 'studio',
          payload: {},
        },
        {
          severity: 'critical',
          category: 'infra',
          dedupeKey: 'infra:degraded',
          headline: 'Infra degraded',
          detail: 'One service is down.',
          channel: 'studio',
          payload: {},
        },
      ],
    })

    expect(result).toEqual({ sent: 2, telegramSent: 0 })
    expect(supabase.tables.business_alerts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ dedupe_key: 'cash:reddit', status: 'sent' }),
        expect.objectContaining({ dedupe_key: 'infra:degraded', status: 'sent' }),
      ])
    )
  })

  it('ignores non-studio alerts', async () => {
    const supabase = createFakeSupabase({
      business_alerts: [
        {
          id: 'alert-1',
          user_id: 'user-1',
          dedupe_key: 'cash:webhook',
          status: 'open',
          channel: 'webhook',
        },
      ],
    })

    const result = await dispatchOperatorNotifications({
      supabase: supabase as never,
      userId: 'user-1',
      alerts: [
        {
          severity: 'warn',
          category: 'cash_blocker',
          dedupeKey: 'cash:webhook',
          headline: 'Webhook only',
          detail: 'Not for studio dispatch.',
          channel: 'webhook' as never,
          payload: {},
        },
      ],
    })

    expect(result).toEqual({ sent: 0, telegramSent: 0 })
    expect(supabase.tables.business_alerts[0]).toMatchObject({ status: 'open' })
  })

  it('dispatches telegram notifications when webhook mode and telegram settings are enabled', async () => {
    vi.stubEnv('TELEGRAM_OPERATOR_NOTIFY_URL', 'https://bot.example.test/notify')
    vi.stubEnv('TELEGRAM_OPERATOR_SHARED_SECRET', 'telegram-secret')

    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 202 })
    vi.stubGlobal('fetch', fetchMock)

    const supabase = createFakeSupabase({
      business_alerts: [
        {
          id: 'alert-1',
          user_id: 'user-1',
          dedupe_key: 'cash:telegram',
          status: 'open',
          channel: 'studio',
        },
      ],
    })

    const result = await dispatchOperatorNotifications({
      supabase: supabase as never,
      userId: 'user-1',
      settings: {
        notificationMode: 'webhook',
        telegramEnabled: true,
        telegramNotificationsEnabled: true,
        telegramBotLabel: 'Hermes',
      },
      alerts: [
        {
          severity: 'warn',
          category: 'cash_blocker',
          dedupeKey: 'cash:telegram',
          headline: 'Cash stuck',
          detail: 'Replies but no wins.',
          channel: 'studio',
          payload: { source: 'reddit' },
        },
      ],
    })

    expect(fetchMock).toHaveBeenCalledWith(
      'https://bot.example.test/notify',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          authorization: 'Bearer telegram-secret',
          'content-type': 'application/json',
        }),
      })
    )
    expect(result).toEqual({ sent: 1, telegramSent: 1 })
  })
})
