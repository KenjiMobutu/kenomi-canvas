export type AutonomyJobStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled'

export interface AutonomyJobRow {
  id: string
  user_id: string
  venture_id: string | null
  kind: string
  status: AutonomyJobStatus
  locked_at: string | null
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
  runAgentStep?: (input: {
    supabase: unknown
    userId: string
    agentId: string
    ventureId?: string
    prompt?: string
  }) => Promise<{
    ok: true
    content: string
    durationMs: number
    model: string
    agentRunId: string | null
    parsedOutput: unknown
  }>
}

export interface ProcessedAutonomyJob {
  job: AutonomyJobRow
  result: unknown
}

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
  now = new Date()
): Promise<AutonomyJobRow | null> {
  const nowIso = now.toISOString()
  const result = await supabase
    .from('autonomy_jobs')
    .select('*')
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
    next_run_at: nextRunAt,
    updated_at: now.toISOString(),
  })
}

async function getQueuedJobRunnerInput(job: AutonomyJobRow): Promise<{
  agentId: string
  prompt: string
  ventureId?: string
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
  }
}

export async function processQueuedAutonomyJobs(
  input: ProcessQueuedAutonomyJobsInput
): Promise<ProcessedAutonomyJob[]> {
  const processed: ProcessedAutonomyJob[] = []
  const now = input.now ?? new Date()
  const max = Math.max(1, input.limit ?? 1)
  const runAgentStep = input.runAgentStep

  for (let i = 0; i < max; i++) {
    const job = await claimNextQueuedJob(input.supabase, now)
    if (!job) break

    try {
      const runnerInput = await getQueuedJobRunnerInput(job)
      const result = await (runAgentStep ??
        (async () => {
          throw new Error('runAgentStep manquant')
        }))({
        supabase: input.supabase,
        userId: job.user_id,
        agentId: runnerInput.agentId,
        ventureId: runnerInput.ventureId,
        prompt: runnerInput.prompt,
      })

      const completed = await completeJob(
        input.supabase,
        job.id,
        {
          agentRunId: result.agentRunId,
          content: result.content,
          durationMs: result.durationMs,
          model: result.model,
          parsedOutput: result.parsedOutput,
        },
        now
      )

      if (!completed) {
        throw new Error('Impossible de finaliser le job autonomie')
      }

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
