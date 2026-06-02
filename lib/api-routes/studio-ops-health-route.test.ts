import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockedCookies,
  mockedRequireAllowedUser,
  mockedCollectInfraDiagnostics,
  mockedGetProxmoxMetrics,
  mockedResolveProxmoxConfig,
  mockedUnwrapOptionalInfraSettings,
  mockedLogError,
} = vi.hoisted(() => ({
  mockedCookies: vi.fn(),
  mockedRequireAllowedUser: vi.fn(),
  mockedCollectInfraDiagnostics: vi.fn(),
  mockedGetProxmoxMetrics: vi.fn(),
  mockedResolveProxmoxConfig: vi.fn(),
  mockedUnwrapOptionalInfraSettings: vi.fn(),
  mockedLogError: vi.fn(),
}))

vi.mock('next/headers', () => ({
  cookies: mockedCookies,
}))

vi.mock('@/lib/auth-server', () => ({
  requireAllowedUser: mockedRequireAllowedUser,
}))

vi.mock('@/lib/infra-diagnostics-runner', () => ({
  collectInfraDiagnostics: mockedCollectInfraDiagnostics,
}))

vi.mock('@/lib/proxmox-client', () => ({
  getProxmoxMetrics: mockedGetProxmoxMetrics,
  resolveProxmoxConfig: mockedResolveProxmoxConfig,
}))

vi.mock('@/lib/user-settings-normalization', () => ({
  unwrapOptionalInfraSettings: mockedUnwrapOptionalInfraSettings,
}))

vi.mock('@/lib/logger', () => ({
  logError: mockedLogError,
}))

import { GET } from '@/app/api/studio/ops/health/route'

function makeSupabase() {
  const tables: Record<string, Record<string, unknown>[]> = {
    autonomy_jobs: [{ id: 'job-1', user_id: 'user-1', status: 'failed', updated_at: '2026-06-02T08:00:00.000Z' }],
    human_approvals: [{ id: 'approval-1', user_id: 'user-1', status: 'pending' }],
    ventures: [{ id: 'venture-1', user_id: 'user-1' }],
    payments: [
      { id: 'pay-1', venture_id: 'venture-1', status: 'completed', updated_at: '2026-06-02T07:00:00.000Z' },
      { id: 'pay-2', venture_id: 'venture-2', status: 'completed', updated_at: '2026-06-02T07:00:00.000Z' },
    ],
    venture_events: [{ id: 'event-1', user_id: 'user-1', occurred_at: '2026-06-02T07:30:00.000Z' }],
    user_settings: [{ user_id: 'user-1', proxmox_base_url: null, proxmox_node: null }],
  }

  const schema: Record<string, string[]> = {
    autonomy_jobs: ['id', 'user_id', 'status', 'updated_at'],
    human_approvals: ['id', 'user_id', 'status'],
    ventures: ['id', 'user_id'],
    payments: ['id', 'venture_id', 'status', 'updated_at'],
    venture_events: ['id', 'user_id', 'occurred_at'],
    user_settings: ['user_id', 'proxmox_base_url', 'proxmox_node'],
  }

  function makeBuilder(table: string) {
    const state = {
      filters: [] as Array<{ field: string; value: unknown; op: 'eq' | 'gte' | 'in' }>,
      error: null as { message: string } | null,
      head: false,
      count: false,
    }

    const resolveRows = () =>
      [...(tables[table] ?? [])].filter((row) =>
        state.filters.every((filter) => {
          if (filter.op === 'eq') return row[filter.field] === filter.value
          if (filter.op === 'in') return Array.isArray(filter.value) && filter.value.includes(row[filter.field])
          if (filter.op === 'gte') return String(row[filter.field] ?? '') >= String(filter.value)
          return true
        })
      )

    const builder = {
      select: (_columns?: string, options?: { count?: 'exact'; head?: boolean }) => {
        state.count = options?.count === 'exact'
        state.head = options?.head === true
        return builder
      },
      eq: (field: string, value: unknown) => {
        if (!schema[table]?.includes(field)) {
          state.error = { message: `column ${table}.${field} does not exist` }
          return builder
        }
        state.filters.push({ field, value, op: 'eq' })
        return builder
      },
      in: (field: string, value: unknown[]) => {
        if (!schema[table]?.includes(field)) {
          state.error = { message: `column ${table}.${field} does not exist` }
          return builder
        }
        state.filters.push({ field, value, op: 'in' })
        return builder
      },
      gte: (field: string, value: unknown) => {
        if (!schema[table]?.includes(field)) {
          state.error = { message: `column ${table}.${field} does not exist` }
          return builder
        }
        state.filters.push({ field, value, op: 'gte' })
        return builder
      },
      order: () => builder,
      limit: () => builder,
      maybeSingle: async () => ({
        data: resolveRows()[0] ?? null,
        error: state.error,
      }),
      then: (onfulfilled?: (value: { data: Record<string, unknown>[] | null; error: { message: string } | null; count?: number | null }) => unknown) => {
        const rows = state.error ? null : resolveRows()
        return Promise.resolve(
          onfulfilled?.({
            data: state.head ? null : rows,
            error: state.error,
            count: state.count && rows ? rows.length : null,
          })
        )
      },
    }

    return builder
  }

  return {
    from: (table: string) => makeBuilder(table),
  }
}

describe('studio ops health route', () => {
  beforeEach(() => {
    mockedCookies.mockResolvedValue({ getAll: () => [] })
    mockedRequireAllowedUser.mockResolvedValue({
      user: { id: 'user-1' },
      supabase: makeSupabase(),
      response: null,
    })
    mockedCollectInfraDiagnostics.mockResolvedValue({
      runtime: { sourceCommit: 'abc1234' },
      summary: { ok: true },
      checkedAt: '2026-06-02T08:30:00.000Z',
    })
    mockedUnwrapOptionalInfraSettings.mockReturnValue({})
    mockedResolveProxmoxConfig.mockReturnValue({ tokenSecret: null })
    mockedGetProxmoxMetrics.mockResolvedValue({ nodes: [] })
  })

  it('counts payments through owned ventures instead of legacy payments.user_id', async () => {
    const response = await GET()
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.ok).toBe(true)
    expect(body.summary.signals).toContainEqual(
      expect.objectContaining({
        id: 'revenue_today',
        value: '1€ · 1 ev',
      })
    )
  })
})
