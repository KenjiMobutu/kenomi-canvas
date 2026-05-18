export interface AutonomyApprovalView {
  id: string
  action_id: string
  status: string
  reason: string | null
  approved_by?: string | null
  approved_at?: string | null
  created_at: string
  updated_at?: string | null
}

export interface AutonomyActionView {
  id: string
  job_id?: string | null
  venture_id?: string | null
  action_type: string
  risk_level: string
  status: string
  input: Record<string, unknown> | null
  output?: Record<string, unknown> | null
  created_at: string
  updated_at?: string | null
}

export type BudgetBreachReason =
  | 'action_cap_exceeded'
  | 'venture_cap_exceeded'
  | 'global_cap_exceeded'

export interface BudgetBreach {
  reason: BudgetBreachReason
  detail: string | null
}

export interface ApprovalQueueItem {
  approval: AutonomyApprovalView
  action: AutonomyActionView | null
  confidence: number | null
  isPending: boolean
  budgetBreach: BudgetBreach | null
}

const BUDGET_BREACH_REASONS: ReadonlySet<BudgetBreachReason> = new Set([
  'action_cap_exceeded',
  'venture_cap_exceeded',
  'global_cap_exceeded',
])

export function extractBudgetBreach(action: AutonomyActionView | null): BudgetBreach | null {
  if (!action) return null
  if (action.status !== 'blocked') return null
  const output = action.output ?? {}
  const reason = output.budget_breach
  if (typeof reason !== 'string') return null
  if (!BUDGET_BREACH_REASONS.has(reason as BudgetBreachReason)) return null
  const detail = typeof output.detail === 'string' ? output.detail : null
  return { reason: reason as BudgetBreachReason, detail }
}

export function buildApprovalQueue(input: {
  approvals: AutonomyApprovalView[]
  actions: AutonomyActionView[]
}): ApprovalQueueItem[] {
  const actionsById = new Map(input.actions.map(action => [action.id, action]))

  return input.approvals
    .map((approval) => {
      const action = actionsById.get(approval.action_id) ?? null
      const confidence = typeof action?.input?.confidence === 'number'
        ? action.input.confidence
        : null

      return {
        approval,
        action,
        confidence,
        isPending: approval.status === 'pending',
        budgetBreach: extractBudgetBreach(action),
      }
    })
    .sort((a, b) => {
      if (a.isPending !== b.isPending) return a.isPending ? -1 : 1
      return new Date(b.approval.created_at).getTime() - new Date(a.approval.created_at).getTime()
    })
}
