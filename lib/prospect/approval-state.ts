import type { ProspectApprovalStatus } from './types'

export interface ProspectOutreachActionLike {
  id?: string | null
  action_type?: string | null
  status?: string | null
}

export interface ProspectApprovalLike {
  id?: string | null
  action_id?: string | null
  status?: string | null
}

export function deriveProspectApprovalState(input: {
  action?: ProspectOutreachActionLike | null
  approval?: ProspectApprovalLike | null
}): {
  approvalStatus: ProspectApprovalStatus
  actionable: boolean
} {
  if (
    !input.action ||
    (input.action.action_type !== 'send_outreach' && input.action.action_type !== 'send_follow_up')
  ) {
    return { approvalStatus: 'no_approval', actionable: false }
  }

  if (input.approval?.status === 'approved') {
    return { approvalStatus: 'approved_to_send', actionable: false }
  }

  if (input.approval?.status === 'rejected') {
    return { approvalStatus: 'rejected', actionable: false }
  }

  return { approvalStatus: 'awaiting_approval', actionable: true }
}
