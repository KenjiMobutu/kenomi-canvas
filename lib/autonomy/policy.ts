import type {
  AutonomyAction,
  HermesAutoExecutionInput,
  HermesPolicyBlockReason,
} from './types'

const ALWAYS_APPROVAL_ACTIONS = new Set(['publish_campaign', 'scale_budget', 'stop_venture'])

const PRODUCTION_APPROVAL_ACTIONS = new Set(['create_checkout', 'deploy'])

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

export function canHermesAutoExecute(input: HermesAutoExecutionInput): boolean {
  return evaluateHermesAutoExecution(input).ok
}

function resolveHermesExecutionBucket(
  input: HermesAutoExecutionInput
): 'follow_up_scan' | 'prospect' | 'devops' | null {
  if (input.actionType === 'follow_up_scan') {
    return input.recommendationKind === 'run_follow_up_scan' ? 'follow_up_scan' : null
  }

  if (input.actionType !== 'run_agent') return null

  if (input.recommendationKind === 'run_follow_up_scan') {
    return input.agentId ? null : 'follow_up_scan'
  }

  if (input.recommendationKind === 'run_prospect') {
    return input.agentId === 'prospect' ? 'prospect' : null
  }

  if (input.recommendationKind === 'run_devops') {
    return input.agentId === 'devops' ? 'devops' : null
  }

  if (input.agentId === 'prospect') return 'prospect'
  if (input.agentId === 'devops') return 'devops'

  return null
}

function isAllowlistedHermesAction(input: HermesAutoExecutionInput): boolean {
  return resolveHermesExecutionBucket(input) !== null
}

function actionCapReached(input: HermesAutoExecutionInput): boolean {
  if (!input.caps || !input.usage) return false
  const bucket = resolveHermesExecutionBucket(input)
  if (!bucket) return false

  if (bucket === 'follow_up_scan') {
    return input.usage.followUpScansToday >= input.caps.maxAutoFollowUpScansPerDay
  }
  if (bucket === 'prospect') {
    return input.usage.prospectRunsToday >= input.caps.maxAutoProspectRunsPerDay
  }
  if (bucket === 'devops') {
    return input.usage.devopsRunsToday >= input.caps.maxAutoDevopsRunsPerDay
  }
  return false
}

export function evaluateHermesAutoExecution(
  input: HermesAutoExecutionInput
): { ok: true } | { ok: false; reason: HermesPolicyBlockReason } {
  if (input.mode === 'observe') {
    return { ok: false, reason: 'mode_disallows' }
  }
  if (input.riskLevel !== 'low') {
    return { ok: false, reason: 'risk_too_high' }
  }
  if (!isAllowlistedHermesAction(input)) {
    return { ok: false, reason: 'action_not_allowlisted' }
  }
  if (
    input.caps &&
    input.usage &&
    input.usage.totalAutoActionsToday >= input.caps.maxAutoActionsPerDay
  ) {
    return { ok: false, reason: 'daily_cap_reached' }
  }
  if (actionCapReached(input)) {
    return { ok: false, reason: 'action_cap_reached' }
  }
  return { ok: true }
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
