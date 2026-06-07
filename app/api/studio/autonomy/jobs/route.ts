import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { z } from 'zod'
import {
  ApprovalExecutionError,
  resolveHumanApproval,
  type ApprovalExecutorSupabase,
} from '@/lib/autonomy/approval-executor'
import {
  cancelAutonomyJob,
  deleteApprovalGate,
  retryAutonomyJob,
  type OperatorSupabase,
} from '@/lib/autonomy/operator-actions'
import { requireAllowedUser } from '@/lib/auth-server'

const approvalResolutionSchema = z.object({
  approvalId: z.string().min(1),
  decision: z.enum(['approved', 'rejected']),
})

const approvalBatchResolutionSchema = z.object({
  approvalIds: z.array(z.string().min(1)).min(1).max(20),
  decision: z.enum(['approved', 'rejected']),
})

const operatorActionSchema = z.object({
  type: z.enum(['retry_job', 'cancel_job']),
  jobId: z.string().min(1),
})

const approvalDeleteSchema = z.object({
  approvalId: z.string().min(1),
})

export async function GET(request: NextRequest) {
  const cookieStore = await cookies()
  const { user, supabase, response } = await requireAllowedUser(cookieStore)
  if (response) return response

  const agentIdFilter = request.nextUrl.searchParams.get('agent_id')

  const [jobs, actions, approvals] = await Promise.all([
    supabase
      .from('autonomy_jobs')
      .select(
        'id, venture_id, kind, status, attempt_count, next_run_at, locked_at, locked_by, lock_expires_at, runner_type, last_error, payload, created_at, updated_at'
      )
      .eq('user_id', user!.id)
      .order('created_at', { ascending: false })
      .limit(50),
    supabase
      .from('autonomy_actions')
      .select(
        'id, job_id, venture_id, action_type, risk_level, status, input, output, created_at, updated_at'
      )
      .eq('user_id', user!.id)
      .order('created_at', { ascending: false })
      .limit(50),
    supabase
      .from('human_approvals')
      .select('id, action_id, status, approved_by, approved_at, reason, created_at, updated_at')
      .eq('user_id', user!.id)
      .order('created_at', { ascending: false })
      .limit(50),
  ])

  const errors = [
    jobs.error && { section: 'jobs', message: jobs.error.message },
    actions.error && { section: 'actions', message: actions.error.message },
    approvals.error && { section: 'approvals', message: approvals.error.message },
  ].filter(Boolean)

  const filteredJobs = agentIdFilter
    ? (jobs.data ?? []).filter((job) => {
        const payload = job && typeof job === 'object' ? (job as Record<string, unknown>).payload : null
        const payloadAgentId =
          payload && typeof payload === 'object'
            ? (payload as Record<string, unknown>).agentId ?? (payload as Record<string, unknown>).agent_id
            : null
        return payloadAgentId === agentIdFilter
      })
    : jobs.data ?? []

  return NextResponse.json(
    {
      ok: errors.length === 0,
      jobs: filteredJobs,
      actions: actions.data ?? [],
      approvals: approvals.data ?? [],
      errors,
      agentIdFilter,
    },
    { status: errors.length === 0 ? 200 : 207 }
  )
}

export async function PATCH(request: Request) {
  const cookieStore = await cookies()
  const { user, supabase, response } = await requireAllowedUser(cookieStore)
  if (response) return response

  const body = await request.json().catch(() => null)
  const parsedSingle = approvalResolutionSchema.safeParse(body)
  const parsedBatch = parsedSingle.success ? null : approvalBatchResolutionSchema.safeParse(body)
  if (!parsedSingle.success && !parsedBatch?.success) {
    return NextResponse.json({ error: 'Payload approval invalide' }, { status: 400 })
  }

  try {
    if (parsedSingle.success) {
      const result = await resolveHumanApproval({
        supabase: supabase as unknown as ApprovalExecutorSupabase,
        userId: user!.id,
        approvalId: parsedSingle.data.approvalId,
        decision: parsedSingle.data.decision,
      })

      return NextResponse.json({ ok: true, result })
    }

    if (!parsedBatch || !parsedBatch.success) {
      return NextResponse.json({ error: 'Payload approval invalide' }, { status: 400 })
    }

    const { data: batchData } = parsedBatch

    const results = [] as Array<
      | { ok: true; approvalId: string; result: Awaited<ReturnType<typeof resolveHumanApproval>> }
      | { ok: false; approvalId: string; error: string; status: number }
    >

    for (const approvalId of batchData.approvalIds) {
      try {
        const result = await resolveHumanApproval({
          supabase: supabase as unknown as ApprovalExecutorSupabase,
          userId: user!.id,
          approvalId,
          decision: batchData.decision,
        })
        results.push({ ok: true, approvalId, result })
      } catch (error) {
        if (error instanceof ApprovalExecutionError) {
          results.push({
            ok: false,
            approvalId,
            error: error.message,
            status: error.status,
          })
          continue
        }
        throw error
      }
    }

    const failedCount = results.filter((row) => !row.ok).length
    return NextResponse.json(
      {
        ok: failedCount === 0,
        processed: results.length,
        succeeded: results.length - failedCount,
        failed: failedCount,
        results,
      },
      { status: failedCount === 0 ? 200 : 207 }
    )
  } catch (error) {
    if (error instanceof ApprovalExecutionError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    return NextResponse.json({ error: 'Erreur approval autonomy' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const cookieStore = await cookies()
  const { user, supabase, response } = await requireAllowedUser(cookieStore)
  if (response) return response

  const parsed = operatorActionSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Payload action autonomy invalide' }, { status: 400 })
  }

  const result =
    parsed.data.type === 'retry_job'
      ? await retryAutonomyJob({
          supabase: supabase as unknown as OperatorSupabase,
          userId: user!.id,
          jobId: parsed.data.jobId,
        })
      : await cancelAutonomyJob({
          supabase: supabase as unknown as OperatorSupabase,
          userId: user!.id,
          jobId: parsed.data.jobId,
        })

  const status = result.ok
    ? 200
    : result.code === 'not_found'
      ? 404
      : result.code === 'invalid_status'
        ? 409
        : 500

  return NextResponse.json(result, { status })
}

export async function DELETE(request: Request) {
  const cookieStore = await cookies()
  const { user, supabase, response } = await requireAllowedUser(cookieStore)
  if (response) return response

  const parsed = approvalDeleteSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Payload suppression gate invalide' }, { status: 400 })
  }

  const result = await deleteApprovalGate({
    supabase: supabase as unknown as OperatorSupabase,
    userId: user!.id,
    approvalId: parsed.data.approvalId,
  })

  const status = result.ok ? 200 : result.code === 'not_found' ? 404 : 500
  return NextResponse.json(result, { status })
}
