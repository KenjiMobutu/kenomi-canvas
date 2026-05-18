export interface AgentScheduleLike {
  id: string
  agent_id: string
  enabled: boolean
  next_run_at: string
  interval_minutes?: number
  requires_human_approval: boolean
}

export interface DueAgentRun {
  scheduleId: string
  agentId: string
  blockedByApproval: boolean
}

export function selectDueAgentRuns(
  schedules: AgentScheduleLike[],
  now = new Date()
): DueAgentRun[] {
  return schedules
    .filter((s) => s.enabled)
    .filter((s) => new Date(s.next_run_at).getTime() <= now.getTime())
    .map((s) => ({
      scheduleId: s.id,
      agentId: s.agent_id,
      blockedByApproval: s.requires_human_approval,
    }))
}

export function computeNextRunAt(now: Date, intervalMinutes: number): string {
  return new Date(now.getTime() + intervalMinutes * 60_000).toISOString()
}

export function partitionDueRuns(runs: DueAgentRun[]): {
  executable: DueAgentRun[]
  blocked: DueAgentRun[]
} {
  return {
    executable: runs.filter((run) => !run.blockedByApproval),
    blocked: runs.filter((run) => run.blockedByApproval),
  }
}

export interface ExecuteDueAgentRunsInput {
  runs: DueAgentRun[]
  schedules: AgentScheduleLike[]
  now: Date
  runAgent: (run: DueAgentRun) => Promise<{ agentRunId: string | null }>
  updateSchedule: (scheduleId: string, nextRunAt: string, nowIso: string) => Promise<string | null>
}

export interface ExecuteDueAgentRunsResult {
  executed: Array<{ scheduleId: string; agentId: string; agentRunId: string | null }>
  execution_errors: Array<{ scheduleId: string; agentId: string; message: string }>
  update_errors: Array<{ scheduleId: string; agentId: string; message: string }>
}

export async function executeDueAgentRuns(
  input: ExecuteDueAgentRunsInput
): Promise<ExecuteDueAgentRunsResult> {
  const executed: ExecuteDueAgentRunsResult['executed'] = []
  const execution_errors: ExecuteDueAgentRunsResult['execution_errors'] = []
  const update_errors: ExecuteDueAgentRunsResult['update_errors'] = []
  const nowIso = input.now.toISOString()

  for (const run of input.runs) {
    try {
      const result = await input.runAgent(run)
      executed.push({
        scheduleId: run.scheduleId,
        agentId: run.agentId,
        agentRunId: result.agentRunId,
      })

      const schedule = input.schedules.find((item) => item.id === run.scheduleId)
      const nextRunAt = computeNextRunAt(input.now, schedule?.interval_minutes ?? 1440)
      const updateError = await input.updateSchedule(run.scheduleId, nextRunAt, nowIso)
      if (updateError) {
        update_errors.push({
          scheduleId: run.scheduleId,
          agentId: run.agentId,
          message: updateError,
        })
      }
    } catch (error) {
      execution_errors.push({
        scheduleId: run.scheduleId,
        agentId: run.agentId,
        message: error instanceof Error ? error.message : String(error),
      })
    }
  }

  return { executed, execution_errors, update_errors }
}
