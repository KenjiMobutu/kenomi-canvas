import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAllowedUser } from '@/lib/auth-server'
import {
  type BusinessScheduleSupabase,
  ensureBusinessSchedulesForUser,
  runBusinessScheduler,
  updateBusinessSchedule,
  type BusinessScheduleKey,
  type BusinessScheduleStatus,
} from '@/lib/autonomy/scheduler'

interface ScheduleJobRow {
  id: string
  kind: string
  status: string
  attempt_count: number | null
  next_run_at: string | null
  locked_at: string | null
  locked_by: string | null
  lock_expires_at: string | null
  runner_type: string | null
  last_error: string | null
  payload: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

const schedulePatchSchema = z.object({
  scheduleKey: z.enum(['scout', 'prospect', 'follow_ups', 'devops']),
  status: z.enum(['active', 'paused']).optional(),
  runNow: z.boolean().optional(),
  intervalMinutes: z.number().int().min(5).max(1440).optional(),
  nextRunAt: z.string().datetime().optional(),
})

function sortSchedules<T extends { schedule_key: BusinessScheduleKey }>(rows: T[]): T[] {
  const order: BusinessScheduleKey[] = ['scout', 'prospect', 'follow_ups', 'devops']
  return [...rows].sort((a, b) => order.indexOf(a.schedule_key) - order.indexOf(b.schedule_key))
}

function getScheduleKeyFromJob(job: ScheduleJobRow): BusinessScheduleKey | null {
  const key = job.payload?.scheduleKey
  return key === 'scout' || key === 'prospect' || key === 'follow_ups' || key === 'devops'
    ? key
    : null
}

function buildScheduleObservability(input: {
  schedules: Array<{
    schedule_key: BusinessScheduleKey
    status: BusinessScheduleStatus
    next_run_at: string
  }>
  jobs: ScheduleJobRow[]
  now: Date
}) {
  const bySchedule = new Map<BusinessScheduleKey, ScheduleJobRow[]>()
  const workerBacklog = { queued: 0, running: 0, failed: 0, cancelled: 0 }

  for (const job of input.jobs) {
    if (job.status === 'queued') workerBacklog.queued += 1
    if (job.status === 'running') workerBacklog.running += 1
    if (job.status === 'failed') workerBacklog.failed += 1
    if (job.status === 'cancelled') workerBacklog.cancelled += 1

    const scheduleKey = getScheduleKeyFromJob(job)
    if (!scheduleKey) continue
    bySchedule.set(scheduleKey, [...(bySchedule.get(scheduleKey) ?? []), job])
  }

  const fifteenMinutesAgo = input.now.getTime() - 15 * 60_000
  const nowIso = input.now.toISOString()

  return {
    workerBacklog,
    schedules: input.schedules.map((schedule) => {
      const jobs = bySchedule.get(schedule.schedule_key) ?? []
      const latestJob = jobs[0] ?? null
      const latestFailedJob = jobs.find((job) => job.status === 'failed') ?? null
      const latestQueuedJob = jobs.find((job) => job.status === 'queued') ?? null
      const latestRunningJob = jobs.find((job) => job.status === 'running') ?? null
      const latestCancelledJob = jobs.find((job) => job.status === 'cancelled') ?? null
      const staleRunningJob =
        latestRunningJob?.lock_expires_at && latestRunningJob.lock_expires_at <= nowIso
          ? latestRunningJob
          : null
      const isLate =
        schedule.status === 'active' &&
        new Date(schedule.next_run_at).getTime() < fifteenMinutesAgo &&
        !latestQueuedJob &&
        !latestRunningJob

      return {
        ...schedule,
        observability: {
          queued: jobs.filter((job) => job.status === 'queued').length,
          running: jobs.filter((job) => job.status === 'running').length,
          failed: jobs.filter((job) => job.status === 'failed').length,
          cancelled: jobs.filter((job) => job.status === 'cancelled').length,
          lastJob: latestJob,
          latestFailedJob,
          latestQueuedJob,
          latestRunningJob,
          latestCancelledJob,
          alert:
            staleRunningJob !== null
              ? { type: 'stale_running', jobId: staleRunningJob.id }
              : isLate
                ? { type: 'schedule_late', nextRunAt: schedule.next_run_at }
                : latestFailedJob !== null
                  ? { type: 'job_failed', jobId: latestFailedJob.id }
                  : null,
        },
      }
    }),
  }
}

async function loadScheduleObservability(input: {
  supabase: unknown
  schedules: Array<{
    schedule_key: BusinessScheduleKey
    status: BusinessScheduleStatus
    next_run_at: string
  }>
  userId: string
  now: Date
}) {
  const client = input.supabase as {
    from(table: string): {
      select(columns: string): {
        eq(
          field: string,
          value: unknown
        ): {
          order(
            field: string,
            options?: { ascending?: boolean }
          ): {
            limit(count: number): Promise<{
              data: unknown[] | null
              error: { message: string } | null
            }>
          }
        }
      }
    }
  }
  const { data, error } = await client
    .from('autonomy_jobs')
    .select(
      'id, kind, status, attempt_count, next_run_at, locked_at, locked_by, lock_expires_at, runner_type, last_error, payload, created_at, updated_at'
    )
    .eq('user_id', input.userId)
    .order('created_at', { ascending: false })
    .limit(200)

  if (error) throw new Error(error.message)

  return buildScheduleObservability({
    schedules: input.schedules,
    jobs: ((data ?? []) as ScheduleJobRow[]).filter((job) => getScheduleKeyFromJob(job) !== null),
    now: input.now,
  })
}

export async function GET() {
  const cookieStore = await cookies()
  const { user, supabase, response } = await requireAllowedUser(cookieStore)
  if (response) return response

  const now = new Date()
  const schedules = await ensureBusinessSchedulesForUser({
    supabase: supabase as unknown as BusinessScheduleSupabase,
    userId: user!.id,
    now,
  })
  const sortedSchedules = sortSchedules(schedules)
  const observability = await loadScheduleObservability({
    supabase,
    schedules: sortedSchedules,
    userId: user!.id,
    now,
  })

  return NextResponse.json({
    ok: true,
    schedules: observability.schedules,
    workerBacklog: observability.workerBacklog,
  })
}

export async function PATCH(request: Request) {
  const cookieStore = await cookies()
  const { user, supabase, response } = await requireAllowedUser(cookieStore)
  if (response) return response

  const parsed = schedulePatchSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Payload schedule invalide' }, { status: 400 })
  }

