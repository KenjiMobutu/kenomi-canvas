export type AgentCommandRefreshTrigger = 'initial-load' | 'manual-evaluate'

export interface AgentCommandRefreshPlan {
  loadAutonomyState: boolean
  runOrchestration: boolean
}

export function getAgentCommandRefreshPlan(
  trigger: AgentCommandRefreshTrigger
): AgentCommandRefreshPlan {
  return {
    loadAutonomyState: true,
    runOrchestration: trigger === 'manual-evaluate',
  }
}
