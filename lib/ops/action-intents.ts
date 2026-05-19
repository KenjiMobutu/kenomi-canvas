export type OpsActionRisk = 'low' | 'medium' | 'high'

export interface OpsActionIntent {
  id: string
  method: 'GET' | 'POST'
  endpoint: string
  payload: Record<string, unknown> | null
  requiresConfirmation: boolean
  risk: OpsActionRisk
}

export function buildOpsActionIntent(actionId: string): OpsActionIntent {
  if (actionId === 'trigger-first-automation') {
    return {
      id: actionId,
      method: 'POST',
      endpoint: '/api/studio/ops/actions',
      payload: { type: 'trigger_first_automation' },
      requiresConfirmation: true,
      risk: 'low',
    }
  }

  if (actionId === 'run-first-agent') {
    return {
      id: actionId,
      method: 'POST',
      endpoint: '/api/studio/ops/actions',
      payload: { type: 'run_first_agent' },
      requiresConfirmation: true,
      risk: 'low',
    }
  }

  return {
    id: actionId,
    method: 'GET',
    endpoint:
      actionId === 'review-approvals'
        ? '/studio/agents'
        : actionId === 'repair-infrastructure'
          ? '/studio/infrastructure'
          : actionId === 'inspect-automation-failures'
            ? '/studio/automations'
            : '/studio',
    payload: null,
    requiresConfirmation: false,
    risk: actionId === 'review-approvals' ? 'medium' : 'low',
  }
}
