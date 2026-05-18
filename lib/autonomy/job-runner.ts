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

function throwIfError<T>(result: QueryResult<T>): T | null {
  if (result.error) throw new Error(result.error.message)
  return result.data
}

async function getJobById(supabase: AutonomyJobSupabase, jobId: string): Promise<AutonomyJobRow | null> {
  const result = await supabase
    .from('autonomy_jobs')
    .select('*')
    .eq('id', jobId)
    .maybeSingle()

  return throwIfError(result)
}

async function patchJob(
  supabase: AutonomyJobSupabase,
  jobId: string,
  patch: Partial<AutonomyJobRow>,
  expectedStatus?: AutonomyJobStatus
): Promise<AutonomyJobRow | null> {
  let query = supabase
    .from('autonomy_jobs')
    .update(patch)
    .eq('id', jobId)

  if (expectedStatus) query = query.eq('status', expectedStatus)

  const result = await query
    .select('*')
    .maybeSingle()

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

  return patchJob(supabase, job.id, {
    status: 'running',
    locked_at: nowIso,
    attempt_count: job.attempt_count + 1,
    updated_at: nowIso,
  }, 'queued')
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
