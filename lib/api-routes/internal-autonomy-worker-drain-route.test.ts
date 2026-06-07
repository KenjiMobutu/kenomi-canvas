import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockedSupabaseAdmin,
  mockedProcessQueuedAutonomyJobs,
  mockedRunHermesOperatorTick,
} = vi.hoisted(() => ({
  mockedSupabaseAdmin: { from: vi.fn() },
  mockedProcessQueuedAutonomyJobs: vi.fn(),
  mockedRunHermesOperatorTick: vi.fn(),
}))

vi.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: mockedSupabaseAdmin,
}))

vi.mock('@/lib/autonomy/job-runner', () => ({
  processQueuedAutonomyJobs: mockedProcessQueuedAutonomyJobs,
}))

vi.mock('@/lib/hermes-operator/runner', () => ({
  runHermesOperatorTick: mockedRunHermesOperatorTick,
}))

vi.mock('@/lib/autonomy/run-agent-step', () => ({
  runAgentStep: vi.fn(),
}))

vi.mock('@/lib/prospect/scheduled-follow-ups', () => ({
  processDueProspectFollowUps: vi.fn(),
}))

vi.mock('@/lib/autonomy/scheduler', () => ({
  markBusinessScheduleCompleted: vi.fn(),
}))

import { POST } from '@/app/api/internal/autonomy/worker/drain/route'

describe('internal autonomy worker drain route', () => {
  beforeEach(() => {
    vi.stubEnv('AUTONOMY_WORKER_SECRET', 'worker-secret')
    mockedProcessQueuedAutonomyJobs.mockImplementation(async (input) => {
      const result = await input.runHermesOperatorTick({
        supabase: input.supabase,
        userId: 'user-1',
        mode: undefined,
        payload: { scheduleKey: 'hermes_operator', scheduled: true },
        now: new Date('2026-06-07T13:15:00.000Z'),
      })

      return [
        {
          job: {
            id: 'job-hermes-1',
            status: 'completed',
          },
          result,
        },
      ]
    })
    mockedRunHermesOperatorTick.mockResolvedValue({
      runId: 'run-1',
      mode: 'recommend',
      status: 'completed',
      summary: 'Hermes mode respected.',
      model: 'hermes3:8b',
      recommendationsCount: 1,
      alertsCount: 0,
      fallbackTriggered: false,
    })
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    mockedSupabaseAdmin.from.mockReset()
    mockedProcessQueuedAutonomyJobs.mockReset()
    mockedRunHermesOperatorTick.mockReset()
  })

  it('passes no explicit mode to Hermes when the queued job has none', async () => {
    const res = await POST(
      new Request('http://localhost/api/internal/autonomy/worker/drain', {
        method: 'POST',
        headers: {
          'x-autonomy-worker-token': 'worker-secret',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          worker_id: 'worker:test',
          limit: 1,
          allowed_job_kinds: ['hermes_operator_tick'],
        }),
      }) as never
    )

    expect(res.status).toBe(200)
    expect(mockedRunHermesOperatorTick).toHaveBeenCalledTimes(1)
    expect(mockedRunHermesOperatorTick.mock.calls[0]?.[0]).toMatchObject({
      userId: 'user-1',
      payload: { scheduleKey: 'hermes_operator', scheduled: true },
    })
    expect(mockedRunHermesOperatorTick.mock.calls[0]?.[0]?.mode).toBeUndefined()
  })
})
