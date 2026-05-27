import { describe, expect, it } from 'vitest'
import {
  cancelAutonomyJob,
  deleteApprovalGate,
  retryAutonomyJob,
  type OperatorSupabase,
} from './operator-actions'

interface JobRow {
  id: string
  user_id: string
  status: string
  attempt_count: number
  locked_at: string | null
  locked_by?: string | null
  lock_expires_at?: string | null
  runner_type?: string | null
  next_run_at: string
  last_error: string | null
  updated_at: string
}

interface ApprovalRow {
  id: string
  user_id: string
  action_id: string
  status: string
  reason?: string | null
}

function fakeSupabase(
  seed: JobRow[] | { autonomy_jobs?: JobRow[]; human_approvals?: ApprovalRow[] }
) {
  const tables = Array.isArray(seed)
    ? { autonomy_jobs: seed.map((row) => ({ ...row })), human_approvals: [] as ApprovalRow[] }
    : {
        autonomy_jobs: (seed.autonomy_jobs ?? []).map((row) => ({ ...row })),
        human_approvals: (seed.human_approvals ?? []).map((row) => ({ ...row })),
      }

  return {
    rows: tables.autonomy_jobs,
    tables,
    from(table: string) {
      if (table !== 'autonomy_jobs' && table !== 'human_approvals')
        throw new Error(`unexpected table ${table}`)
      const rows = tables[table]
      let patch: Record<string, unknown> | null = null
      let shouldDelete = false
      const filters: Array<[string, unknown]> = []
      const builder = {
        select: () => builder,
        update: (row: Record<string, unknown>) => {
          patch = row
          return builder
        },
        delete: () => {
          shouldDelete = true
          return builder
        },
        eq: (field: string, value: unknown) => {
          filters.push([field, value])
          return builder
        },
        maybeSingle: async <T = unknown>() => {
          const index = rows.findIndex((row) =>
            filters.every(([field, value]) => row[field as keyof typeof row] === value)
          )
          const current = index >= 0 ? rows[index] : null
          if (!current) return { data: null, error: null }
          if (patch) Object.assign(current, patch)
          if (shouldDelete) rows.splice(index, 1)
          return { data: current as T, error: null }
        },
      }
      return builder
    },
  }
}

const baseJob: JobRow = {
  id: 'job-1',
  user_id: 'user-1',
  status: 'failed',
  attempt_count: 2,
  locked_at: '2026-05-19T09:00:00.000Z',
  locked_by: 'worker:stale',
  lock_expires_at: '2026-05-19T09:05:00.000Z',
  runner_type: 'internal_worker',
  next_run_at: '2026-05-19T09:30:00.000Z',
  last_error: 'boom',
  updated_at: '2026-05-19T09:00:00.000Z',
}

describe('operator autonomy actions', () => {
  it('retries a failed job without resetting attempt count', async () => {
    const supabase = fakeSupabase([baseJob])

    const result = await retryAutonomyJob({
      supabase: supabase as unknown as OperatorSupabase,
      userId: 'user-1',
      jobId: 'job-1',
      now: new Date('2026-05-19T10:00:00.000Z'),
    })

    expect(result).toMatchObject({ ok: true, code: 'retried' })
    expect(supabase.rows[0]).toMatchObject({
      status: 'queued',
      attempt_count: 2,
      locked_at: null,
      locked_by: null,
      lock_expires_at: null,
      last_error: null,
      next_run_at: '2026-05-19T10:00:00.000Z',
    })
  })

  it('cancels a queued job', async () => {
    const supabase = fakeSupabase([{ ...baseJob, status: 'queued' }])

    const result = await cancelAutonomyJob({
      supabase: supabase as unknown as OperatorSupabase,
      userId: 'user-1',
      jobId: 'job-1',
      now: new Date('2026-05-19T10:00:00.000Z'),
    })

    expect(result).toMatchObject({ ok: true, code: 'cancelled' })
    expect(supabase.rows[0]).toMatchObject({
      status: 'cancelled',
      locked_at: null,
      locked_by: null,
      lock_expires_at: null,
      updated_at: '2026-05-19T10:00:00.000Z',
    })
  })

  it('does not retry a running job', async () => {
    const supabase = fakeSupabase([{ ...baseJob, status: 'running' }])

    const result = await retryAutonomyJob({
      supabase: supabase as unknown as OperatorSupabase,
      userId: 'user-1',
      jobId: 'job-1',
      now: new Date('2026-05-19T10:00:00.000Z'),
    })

    expect(result).toMatchObject({
      ok: false,
      code: 'invalid_status',
      message: 'Impossible de retry un job running.',
    })
    expect(supabase.rows[0]?.status).toBe('running')
  })

  it('deletes an approval gate owned by the user', async () => {
    const supabase = fakeSupabase({
      human_approvals: [
        { id: 'approval-1', user_id: 'user-1', action_id: 'action-1', status: 'pending' },
      ],
    })

    const result = await deleteApprovalGate({
      supabase: supabase as unknown as OperatorSupabase,
      userId: 'user-1',
      approvalId: 'approval-1',
    })

    expect(result).toMatchObject({ ok: true, code: 'approval_deleted' })
    expect(supabase.tables.human_approvals).toEqual([])
  })
})
