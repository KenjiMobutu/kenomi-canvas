export type AutonomyJobStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled'

export interface AutonomyJobRow {
  id: string
  user_id: string
  venture_id: string | null
  kind: string
  status: AutonomyJobStatus
  locked_at: string | null
  locked_by: string | null
  lock_expires_at: string | null
  runner_type: string | null
  attempt_count: number
  next_run_at: string
  payload: Record<string, unknown>
  last_error: string | null
  created_at: string
  updated_at: string
}

export interface AutonomyJobPayload {
  agentId?: string
  prompt?: string
  ventureId?: string | null
  input?: Record<string, unknown>
  [key: string]: unknown
}

interface QueryResult<T> {
  data: T | null
  error: { message: string } | null
}

interface AutonomyJobQuery {
  select(columns?: string): AutonomyJobQuery
  update(patch: Partial<AutonomyJobRow>): AutonomyJobQuery
  eq(field: string, value: unknown): AutonomyJobQuery
  in?(field: string, values: unknown[]): AutonomyJobQuery
  lte(field: string, value: string): AutonomyJobQuery
  order(field: string, options?: { ascending?: boolean }): AutonomyJobQuery
  limit(count: number): AutonomyJobQuery
  maybeSingle(): Promise<QueryResult<AutonomyJobRow>>
}

export interface AutonomyJobSupabase {
  from(table: 'autonomy_jobs'): AutonomyJobQuery
}

export interface AutonomyJobRunnerSupabase extends AutonomyJobSupabase {
  from(table: string): AutonomyJobQuery
}

export interface ProcessQueuedAutonomyJobsInput {
  supabase: AutonomyJobRunnerSupabase
  now?: Date
  limit?: number
  workerId: string
  allowedJobKinds: string[]
  runAgentStep?: (input: {
    supabase: unknown
    userId: string
    agentId: string
    ventureId?: string
    prompt?: string
    structuredInput?: Record<string, unknown>
  }) => Promise<{
    ok: true
    content: string
    durationMs: number
    model: string
    agentRunId: string | null
    parsedOutput: unknown
  }>
  runFollowUpScan?: (input: {
    supabase: unknown
    userId: string
    nowIso: string
  }) => Promise<{ processed: number }>
  runHermesOperatorTick?: (input: {
    supabase: unknown
    userId: string
    mode?: string
    payload?: Record<string, unknown>
    now?: Date
  }) => Promise<{
    runId: string
    mode: string
    status: 'completed' | 'failed'
    summary: string
    model: string
    recommendationsCount: number
    alertsCount: number
    fallbackTriggered: boolean
  }>
  onJobCompleted?: (input: {
    supabase: AutonomyJobRunnerSupabase
    job: AutonomyJobRow
    now: Date
  }) => Promise<void>
}

export interface ProcessedAutonomyJob {
  job: AutonomyJobRow
  result: unknown
}

interface WorkerClaimInput {
  now?: Date
  workerId: string
  allowedJobKinds: string[]
  leaseMs?: number
}

const DEFAULT_LEASE_MS = 5 * 60_000

function throwIfError<T>(result: QueryResult<T>): T | null {
  if (result.error) throw new Error(result.error.message)
  return result.data
}

async function getJobById(
  supabase: AutonomyJobSupabase,
  jobId: string
): Promise<AutonomyJobRow | null> {
  const result = await supabase.from('autonomy_jobs').select('*').eq('id', jobId).maybeSingle()

  return throwIfError(result)
}

async function patchJob(
  supabase: AutonomyJobSupabase,
  jobId: string,
  patch: Partial<AutonomyJobRow>,
  expectedStatus?: AutonomyJobStatus
): Promise<AutonomyJobRow | null> {
  let query = supabase.from('autonomy_jobs').update(patch).eq('id', jobId)

  if (expectedStatus) query = query.eq('status', expectedStatus)

  const result = await query.select('*').maybeSingle()

  return throwIfError(result)
}

export async function claimNextJob(
  supabase: AutonomyJobSupabase,
  userId: string,
  now = new Date()
): Promise<AutonomyJobRow | null> {
  const nowIso = now.toISOString()
  const result = await supabase
    .from('autonomy_jobs')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'queued')
    .lte('next_run_at', nowIso)
    .order('next_run_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  const job = throwIfError(result)
  if (!job) return null

  return patchJob(
    supabase,
    job.id,
    {
      status: 'running',
      locked_at: nowIso,
      attempt_count: job.attempt_count + 1,
      updated_at: nowIso,
    },
    'queued'
  )
}

