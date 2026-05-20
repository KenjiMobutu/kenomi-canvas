import {
  runAgentStep,
  RunAgentStepError,
  type RunAgentStepSupabase,
} from '../autonomy/run-agent-step'
import { buildRunResult } from '../automation-run-status'
import { isAllowedWebhookUrl } from '../security'

export type OpsActionExecutionType =
  | 'trigger_first_automation'
  | 'run_first_agent'
  | 'refresh_infrastructure'

export type OpsActionExecutionCode =
  | 'completed'
  | 'queued'
  | 'missing_workflow'
  | 'missing_agent'
  | 'blocked'
  | 'failed'

export interface OpsActionExecutionResult {
  ok: boolean
  code: OpsActionExecutionCode
  message: string
  repairHref: string
  auditId?: string
}

interface QueryResponse<T = unknown> {
  data: T | null
  error: { message: string } | null
}

interface QueryBuilder extends PromiseLike<QueryResponse> {
  select(columns?: string): QueryBuilder
  eq(field: string, value: unknown): QueryBuilder
  order(field: string, options?: { ascending?: boolean }): QueryBuilder
  limit(count: number): QueryBuilder
  insert(row: Record<string, unknown> | Record<string, unknown>[]): QueryBuilder
  update(row: Record<string, unknown>): QueryBuilder
  maybeSingle<T = unknown>(): Promise<QueryResponse<T>>
}

export interface ExecuteOpsActionSupabase {
  from(table: string): QueryBuilder
}

interface WorkflowRow {
  id: string
  webhook_url?: string | null
  run_count?: number | null
}

interface AgentScheduleRow {
  agent_id?: string | null
}

async function expectWrite(query: QueryBuilder): Promise<string | null> {
  const { error } = await query
  return error?.message ?? null
}

export async function executeOpsAction(input: {
  type: OpsActionExecutionType
  userId: string
  supabase: ExecuteOpsActionSupabase
  fetchImpl?: typeof fetch
  now?: () => Date
}): Promise<OpsActionExecutionResult> {
  if (input.type === 'trigger_first_automation') {
    return executeFirstAutomation(input)
  }

  if (input.type === 'run_first_agent') {
    return executeFirstAgent(input)
  }

  return {
    ok: true,
    code: 'queued',
    message: 'Ouvrez Infrastructure pour rafraichir les checks de service.',
    repairHref: '/studio/infrastructure',
  }
}

async function executeFirstAutomation(input: {
  userId: string
  supabase: ExecuteOpsActionSupabase
  fetchImpl?: typeof fetch
  now?: () => Date
}): Promise<OpsActionExecutionResult> {
  const workflow = await input.supabase
    .from('automation_workflows')
    .select('id, webhook_url, run_count')
    .eq('user_id', input.userId)
    .eq('enabled', true)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle<WorkflowRow>()

  if (workflow.error) {
    return {
      ok: false,
      code: 'failed',
      message: workflow.error.message,
      repairHref: '/studio/automations',
    }
  }

  if (!workflow.data?.id) {
    return {
      ok: false,
      code: 'missing_workflow',
      message: 'Aucun workflow actif disponible. Creez ou activez un workflow avant de lancer.',
      repairHref: '/studio/automations',
    }
  }

  const webhookUrl = workflow.data.webhook_url?.trim() || null
  if (webhookUrl && !isAllowedWebhookUrl(webhookUrl)) {
    return {
      ok: false,
      code: 'blocked',
      message: 'URL webhook non autorisee. Verifiez la configuration n8n.',
      repairHref: '/studio/automations',
    }
  }

  const startMs = (input.now ?? (() => new Date()))().getTime()
  let fetchError: Error | null = null
  let fetchStatus: number | null = null

  if (webhookUrl) {
    try {
      const response = await (input.fetchImpl ?? fetch)(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source: 'kenomi-studio',
          trigger: 'ops-action',
          timestamp: (input.now ?? (() => new Date()))().toISOString(),
        }),
        signal: AbortSignal.timeout(8000),
      })
      fetchStatus = response.status
    } catch (error) {
      fetchError = error as Error
    }
  }

  const { status, httpStatus, errorMessage } = buildRunResult({
    webhookUrl,
    fetchError,
    fetchStatus,
  })
  const durationMs = Math.max(0, (input.now ?? (() => new Date()))().getTime() - startMs)

  const insertError = await expectWrite(
    input.supabase.from('automation_runs').insert({
      user_id: input.userId,
      workflow_id: workflow.data.id,
      status,
      http_status: httpStatus,
      duration_ms: durationMs,
      error_message: errorMessage,
    })
  )

  if (insertError) {
    return {
      ok: false,
      code: 'failed',
      message: insertError,
      repairHref: '/studio/automations',
    }
  }

  await expectWrite(
    input.supabase
      .from('automation_workflows')
      .update({
        run_count: (workflow.data.run_count ?? 0) + 1,
        last_run_at: (input.now ?? (() => new Date()))().toISOString(),
      })
      .eq('id', workflow.data.id)
      .eq('user_id', input.userId)
  )

  if (status !== 'success') {
    return {
      ok: false,
      code: 'failed',
      message: errorMessage ?? 'Workflow execute avec erreur.',
      repairHref: '/studio/automations',
    }
  }

  return {
    ok: true,
    code: 'completed',
    message: 'Workflow declenche et run automation enregistre.',
    repairHref: '/studio/automations',
  }
}

async function executeFirstAgent(input: {
  userId: string
  supabase: ExecuteOpsActionSupabase
}): Promise<OpsActionExecutionResult> {
  const schedule = await input.supabase
    .from('agent_schedules')
    .select('agent_id')
    .eq('user_id', input.userId)
    .eq('enabled', true)
    .order('next_run_at', { ascending: true })
    .limit(1)
    .maybeSingle<AgentScheduleRow>()

  if (schedule.error) {
    return {
      ok: false,
      code: 'failed',
      message: schedule.error.message,
      repairHref: '/studio/agents',
    }
  }

  const agentId = schedule.data?.agent_id || 'scout'

  try {
    const result = await runAgentStep({
      supabase: input.supabase as unknown as RunAgentStepSupabase,
      userId: input.userId,
      agentId,
    })

    return {
      ok: true,
      code: 'completed',
      message: `${agentId} execute. Run ${result.agentRunId ?? 'enregistre'}.`,
      repairHref: '/studio/agents',
    }
  } catch (error) {
    if (error instanceof RunAgentStepError) {
      return {
        ok: false,
        code: error.status === 409 ? 'blocked' : 'failed',
        message: error.message,
        repairHref: '/studio/agents',
      }
    }

    return {
      ok: false,
      code: 'failed',
      message: 'Run agent echoue.',
      repairHref: '/studio/agents',
    }
  }
}
