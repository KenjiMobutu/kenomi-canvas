import { getAutonomyConfig } from './config'
import {
  ensureAutonomyControlForUser,
  type AutonomyControlRow,
  type AutonomyControlSupabase,
} from './controls'

export type BusinessScheduleKey = 'scout' | 'prospect' | 'follow_ups' | 'devops' | 'hermes_operator'
export type BusinessScheduleStatus = 'active' | 'paused'

export interface BusinessScheduleRow {
  id: string
  user_id: string
  schedule_key: BusinessScheduleKey
  label: string
  status: BusinessScheduleStatus
  interval_minutes: number
  last_enqueued_at: string | null
  last_completed_at: string | null
  next_run_at: string
  payload: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

interface QueryResult<T> {
  data: T | null
  error: { message: string } | null
}

interface QueryBuilder<T = unknown> extends PromiseLike<QueryResult<T[]>> {
  select(columns?: string): QueryBuilder<T>
  eq(field: string, value: unknown): QueryBuilder<T>
  in?(field: string, values: unknown[]): QueryBuilder<T>
  lte(field: string, value: string): QueryBuilder<T>
  order(field: string, options?: { ascending?: boolean }): QueryBuilder<T>
  limit(count: number): QueryBuilder<T>
  insert(row: Record<string, unknown> | Record<string, unknown>[]): QueryBuilder<T>
  update(row: Record<string, unknown>): QueryBuilder<T>
  maybeSingle(): Promise<QueryResult<T>>
}

export interface BusinessScheduleSupabase {
  from(table: string): QueryBuilder<any>
}

export interface ScheduledEnqueueReportItem {
  userId: string
  scheduleKey: BusinessScheduleKey
  status: 'enqueued' | 'skipped'
  reason?: string
  jobId?: string | null
}

const SCHEDULE_DEFAULTS: Array<{
  key: BusinessScheduleKey
  label: string
  intervalMinutes: number
  payload: Record<string, unknown>
}> = [
  { key: 'scout', label: 'Scout Reddit', intervalMinutes: 360, payload: { agentId: 'scout' } },
  {
    key: 'prospect',
    label: 'Prospect Outbound',
    intervalMinutes: 480,
    payload: { agentId: 'prospect', focus: 'prospect' },
  },
  {
    key: 'follow_ups',
    label: 'Follow-up Scan',
    intervalMinutes: 30,
    payload: { mode: 'follow_ups' },
  },
  {
    key: 'devops',
    label: 'DevOps Diagnostics',
    intervalMinutes: 30,
    payload: { agentId: 'devops' },
  },
  {
    key: 'hermes_operator',
    label: 'Hermes Operator',
    intervalMinutes: 60,
    payload: { mode: 'observe' },
  },
]

function defaultPromptForSchedule(key: BusinessScheduleKey): string {
  switch (key) {
    case 'scout':
      return 'Collecte des signaux Reddit frais et alimente venture_pipeline avec des opportunites actionnables.'
    case 'prospect':
      return 'Genere un prospect outbound qualifie a partir des signaux existants et du CRM local.'
    case 'devops':
      return 'Synthétise les diagnostics infra réels et les incidents récents sans proposer d action automatique.'
    case 'hermes_operator':
      return ''
    default:
      return ''
  }
}

function addMinutes(now: Date, minutes: number): string {
  return new Date(now.getTime() + minutes * 60_000).toISOString()
}

function throwIfError<T>(result: QueryResult<T>): T | null {
  if (result.error) throw new Error(result.error.message)
  return result.data
}

async function selectRows<T>(query: QueryBuilder<any>): Promise<T[]> {
  const result = await query
  const data = throwIfError(result)
  return Array.isArray(data) ? data : []
}

async function selectSingle<T>(query: QueryBuilder<any>): Promise<T | null> {
  return throwIfError(await query.maybeSingle())
}

function compareScheduleOrder(a: BusinessScheduleRow, b: BusinessScheduleRow): number {
  const order = SCHEDULE_DEFAULTS.map((item) => item.key)
  return order.indexOf(a.schedule_key) - order.indexOf(b.schedule_key)
}

export async function ensureBusinessSchedulesForUser(input: {
  supabase: BusinessScheduleSupabase
  userId: string
  now?: Date
}): Promise<BusinessScheduleRow[]> {
  const now = input.now ?? new Date()
  const nowIso = now.toISOString()
  const existing = await selectRows<BusinessScheduleRow>(
    input.supabase
      .from('business_schedules')
      .select('*')
      .eq('user_id', input.userId)
      .order('created_at', { ascending: true })
  )

  const existingKeys = new Set(existing.map((row) => row.schedule_key))
  const missing = SCHEDULE_DEFAULTS.filter((item) => !existingKeys.has(item.key))

  if (missing.length > 0) {
    const { error } = await input.supabase.from('business_schedules').insert(
      missing.map((item) => ({
        user_id: input.userId,
        schedule_key: item.key,
        label: item.label,
        status: 'active',
        interval_minutes: item.intervalMinutes,
        last_enqueued_at: null,
        last_completed_at: null,
        next_run_at: nowIso,
        payload: item.payload,
        created_at: nowIso,
        updated_at: nowIso,
      }))
    )
    if (error) throw new Error(error.message)
  }

  const refreshed = await selectRows<BusinessScheduleRow>(
    input.supabase
      .from('business_schedules')
      .select('*')
      .eq('user_id', input.userId)
      .order('created_at', { ascending: true })
  )

  return refreshed.sort(compareScheduleOrder)
}

export async function updateBusinessSchedule(input: {
  supabase: BusinessScheduleSupabase
  userId: string
  scheduleKey: BusinessScheduleKey
  now?: Date
  status?: BusinessScheduleStatus
  intervalMinutes?: number
  nextRunAt?: string
}): Promise<BusinessScheduleRow | null> {
  const nowIso = (input.now ?? new Date()).toISOString()
  const patch: Record<string, unknown> = { updated_at: nowIso }
  if (input.status) patch.status = input.status
  if (typeof input.intervalMinutes === 'number') patch.interval_minutes = input.intervalMinutes
  if (typeof input.nextRunAt === 'string') patch.next_run_at = input.nextRunAt

  return selectSingle<BusinessScheduleRow>(
    input.supabase
      .from('business_schedules')
      .update(patch)
      .eq('user_id', input.userId)
      .eq('schedule_key', input.scheduleKey)
      .select('*')
  )
}

function buildScheduleJob(input: {
  schedule: BusinessScheduleRow
  nowIso: string
}): Record<string, unknown> {
  const payload = input.schedule.payload ?? {}

  if (input.schedule.schedule_key === 'follow_ups') {
    return {
      user_id: input.schedule.user_id,
      venture_id: null,
      kind: 'follow_up_scan',
      status: 'queued',
      attempt_count: 0,
      next_run_at: input.nowIso,
      payload: {
        ...payload,
        scheduleId: input.schedule.id,
        scheduleKey: input.schedule.schedule_key,
        scheduled: true,
      },
      created_at: input.nowIso,
      updated_at: input.nowIso,
    }
  }

  if (input.schedule.schedule_key === 'hermes_operator') {
    const hermesMode = typeof payload.mode === 'string' ? payload.mode : null

    return {
      user_id: input.schedule.user_id,
      venture_id: null,
      kind: 'hermes_operator_tick',
      status: 'queued',
      attempt_count: 0,
      next_run_at: input.nowIso,
      payload: {
        ...payload,
        ...(hermesMode ? { mode: hermesMode } : {}),
        scheduleId: input.schedule.id,
        scheduleKey: input.schedule.schedule_key,
        scheduled: true,
      },
      created_at: input.nowIso,
      updated_at: input.nowIso,
    }
  }

  const agentId =
    typeof payload.agentId === 'string' ? payload.agentId : input.schedule.schedule_key

  return {
    user_id: input.schedule.user_id,
    venture_id: null,
    kind: 'run_agent',
    status: 'queued',
    attempt_count: 0,
    next_run_at: input.nowIso,
    payload: {
      agentId,
      prompt: defaultPromptForSchedule(input.schedule.schedule_key),
      input: {
        ...payload,
        trigger: 'schedule',
        schedule_key: input.schedule.schedule_key,
      },
      scheduleId: input.schedule.id,
      scheduleKey: input.schedule.schedule_key,
      scheduled: true,
    },
    created_at: input.nowIso,
    updated_at: input.nowIso,
  }
}

async function enqueueSchedule(input: {
  supabase: BusinessScheduleSupabase
  schedule: BusinessScheduleRow
  now: Date
}): Promise<ScheduledEnqueueReportItem> {
  const nowIso = input.now.toISOString()
  const nextRunAt = addMinutes(input.now, input.schedule.interval_minutes)
  const job = await selectSingle<{ id?: string }>(
    input.supabase
      .from('autonomy_jobs')
      .insert(buildScheduleJob({ schedule: input.schedule, nowIso }))
      .select('id')
  )

  if (!job?.id) {
    throw new Error(`Impossible d'enqueue le schedule ${input.schedule.schedule_key}`)
  }

  const { error: scheduleError } = await input.supabase
    .from('business_schedules')
    .update({
      last_enqueued_at: nowIso,
      next_run_at: nextRunAt,
      updated_at: nowIso,
    })
    .eq('id', input.schedule.id)
    .eq('user_id', input.schedule.user_id)

  if (scheduleError) throw new Error(scheduleError.message)

  return {
    userId: input.schedule.user_id,
    scheduleKey: input.schedule.schedule_key,
    status: 'enqueued',
    jobId: job.id ?? null,
  }
}

export async function runBusinessScheduler(input: {
  supabase: BusinessScheduleSupabase
  now?: Date
  limit?: number
  userId?: string
  scheduleKeys?: BusinessScheduleKey[]
  autonomyEnabled?: boolean
}): Promise<ScheduledEnqueueReportItem[]> {
  const now = input.now ?? new Date()
  const nowIso = now.toISOString()
  const max = Math.max(1, input.limit ?? 10)

  let query = input.supabase
    .from('business_schedules')
    .select('*')
    .eq('status', 'active')
    .lte('next_run_at', nowIso)
    .order('next_run_at', { ascending: true })
    .limit(max)

  if (input.userId) {
    query = query.eq('user_id', input.userId)
  }
  if (input.scheduleKeys?.length) {
    if (input.scheduleKeys.length === 1) {
      query = query.eq('schedule_key', input.scheduleKeys[0])
    } else if (typeof query.in === 'function') {
      query = query.in('schedule_key', input.scheduleKeys)
    }
  }

  let dueSchedules = await selectRows<BusinessScheduleRow>(query)

  if (input.scheduleKeys && input.scheduleKeys.length > 1 && typeof query.in !== 'function') {
    dueSchedules = dueSchedules.filter((row) => input.scheduleKeys?.includes(row.schedule_key))
  }

  const report: ScheduledEnqueueReportItem[] = []
  const autonomyEnabled = input.autonomyEnabled ?? getAutonomyConfig().enabled
  const controlsByUser = new Map<string, AutonomyControlRow>()
  const enqueuedByUser = new Map<string, number>()

  for (const schedule of dueSchedules) {
    if (!autonomyEnabled) {
      report.push({
        userId: schedule.user_id,
        scheduleKey: schedule.schedule_key,
        status: 'skipped',
        reason: 'autonomy_env_disabled',
      })
      continue
    }

    let control = controlsByUser.get(schedule.user_id)
    if (!control) {
      control = await ensureAutonomyControlForUser({
        supabase: input.supabase as unknown as AutonomyControlSupabase,
        userId: schedule.user_id,
        now,
      })
      controlsByUser.set(schedule.user_id, control)
    }

    if (control.status === 'paused') {
      report.push({
        userId: schedule.user_id,
        scheduleKey: schedule.schedule_key,
        status: 'skipped',
        reason: 'autonomy_paused',
      })
      continue
    }

    const userEnqueued = enqueuedByUser.get(schedule.user_id) ?? 0
    if (userEnqueued >= control.max_scheduler_jobs_per_run) {
      report.push({
        userId: schedule.user_id,
        scheduleKey: schedule.schedule_key,
        status: 'skipped',
        reason: 'scheduler_limit_reached',
      })
      continue
    }

    report.push(await enqueueSchedule({ supabase: input.supabase, schedule, now }))
    enqueuedByUser.set(schedule.user_id, userEnqueued + 1)
  }
  return report
}

export async function markBusinessScheduleCompleted(input: {
  supabase: BusinessScheduleSupabase
  userId: string
  scheduleKey: BusinessScheduleKey
  now?: Date
}): Promise<void> {
  const nowIso = (input.now ?? new Date()).toISOString()
  const { error } = await input.supabase
    .from('business_schedules')
    .update({
      last_completed_at: nowIso,
      updated_at: nowIso,
    })
    .eq('user_id', input.userId)
    .eq('schedule_key', input.scheduleKey)
  if (error) throw new Error(error.message)
}
