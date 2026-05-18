import type { AutonomyAction } from './types'

const ALWAYS_APPROVAL_ACTIONS = new Set([
  'publish_campaign',
  'scale_budget',
  'stop_venture',
])

const PRODUCTION_APPROVAL_ACTIONS = new Set([
  'create_checkout',
  'deploy',
])

export function requiresApproval(action: AutonomyAction): boolean {
  if (action.budgetCapEur !== undefined && action.estimatedCostEur > action.budgetCapEur) {
    return true
  }

  if (ALWAYS_APPROVAL_ACTIONS.has(action.actionType)) {
    return true
  }

  if (action.environment === 'production' && PRODUCTION_APPROVAL_ACTIONS.has(action.actionType)) {
    return true
  }

  return action.riskLevel === 'critical'
}
