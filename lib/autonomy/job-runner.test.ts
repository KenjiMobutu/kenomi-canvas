import { describe, expect, it } from 'vitest'
import {
  claimNextJob,
  claimNextQueuedJob,
  completeJob,
  failJob,
  processQueuedAutonomyJobs,
  rescheduleJob,
  type AutonomyJobRow,
} from './job-runner'

function createFakeSupabase(initialJobs: AutonomyJobRow[]) {
  const jobs = initialJobs.map((job) => ({ ...job }))

  return {
    jobs,
    from(table: string) {
      if (table !== 'autonomy_jobs') throw new Error(`Unexpected table ${table}`)
      const state = {
        patch: null as Partial<AutonomyJobRow> | null,
        filters: [] as Array<{ field: string; value: unknown }>,
        lteFilter: null as { field: string; value: string } | null,
      }
      const builder = {
        select: () => builder,
        update: (patch: Partial<AutonomyJobRow>) => {
          state.patch = patch
          return builder
        },
        eq: (field: string, value: unknown) => {
          state.filters.push({ field, value })
          return builder
        },
        lte: (field: string, value: string) => {
          state.lteFilter = { field, value }
          return builder
        },
        order: () => builder,
        limit: () => builder,
        maybeSingle: async () => {
          const row = jobs.find((job) => {
            const matchesEq = state.filters.every(
              (filter) => job[filter.field as keyof AutonomyJobRow] === filter.value
            )
            const matchesLte =
              !state.lteFilter ||
              String(job[state.lteFilter.field as keyof AutonomyJobRow]) <= state.lteFilter.value
            return matchesEq && matchesLte
          })
          if (!row) return { data: null, error: null }
          if (state.patch) Object.assign(row, state.patch)
          return { data: { ...row }, error: null }
        },
      }
      return builder
    },
  }
}

const baseJob: AutonomyJobRow = {
  id: 'job-1',
  user_id: 'user-1',
  venture_id: null,
  kind: 'run_agent',
  status: 'queued',
  locked_at: null,
  attempt_count: 0,
  next_run_at: '2026-05-18T09:00:00.000Z',
  payload: { agentId: 'scout' },
  last_error: null,
  created_at: '2026-05-18T08:00:00.000Z',
  updated_at: '2026-05-18T08:00:00.000Z',
}

describe('claimNextJob', () => {
  it('claim le prochain job queued arrivé à échéance', async () => {
    const supabase = createFakeSupabase([baseJob])
    const claimed = await claimNextJob(supabase, 'user-1', new Date('2026-05-18T10:00:00.000Z'))

    expect(claimed?.id).toBe('job-1')
    expect(claimed?.status).toBe('running')
    expect(claimed?.attempt_count).toBe(1)
    expect(claimed?.locked_at).toBe('2026-05-18T10:00:00.000Z')
  })

  it('ne claim pas deux fois le même job', async () => {
    const supabase = createFakeSupabase([baseJob])
    await claimNextJob(supabase, 'user-1', new Date('2026-05-18T10:00:00.000Z'))
    const secondClaim = await claimNextJob(supabase, 'user-1', new Date('2026-05-18T10:01:00.000Z'))

    expect(secondClaim).toBeNull()
  })
})

describe('claimNextQueuedJob', () => {
  it('claim le prochain job queued sans filtre utilisateur', async () => {
    const supabase = createFakeSupabase([
      { ...baseJob, id: 'job-old', user_id: 'user-2', next_run_at: '2026-05-18T08:00:00.000Z' },
      { ...baseJob, id: 'job-due', user_id: 'user-1', next_run_at: '2026-05-18T09:00:00.000Z' },
    ])

    const claimed = await claimNextQueuedJob(supabase, new Date('2026-05-18T10:00:00.000Z'))

    expect(claimed?.id).toBe('job-old')
    expect(claimed?.status).toBe('running')
    expect(claimed?.attempt_count).toBe(1)
    expect(claimed?.locked_at).toBe('2026-05-18T10:00:00.000Z')
  })
})

describe('processQueuedAutonomyJobs', () => {
  it('exécute un job queued via le worker et le marque completed', async () => {
    const supabase = createFakeSupabase([
      {
        ...baseJob,
        id: 'job-queued',
        user_id: 'user-1',
        payload: {
          agentId: 'prospect',
          prompt: 'Trouve un prospect qualifié.',
          ventureId: null,
          input: { source: 'linkedin' },
        },
      },
    ])

    const processed = await processQueuedAutonomyJobs({
      supabase,
      now: new Date('2026-05-18T10:00:00.000Z'),
      runAgentStep: async () => ({
        ok: true,
        content: 'done',
        durationMs: 12,
        model: 'hermes3:8b',
        agentRunId: 'agent-run-1',
        parsedOutput: { company_name: 'Acme' },
      }),
    })

    expect(processed).toHaveLength(1)
    expect(processed[0]?.job).toMatchObject({
      id: 'job-queued',
      status: 'completed',
      locked_at: null,
    })
    expect(processed[0]?.result).toMatchObject({
      ok: true,
      model: 'hermes3:8b',
      agentRunId: 'agent-run-1',
    })
    expect(supabase.jobs[0]).toMatchObject({
      status: 'completed',
      last_error: null,
      payload: {
        agentId: 'prospect',
        prompt: 'Trouve un prospect qualifié.',
        ventureId: null,
        input: { source: 'linkedin' },
        output: {
          agentRunId: 'agent-run-1',
          content: 'done',
          durationMs: 12,
          model: 'hermes3:8b',
          parsedOutput: { company_name: 'Acme' },
        },
      },
    })
  })
})

describe('job state transitions', () => {
  it('marque un job comme completed avec output', async () => {
    const supabase = createFakeSupabase([{ ...baseJob, status: 'running' }])
    const completed = await completeJob(
      supabase,
      'job-1',
      { ok: true },
      new Date('2026-05-18T10:00:00.000Z')
    )

    expect(completed?.status).toBe('completed')
    expect(completed?.payload).toEqual({ agentId: 'scout', output: { ok: true } })
    expect(completed?.locked_at).toBeNull()
  })

  it('marque un job comme failed avec last_error', async () => {
    const supabase = createFakeSupabase([{ ...baseJob, status: 'running' }])
    const failed = await failJob(
      supabase,
      'job-1',
      'LLM unavailable',
      new Date('2026-05-18T10:00:00.000Z')
    )

    expect(failed?.status).toBe('failed')
    expect(failed?.last_error).toBe('LLM unavailable')
    expect(failed?.locked_at).toBeNull()
  })

  it('reschedule un job pour une prochaine exécution', async () => {
    const supabase = createFakeSupabase([{ ...baseJob, status: 'running' }])
    const rescheduled = await rescheduleJob(
      supabase,
      'job-1',
      '2026-05-18T11:00:00.000Z',
      new Date('2026-05-18T10:00:00.000Z')
    )

    expect(rescheduled?.status).toBe('queued')
    expect(rescheduled?.next_run_at).toBe('2026-05-18T11:00:00.000Z')
    expect(rescheduled?.locked_at).toBeNull()
  })
})
