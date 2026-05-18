export interface AgentScheduleLike {
  id: string
  agent_id: string
  enabled: boolean
  next_run_at: string
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