export async function claimNextQueuedJob(
  supabase: AutonomyJobRunnerSupabase,
  input: WorkerClaimInput
): Promise<AutonomyJobRow | null> {
  const now = input.now ?? new Date()
  const nowIso = now.toISOString()
  const lockExpiresAt = new Date(now.getTime() + (input.leaseMs ?? DEFAULT_LEASE_MS)).toISOString()
  const allowedKinds = input.allowedJobKinds.filter(Boolean)
  if (allowedKinds.length === 0) return null

  let query = supabase
    .from('autonomy_jobs')
    .select('*')
    .eq('status', 'queued')
    .lte('next_run_at', nowIso)
    .order('next_run_at', { ascending: true })
    .limit(1)

  if (allowedKinds.length === 1) {
    query = query.eq('kind', allowedKinds[0])
  } else if (typeof query.in === 'function') {
    query = query.in('kind', allowedKinds)
  }

  const job = throwIfError(await query.maybeSingle())

  if (!job && allowedKinds.length > 1 && typeof query.in !== 'function') {
    for (const kind of allowedKinds) {
      const fallback = await supabase
        .from('autonomy_jobs')
        .select('*')
        .eq('status', 'queued')
        .eq('kind', kind)
        .lte('next_run_at', nowIso)
        .order('next_run_at', { ascending: true })
        .limit(1)
        .maybeSingle()
      const candidate = throwIfError(fallback)
      if (candidate) {
        return patchJob(
          supabase,
          candidate.id,
          {
            status: 'running',
            locked_at: nowIso,
            locked_by: input.workerId,
            lock_expires_at: lockExpiresAt,
            runner_type: 'internal_worker',
            attempt_count: candidate.attempt_count + 1,
            updated_at: nowIso,
          },
          'queued'
        )
      }
    }
    return null
  }

  if (!job) return null

  return patchJob(
    supabase,
    job.id,
    {
      status: 'running',
      locked_at: nowIso,
      locked_by: input.workerId,
      lock_expires_at: lockExpiresAt,
      runner_type: 'internal_worker',
      attempt_count: job.attempt_count + 1,
      updated_at: nowIso,
    },
    'queued'
  )
}

export async function recoverStaleRunningJob(
  supabase: AutonomyJobRunnerSupabase,
  input: { now?: Date; allowedJobKinds: string[] }
): Promise<AutonomyJobRow | null> {
  const now = input.now ?? new Date()
  const nowIso = now.toISOString()
  const allowedKinds = input.allowedJobKinds.filter(Boolean)
  if (allowedKinds.length === 0) return null

  const tryRecover = async (kind?: string) => {
    let query = supabase
      .from('autonomy_jobs')
      .select('*')
      .eq('status', 'running')
      .lte('lock_expires_at', nowIso)
      .order('lock_expires_at', { ascending: true })
      .limit(1)

    if (kind) query = query.eq('kind', kind)
    const candidate = throwIfError(await query.maybeSingle())
    if (!candidate) return null

    return patchJob(supabase, candidate.id, {
      status: 'queued',
      locked_at: null,
      locked_by: null,
      lock_expires_at: null,
      last_error: [candidate.last_error, `stale_lock_recovered:${nowIso}`].filter(Boolean).join(' | '),
      updated_at: nowIso,
    })
  }

  if (allowedKinds.length === 1 || typeof supabase.from('autonomy_jobs').in !== 'function') {
    for (const kind of allowedKinds) {
      const recovered = await tryRecover(kind)
      if (recovered) return recovered
    }
    return null
  }

  let query = supabase
    .from('autonomy_jobs')
    .select('*')
    .eq('status', 'running')
    .lte('lock_expires_at', nowIso)
    .order('lock_expires_at', { ascending: true })
    .limit(1)
  query = query.in?.('kind', allowedKinds) ?? query
  const candidate = throwIfError(await query.maybeSingle())
  if (!candidate) return null
  return patchJob(supabase, candidate.id, {
    status: 'queued',
    locked_at: null,
    locked_by: null,
    lock_expires_at: null,
    last_error: [candidate.last_error, `stale_lock_recovered:${nowIso}`].filter(Boolean).join(' | '),
    updated_at: nowIso,
  })
}

export async function completeJob(
  supabase: AutonomyJobSupabase,
  jobId: string,
  output: Record<string, unknown>,
  now = new Date()
): Promise<AutonomyJobRow | null> {
  const job = await getJobById(supabase, jobId)
  if (!job) return null

  return patchJob(supabase, jobId, {
    status: 'completed',
    locked_at: null,
    locked_by: null,
    lock_expires_at: null,
    payload: { ...job.payload, output },
    last_error: null,
    updated_at: now.toISOString(),
  })
}

export async function failJob(
  supabase: AutonomyJobSupabase,
  jobId: string,
  message: string,
  now = new Date()
): Promise<AutonomyJobRow | null> {
  return patchJob(supabase, jobId, {
    status: 'failed',
    locked_at: null,
    locked_by: null,
    lock_expires_at: null,
    last_error: message,
    updated_at: now.toISOString(),
  })
}