  await ensureBusinessSchedulesForUser({
    supabase: supabase as unknown as BusinessScheduleSupabase,
    userId: user!.id,
    now: new Date(),
  })

  if (
    parsed.data.status !== undefined ||
    parsed.data.intervalMinutes !== undefined ||
    parsed.data.runNow !== true ||
    parsed.data.nextRunAt !== undefined
  ) {
    await updateBusinessSchedule({
      supabase: supabase as unknown as BusinessScheduleSupabase,
      userId: user!.id,
      scheduleKey: parsed.data.scheduleKey,
      now: new Date(),
      status: parsed.data.status as BusinessScheduleStatus | undefined,
      intervalMinutes: parsed.data.intervalMinutes,
      nextRunAt:
        parsed.data.nextRunAt ?? (parsed.data.runNow ? new Date().toISOString() : undefined),
    })
  }

  if (parsed.data.runNow) {
    await runBusinessScheduler({
      supabase: supabase as unknown as BusinessScheduleSupabase,
      now: new Date(),
      limit: 4,
      userId: user!.id,
      scheduleKeys: [parsed.data.scheduleKey as BusinessScheduleKey],
    })
  }

  const now = new Date()
  const schedules = await ensureBusinessSchedulesForUser({
    supabase: supabase as unknown as BusinessScheduleSupabase,
    userId: user!.id,
    now,
  })
  const sortedSchedules = sortSchedules(schedules)
  const observability = await loadScheduleObservability({
    supabase,
    schedules: sortedSchedules,
    userId: user!.id,
    now,
  })

  return NextResponse.json({
    ok: true,
    schedules: observability.schedules,
    workerBacklog: observability.workerBacklog,
  })
}
