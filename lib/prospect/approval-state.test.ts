import { describe, expect, it } from 'vitest'
import { deriveProspectApprovalState } from './approval-state'

describe('deriveProspectApprovalState', () => {
  it('maps blocked send_outreach action + pending approval to awaiting_approval', () => {
    const state = deriveProspectApprovalState({
      action: { action_type: 'send_outreach', status: 'blocked' },
      approval: { status: 'pending' },
    })

    expect(state).toEqual({
      approvalStatus: 'awaiting_approval',
      actionable: true,
    })
  })

  it('returns approved_to_send when approval is approved', () => {
    const state = deriveProspectApprovalState({
      action: { action_type: 'send_outreach', status: 'blocked' },
      approval: { status: 'approved' },
    })

    expect(state).toEqual({
      approvalStatus: 'approved_to_send',
      actionable: false,
    })
  })

  it('returns rejected when approval is rejected', () => {
    const state = deriveProspectApprovalState({
      action: { action_type: 'send_outreach', status: 'blocked' },
      approval: { status: 'rejected' },
    })

    expect(state).toEqual({
      approvalStatus: 'rejected',
      actionable: false,
    })
  })

  it('returns no_approval when no send_outreach action exists', () => {
    const state = deriveProspectApprovalState({
      action: null,
      approval: null,
    })

    expect(state).toEqual({
      approvalStatus: 'no_approval',
      actionable: false,
    })
  })

  it('ignores completed send actions even if an approval row still exists', () => {
    const state = deriveProspectApprovalState({
      action: { action_type: 'send_follow_up', status: 'completed' },
      approval: { status: 'pending' },
    })

    expect(state).toEqual({
      approvalStatus: 'no_approval',
      actionable: false,
    })
  })
})
