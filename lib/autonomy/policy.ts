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

export type BudgetBreachReason =
  | 'action_cap_exceeded'
  | 'venture_cap_exceeded'
  | 'global_cap_exceeded'

export interface BudgetPolicyInput {
  estimatedCostEur: number
  actionCapEur?: number
  ventureSpentEur: number
  ventureSpendCapEur: number
  globalSpentEur: number
  globalCapEur: number
}

export type BudgetPolicyResult =
  | { ok: true }
  | { ok: false; reason: BudgetBreachReason; detail: string }

export function checkBudgetPolicy(input: BudgetPolicyInput): BudgetPolicyResult {
  const cost = input.estimatedCostEur
  const actionCap = input.actionCapEur ?? Infinity
  if (cost > actionCap) {
    return { ok: false, reason: 'action_cap_exceeded', detail: `${cost} > ${actionCap}` }
  }
  if (input.ventureSpentEur + cost > input.ventureSpendCapEur) {
    return {
      ok: false,
      reason: 'venture_cap_exceeded',
      detail: `${input.ventureSpentEur + cost} > ${input.ventureSpendCapEur}`,
    }
  }
  if (input.globalSpentEur + cost > input.globalCapEur) {
    return {
      ok: false,
      reason: 'global_cap_exceeded',
      detail: `${input.globalSpentEur + cost} > ${input.globalCapEur}`,
    }
  }
  return { ok: true }
}
