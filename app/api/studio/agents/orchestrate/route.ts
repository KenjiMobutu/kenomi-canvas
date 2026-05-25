import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { requireAllowedUser } from '@/lib/auth-server'
import {
  executeDueAgentRuns,
  partitionDueRuns,
  selectDueAgentRuns,
} from '@/lib/agent-orchestration'
import { insertAuditEvent } from '@/lib/audit-log'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { runAgentStep, type RunAgentStepSupabase } from '@/lib/autonomy/run-agent-step'
import { getAutonomyConfig } from '@/lib/autonomy/config'

function isCronAuthorized(req: NextRequest): boolean {
  const secret = process.env.AGENT_ORCHESTRATOR_SECRET
  if (!secret) return false
  return req.headers.get('authorization') === `Bearer ${secret}`
}

export async function POST(req: NextRequest) {
  const cronAuthorized = isCronAuthorized(req)

  const context = cronAuthorized
    ? {
        user: { id: process.env.AGENT_ORCHESTRATOR_USER_ID ?? '' },
        supabase: supabaseAdmin,
        response: process.env.AGENT_ORCHESTRATOR_USER_ID
          ? null
          : NextResponse.json({ error: 'AGENT_ORCHESTRATOR_USER_ID requis' }, { status: 500 }),
      }
    : await requireAllowedUser(await cookies())

  const { user, supabase, response } = context
  if (response) return response

  const autonomyConfig = getAutonomyConfig()
  if (!autonomyConfig.enabled) {
    await insertAuditEvent(supabase, {
      user_id: user!.id,
      event_type: 'agent.orchestration.disabled',
      severity: 'warn',
      metadata: { config: autonomyConfig },
    })
    return NextResponse.json({
      ok: true,
      blocked: 'autonomy_disabled',
      config: autonomyConfig,
      due: [],
      executable: [],
      executed: [],
    })
  }

  const now = new Date()
  const { data, error } = await supabase
    .from('agent_schedules')
    .select('id, agent_id, enabled, next_run_at, interval_minutes, requires_human_approval')
    .eq('user_id', user!.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const schedules = (data ?? []).filter((schedule) => schedule.agent_id !== 'hermes')
  const due = selectDueAgentRuns(schedules, now)
  const partition = partitionDueRuns(due)
  const execution = await executeDueAgentRuns({
    runs: partition.executable,
    schedules,
    now,
    runAgent: async (run) => {
      try {
        const result = await runAgentStep({
          supabase: supabase as unknown as RunAgentStepSupabase,
          userId: user!.id,
          agentId: run.agentId,
        })

        await supabase.from('autonomy_actions').insert({
          user_id: user!.id,
          action_type: 'run_agent',
          risk_level: 'low',
          status: 'completed',
          input: { agent_id: run.agentId, schedule_id: run.scheduleId },
          output: { agent_run_id: result.agentRunId, model: result.model },
        })

        return { agentRunId: result.agentRunId }
      } catch (error) {
        await supabase.from('autonomy_actions').insert({
          user_id: user!.id,
          action_type: 'run_agent',
          risk_level: 'low',
          status: 'failed',
          input: { agent_id: run.agentId, schedule_id: run.scheduleId },
          output: { error: error instanceof Error ? error.message : String(error) },
        })
        throw error
      }
    },
    updateSchedule: async (scheduleId, nextRunAt, nowIso) => {
      const { error: updateError } = await supabase
        .from('agent_schedules')
        .update({
          last_run_at: nowIso,
          next_run_at: nextRunAt,
          updated_at: nowIso,
        })
        .eq('id', scheduleId)
        .eq('user_id', user!.id)

      return updateError?.message ?? null
    },
  })

  await insertAuditEvent(supabase, {
    user_id: user!.id,
    event_type: 'agent.orchestration.evaluated',
    metadata: {
      due_count: due.length,
      executable_count: partition.executable.length,
      blocked_count: partition.blocked.length,
      executed_count: execution.executed.length,
      execution_error_count: execution.execution_errors.length,
      update_error_count: execution.update_errors.length,
      cron_authorized: cronAuthorized,
    },
  })

  return NextResponse.json({
    ok: execution.execution_errors.length === 0 && execution.update_errors.length === 0,
    due,
    executable: partition.executable,
    blocked: partition.blocked,
    executed: execution.executed,
    execution_errors: execution.execution_errors,
    update_errors: execution.update_errors,
  })
}
