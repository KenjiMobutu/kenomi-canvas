type OperatorJobStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled'

interface OperatorJobRow {
  id: string
  user_id: string
  status: OperatorJobStatus | string
  attempt_count?: number | null
  locked_at?: string | null
  locked_by?: string | null
  lock_expires_at?: string | null
  next_run_at?: string | null
  last_error?: string | null
  updated_at?: string | null
}

interface OperatorApprovalRow {
  id: string
  user_id: string
  action_id: string
  status: string
  updated_at?: string | null
}

interface QueryResponse<T = unknown> {
  data: T | null
  error: { message: string } | null
}

interface OperatorQueryBuilder {
  select(columns?: string): OperatorQueryBuilder
  update(row: Record<string, unknown>): OperatorQueryBuilder
  delete(): OperatorQueryBuilder
  eq(field: string, value: unknown): OperatorQueryBuilder
  maybeSingle<T = unknown>(): Promise<QueryResponse<T>>
}

export interface OperatorSupabase {
  from(table: 'autonomy_jobs' | 'human_approvals'): OperatorQueryBuilder
}

export type OperatorActionCode =
  | 'retried'
  | 'cancelled'
  | 'approval_deleted'
  | 'not_found'
  | 'invalid_status'
  | 'failed'

export interface OperatorActionResult {
  ok: boolean
  code: OperatorActionCode
  message: string
  job?: OperatorJobRow | null
}

type OperatorFailure = {
  ok: false
  code: Exclude<OperatorActionCode, 'retried' | 'cancelled'>
  message: string
  job?: OperatorJobRow | null
}

type OperatorJobLookup = OperatorFailure | { ok: true; job: OperatorJobRow }

async function getJob(input: {
  supabase: OperatorSupabase
  userId: string
  jobId: string
}): Promise<OperatorJobLookup> {
  const { data, error } = await input.supabase
    .from('autonomy_jobs')
    .select('*')
    .eq('id', input.jobId)
    .eq('user_id', input.userId)
    .maybeSingle<OperatorJobRow>()

  if (error) return { ok: false, code: 'failed', message: error.message }
  if (!data) return { ok: false, code: 'not_found', message: 'Job introuvable.' }
  return { ok: true, job: data }
}

async function patchJob(input: {
  supabase: OperatorSupabase
  userId: string
  jobId: string
  patch: Record<string, unknown>
}): Promise<OperatorJobLookup> {
  const { data, error } = await input.supabase
    .from('autonomy_jobs')
    .update(input.patch)
    .eq('id', input.jobId)
    .eq('user_id', input.userId)
    .select('*')
    .maybeSingle<OperatorJobRow>()

  if (error) return { ok: false, code: 'failed', message: error.message }
  if (!data) return { ok: false, code: 'not_found', message: 'Job introuvable.' }
  return { ok: true, job: data }
}

export async function retryAutonomyJob(input: {
  supabase: OperatorSupabase
  userId: string
  jobId: string
  now?: Date
}): Promise<OperatorActionResult> {
  const current = await getJob(input)
  if (!current.ok) return current
  const job = current.job

  if (job.status !== 'failed' && job.status !== 'cancelled') {
    return {
      ok: false,
      code: 'invalid_status',
      message: `Impossible de retry un job ${job.status}.`,
      job,
    }
  }

  const nowIso = (input.now ?? new Date()).toISOString()
  const updated = await patchJob({
    ...input,
    patch: {
      status: 'queued',
      locked_at: null,
      locked_by: null,
      lock_expires_at: null,
      last_error: null,
      next_run_at: nowIso,
      updated_at: nowIso,
    },
  })

  if (!updated.ok) return updated
  return {
    ok: true,
    code: 'retried',
    message: 'Job remis en file.',
    job: updated.job,
  }
}

export async function cancelAutonomyJob(input: {
  supabase: OperatorSupabase
  userId: string
  jobId: string
  now?: Date
}): Promise<OperatorActionResult> {
  const current = await getJob(input)
  if (!current.ok) return current
  const job = current.job

  if (job.status !== 'queued') {
    return {
      ok: false,
      code: 'invalid_status',
      message: `Impossible de cancel un job ${job.status}.`,
      job,
    }
  }

  const nowIso = (input.now ?? new Date()).toISOString()
  const updated = await patchJob({
    ...input,
    patch: {
      status: 'cancelled',
      locked_at: null,
      locked_by: null,
      lock_expires_at: null,
      updated_at: nowIso,
    },
  })

  if (!updated.ok) return updated
  return {
    ok: true,
    code: 'cancelled',
    message: 'Job annule.',
    job: updated.job,
  }
}

export async function deleteApprovalGate(input: {
  supabase: OperatorSupabase
  userId: string
  approvalId: string
}): Promise<OperatorActionResult> {
  const { data: approval, error: lookupError } = await input.supabase
    .from('human_approvals')
    .select('*')
    .eq('id', input.approvalId)
    .eq('user_id', input.userId)
    .maybeSingle<OperatorApprovalRow>()

  if (lookupError) return { ok: false, code: 'failed', message: lookupError.message }
  if (!approval) return { ok: false, code: 'not_found', message: 'Gate introuvable.' }

  const { error: deleteError } = await input.supabase
    .from('human_approvals')
    .delete()
    .eq('id', input.approvalId)
    .eq('user_id', input.userId)
    .maybeSingle<OperatorApprovalRow>()

  if (deleteError) return { ok: false, code: 'failed', message: deleteError.message }

  return {
    ok: true,
    code: 'approval_deleted',
    message: 'Gate supprime.',
  }
}