export async function rescheduleJob(
  supabase: AutonomyJobSupabase,
  jobId: string,
  nextRunAt: string,
  now = new Date()
): Promise<AutonomyJobRow | null> {
  return patchJob(supabase, jobId, {
    status: 'queued',
    locked_at: null,
    locked_by: null,
    lock_expires_at: null,
    next_run_at: nextRunAt,
    updated_at: now.toISOString(),
  })
}

async function getQueuedJobRunnerInput(job: AutonomyJobRow): Promise<{
  agentId: string
  prompt: string
  ventureId?: string
  structuredInput?: Record<string, unknown>
}> {
  const payload = job.payload as AutonomyJobPayload
  const agentId = typeof payload.agentId === 'string' ? payload.agentId.trim() : ''
  if (!agentId) throw new Error('Job autonomy sans agentId')

  const prompt = typeof payload.prompt === 'string' ? payload.prompt.trim() : ''
  if (!prompt) throw new Error('Job autonomie sans prompt')

  return {
    agentId,
    prompt,
    ventureId: typeof payload.ventureId === 'string' ? payload.ventureId : undefined,
    structuredInput:
      payload.input && typeof payload.input === 'object' ? (payload.input as Record<string, unknown>) : undefined,
  }
}

function getScheduleKey(job: AutonomyJobRow): string | null {
  const payload = job.payload as AutonomyJobPayload
  return typeof payload.scheduleKey === 'string' ? payload.scheduleKey : null
}

export async function processQueuedAutonomyJobs(
  input: ProcessQueuedAutonomyJobsInput
): Promise<ProcessedAutonomyJob[]> {
  const processed: ProcessedAutonomyJob[] = []
  const now = input.now ?? new Date()
  const max = Math.max(1, input.limit ?? 1)
  const runAgentStep = input.runAgentStep
  const nowIso = now.toISOString()

  for (let i = 0; i < max; i++) {
    await recoverStaleRunningJob(input.supabase, {
      now,
      allowedJobKinds: input.allowedJobKinds,
    })

    const job = await claimNextQueuedJob(input.supabase, {
      now,
      workerId: input.workerId,
      allowedJobKinds: input.allowedJobKinds,
    })
    if (!job) break

    try {
      let output: Record<string, unknown>
      let result: unknown

      if (job.kind === 'follow_up_scan') {
        const followUpResult = await (input.runFollowUpScan ??
          (async () => {
            throw new Error('runFollowUpScan manquant')
          }))({
          supabase: input.supabase,
          userId: job.user_id,
          nowIso,
        })
        output = {
          processed: followUpResult.processed,
          scheduleKey: getScheduleKey(job),
        }
        result = followUpResult
      } else if (job.kind === 'hermes_operator_tick') {
        const hermesResult = await (input.runHermesOperatorTick ??
          (async () => {
            throw new Error('runHermesOperatorTick manquant')
          }))({
          supabase: input.supabase,
          userId: job.user_id,
          mode: typeof job.payload?.mode === 'string' ? job.payload.mode : undefined,
          payload: job.payload,
          now,
        })
        output = {
          runId: hermesResult.runId,
          mode: hermesResult.mode,
          status: hermesResult.status,
          summary: hermesResult.summary,
          model: hermesResult.model,
          recommendationsCount: hermesResult.recommendationsCount,
          alertsCount: hermesResult.alertsCount,
          fallbackTriggered: hermesResult.fallbackTriggered,
          scheduleKey: getScheduleKey(job),
        }
        result = hermesResult
      } else {
        const runnerInput = await getQueuedJobRunnerInput(job)
        const agentResult = await (runAgentStep ??
          (async () => {
            throw new Error('runAgentStep manquant')
          }))({
          supabase: input.supabase,
          userId: job.user_id,
          agentId: runnerInput.agentId,
          ventureId: runnerInput.ventureId,
          prompt: runnerInput.prompt,
          structuredInput: runnerInput.structuredInput,
        })
        output = {
          agentRunId: agentResult.agentRunId,
          content: agentResult.content,
          durationMs: agentResult.durationMs,
          model: agentResult.model,
          parsedOutput: agentResult.parsedOutput,
        }
        result = agentResult
      }

      const completed = await completeJob(input.supabase, job.id, output, now)

      if (!completed) {
        throw new Error('Impossible de finaliser le job autonomie')
      }

      await input.onJobCompleted?.({
        supabase: input.supabase,
        job: completed,
        now,
      })

      processed.push({ job: completed, result })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      const failed = await failJob(input.supabase, job.id, message, now)
      if (!failed) throw new Error('Impossible de marquer le job comme failed')
      processed.push({ job: failed, result: { error: message } })
    }
  }

  return processed
}
