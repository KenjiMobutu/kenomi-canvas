export type AutonomyControlStatus = 'active' | 'paused'

export interface AutonomyControlRow {
  user_id: string
  status: AutonomyControlStatus
  reason: string | null
  max_scheduler_jobs_per_run: number
  max_worker_jobs_per_drain: number
  paused_at: string | null
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
  insert(row: Record<string, unknown> | Record<string, unknown>[]): QueryBuilder<T>
  update(row: Record<string, unknown>): QueryBuilder<T>
  maybeSingle(): Promise<QueryResult<T>>
}

export interface AutonomyControlSupabase {
  from(table: string): QueryBuilder<any>
}

function throwIfError<T>(result: QueryResult<T>): T | null {
  if (result.error) throw new Error(result.error.message)
  return result.data
}

async function selectSingle<T>(query: QueryBuilder<any>): Promise<T | null> {
  return throwIfError(await query.maybeSingle())
}

export async function ensureAutonomyControlForUser(input: {
  supabase: AutonomyControlSupabase
  userId: string
  now?: Date
}): Promise<AutonomyControlRow> {
  const existing = await selectSingle<AutonomyControlRow>(
    input.supabase.from('autonomy_controls').select('*').eq('user_id', input.userId)
  )
  if (existing) return existing

  const nowIso = (input.now ?? new Date()).toISOString()
  const inserted = await selectSingle<AutonomyControlRow>(
    input.supabase
      .from('autonomy_controls')
      .insert({
        user_id: input.userId,
        status: 'active',
        reason: null,
        max_scheduler_jobs_per_run: 10,
        max_worker_jobs_per_drain: 10,
        paused_at: null,
        created_at: nowIso,
        updated_at: nowIso,
      })
      .select('*')
  )

  if (!inserted) throw new Error('Impossible de créer le contrôle autonomie')
  return inserted
}

export async function updateAutonomyControlForUser(input: {
  supabase: AutonomyControlSupabase
  userId: string
  now?: Date
  status?: AutonomyControlStatus
  reason?: string | null
  maxSchedulerJobsPerRun?: number
  maxWorkerJobsPerDrain?: number
}): Promise<AutonomyControlRow> {
  await ensureAutonomyControlForUser({
    supabase: input.supabase,
    userId: input.userId,
    now: input.now,
  })

  const nowIso = (input.now ?? new Date()).toISOString()
  const patch: Record<string, unknown> = { updated_at: nowIso }
  if (input.status) {
    patch.status = input.status
    patch.paused_at = input.status === 'paused' ? nowIso : null
  }
  if (input.reason !== undefined) patch.reason = input.reason
  if (input.maxSchedulerJobsPerRun !== undefined) {
    patch.max_scheduler_jobs_per_run = input.maxSchedulerJobsPerRun
  }
  if (input.maxWorkerJobsPerDrain !== undefined) {
    patch.max_worker_jobs_per_drain = input.maxWorkerJobsPerDrain
  }

  const updated = await selectSingle<AutonomyControlRow>(
    input.supabase.from('autonomy_controls').update(patch).eq('user_id', input.userId).select('*')
  )

  if (!updated) throw new Error('Impossible de mettre à jour le contrôle autonomie')
  return updated
}
