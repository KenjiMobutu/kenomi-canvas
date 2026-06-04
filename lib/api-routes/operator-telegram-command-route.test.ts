import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { mockedSupabaseAdmin } = vi.hoisted(() => ({
  mockedSupabaseAdmin: { from: vi.fn() },
}))

vi.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: mockedSupabaseAdmin,
}))

import { POST } from '@/app/api/operator/telegram/command/route'

function makeSupabase() {
  const tables: Record<string, Record<string, unknown>[]> = {
    user_operator_settings: [
      {
        user_id: 'user-1',
        telegram_enabled: true,
        telegram_allowed_chat_id: '1',
        operator_mode: 'recommend',
        max_auto_actions_per_day: 6,
        max_auto_prospect_runs_per_day: 3,
        max_auto_follow_up_scans_per_day: 2,
        max_auto_devops_runs_per_day: 1,
      },
    ],
    hermes_operator_briefs: [
      {
        id: 'brief-1',
        user_id: 'user-1',
        run_id: 'run-1',
        summary: 'Push Shopify follow-ups.',
        next_best_action: 'Run follow-up scan on hot replies',
        created_at: '2026-06-04T12:00:00.000Z',
      },
    ],
    business_alerts: [
      {
        id: 'alert-1',
        user_id: 'user-1',
        headline: 'Cash blocked by approvals',
        created_at: '2026-06-04T12:10:00.000Z',
      },
    ],
    payment_attributions: [
      {
        id: 'pay-1',
        user_id: 'user-1',
        amount_cents: 12000,
        status: 'paid',
      },
      {
        id: 'pay-2',
        user_id: 'user-1',
        amount_cents: 5000,
        status: 'pending',
      },
    ],
    prospects: [
      {
        id: 'pros-1',
        user_id: 'user-1',
        approval_status: 'pending',
      },
    ],
    hermes_operator_recommendations: [],
    autonomy_jobs: [],
    operator_remote_commands: [],
  }

  function makeBuilder(table: string) {
    const state = {
      filters: [] as Array<{ field: string; value: unknown }>,
      limitCount: null as number | null,
      orderField: null as string | null,
      ascending: true,
      inserted: null as Record<string, unknown> | null,
    }

    const resolveRows = () => {
      let rows = [...(tables[table] ?? [])].filter((row) =>
        state.filters.every((filter) => row[filter.field] === filter.value)
      )
      if (state.orderField) {
        rows.sort((a, b) => {
          const left = String(a[state.orderField!] ?? '')
          const right = String(b[state.orderField!] ?? '')
          return state.ascending ? left.localeCompare(right) : right.localeCompare(left)
        })
      }
      if (state.limitCount !== null) rows = rows.slice(0, state.limitCount)
      return rows
    }

    const builder = {
      select: () => builder,
      eq: (field: string, value: unknown) => {
        state.filters.push({ field, value })
        return builder
      },
      order: (field: string, options?: { ascending?: boolean }) => {
        state.orderField = field
        state.ascending = options?.ascending ?? true
        return builder
      },
      limit: (count: number) => {
        state.limitCount = count
        return builder
      },
      insert: (payload: Record<string, unknown>) => {
        const row = { id: `${table}-${tables[table].length + 1}`, ...payload }
        tables[table].push(row)
        state.inserted = row
        return builder
      },
      maybeSingle: async () => ({
        data: resolveRows()[0] ?? state.inserted ?? null,
        error: null,
      }),
      then: (onfulfilled?: (value: { data: Record<string, unknown>[]; error: null }) => unknown) =>
        Promise.resolve(onfulfilled?.({ data: resolveRows(), error: null })),
    }

    return builder
  }

  return {
    tables,
    from: (table: string) => makeBuilder(table),
  }
}

describe('operator telegram command route', () => {
  beforeEach(() => {
    mockedSupabaseAdmin.from.mockImplementation(makeSupabase().from)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    mockedSupabaseAdmin.from.mockReset()
  })

  it('returns 401 without bot secret', async () => {
    const res = await POST(
      new Request('http://localhost/api/operator/telegram/command', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ chat_id: '1', text: '/brief' }),
      }) as never
    )

    expect(res.status).toBe(401)
  })

  it('returns a scaffolded payload with a valid bot secret', async () => {
    vi.stubEnv('TELEGRAM_OPERATOR_SHARED_SECRET', 'telegram-shared-secret')

    const res = await POST(
      new Request('http://localhost/api/operator/telegram/command', {
        method: 'POST',
        headers: {
          authorization: 'Bearer telegram-shared-secret',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ chat_id: '1', text: '/brief' }),
      }) as never
    )

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({
      ok: true,
      summary: 'Push Shopify follow-ups.. Next: Run follow-up scan on hot replies.',
      intent: 'read_brief',
      executed: false,
      deep_link: '/studio',
    })
  })

  it('returns blocked response for unsupported commands', async () => {
    vi.stubEnv('TELEGRAM_OPERATOR_SHARED_SECRET', 'telegram-shared-secret')

    const res = await POST(
      new Request('http://localhost/api/operator/telegram/command', {
        method: 'POST',
        headers: {
          authorization: 'Bearer telegram-shared-secret',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ chat_id: '1', text: 'run scout' }),
      }) as never
    )

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({
      ok: true,
      intent: 'refuse',
      executed: false,
      blocked_reason: 'unsupported_command',
    })
  })

  it('returns executed response for run prospect', async () => {
    vi.stubEnv('TELEGRAM_OPERATOR_SHARED_SECRET', 'telegram-shared-secret')

    const res = await POST(
      new Request('http://localhost/api/operator/telegram/command', {
        method: 'POST',
        headers: {
          authorization: 'Bearer telegram-shared-secret',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ chat_id: '1', text: 'run prospect' }),
      }) as never
    )

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({
      ok: true,
      intent: 'run_prospect',
      summary: 'Prospect run launched.',
      executed: true,
      blocked_reason: null,
      deep_link: '/studio/prospects',
    })
  })
})
