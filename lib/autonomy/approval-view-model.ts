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

export interface ApprovalQueueItem {
  approval: AutonomyApprovalView
  action: AutonomyActionView | null
  confidence: number | null
  isPending: boolean
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
      }
    })
    .sort((a, b) => {
      if (a.isPending !== b.isPending) return a.isPending ? -1 : 1
      return new Date(b.approval.created_at).getTime() - new Date(a.approval.created_at).getTime()
    })
}
