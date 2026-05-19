import { describe, expect, it } from 'vitest'
import { cancelAutonomyJob, retryAutonomyJob, type OperatorSupabase } from './operator-actions'

interface JobRow {
  id: string
  user_id: string
  status: string
  attempt_count: number
  locked_at: string | null
  next_run_at: string
  last_error: string | null
  updated_at: string
}

function fakeSupabase(seed: JobRow[]) {
  const rows = seed.map((row) => ({ ...row }))

  return {
    rows,
    from(table: string) {
      if (table !== 'autonomy_jobs') throw new Error(`unexpected table ${table}`)
      let patch: Partial<JobRow> | null = null
      const filters: Array<[string, unknown]> = []
      const builder = {
        select: () => builder,
        update: (row: Partial<JobRow>) => {
          patch = row
          return builder
        },
        eq: (field: string, value: unknown) => {
          filters.push([field, value])
          return builder
        },
        maybeSingle: async <T = unknown>() => {
          const current = rows.find((row) =>
            filters.every(([field, value]) => row[field as keyof JobRow] === value)
          )
          if (!current) return { data: null, error: null }
          if (patch) Object.assign(current, patch)
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
})
