import { describe, expect, it } from 'vitest'
import { buildCashActions } from './cash-queue'

describe('buildCashActions', () => {
  it('prioritizes approval, follow-up, send, and revenue actions with operator intents', () => {
    const actions = buildCashActions({
      prospects: [
        {
          id: 'p-approval',
          company_name: 'Approve Co',
          band: 'warm',
          score: 71,
          pipeline_status: 'awaiting_approval',
          approval_status: 'awaiting_approval',
          outreach_approval_id: 'approval-1',
          next_followup_at: null,
          last_outreach_kind: 'initial',
        },
        {
          id: 'p-follow-up',
          company_name: 'Follow-up Co',
          band: 'hot',
          score: 82,
          pipeline_status: 'follow_up_due',
          approval_status: 'approved_to_send',
          outreach_approval_id: null,
          next_followup_at: '2026-05-28T08:00:00.000Z',
          last_outreach_kind: 'follow_up_1',
        },
        {
          id: 'p-send',
          company_name: 'Send Co',
          band: 'hot',
          score: 92,
          pipeline_status: 'draft_created',
          approval_status: 'approved_to_send',
          outreach_approval_id: null,
          next_followup_at: null,
          last_outreach_kind: 'initial',
        },
      ],
      revenueSnapshot: {
        summary: {
          activeLoops: 2,
          readyCheckouts: 1,
          pendingApprovals: 0,
          revenueEur: 2200,
          blockedRevenueEur: 900,
          recommendedAction: {
            type: 'checkout_follow_up',
            ventureName: 'Revenue Venture',
            reason: 'checkout ready',
            priorityScore: 87,
            blockedRevenueEur: 900,
          },
        },
      },
    })

    expect(actions.map((action) => action.kind)).toEqual([
      'approval',
      'follow_up',
      'send',
      'revenue',
    ])
    expect(actions[0].intent).toEqual({
      method: 'PATCH',
      endpoint: '/api/studio/autonomy/jobs',
      body: { approvalId: 'approval-1', decision: 'approved' },
      successMessage: 'Draft approved',
    })
    expect(actions[1].intent).toEqual({
      method: 'PATCH',
      endpoint: '/api/studio/prospects',
      body: { id: 'p-follow-up', action: 'mark_follow_up_sent' },
      successMessage: 'Follow-up marked sent',
    })
    expect(actions[2].intent).toEqual({
      method: 'PATCH',
      endpoint: '/api/studio/prospects',
      body: { id: 'p-send', status: 'sent' },
      successMessage: 'Prospect marked sent',
    })
    expect(actions[3].intent).toBeNull()
  })

  it('falls back to a hot lead action when no operator action is pending', () => {
    const actions = buildCashActions({
      prospects: [
        {
          id: 'p-lead',
          company_name: 'Lead Co',
          band: 'hot',
          score: 88,
          pipeline_status: 'new',
          approval_status: 'none',
          outreach_approval_id: null,
          next_followup_at: null,
          last_outreach_kind: 'initial',
        },
      ],
      revenueSnapshot: null,
    })

    expect(actions).toHaveLength(1)
    expect(actions[0]).toMatchObject({
      kind: 'lead',
      label: 'Travailler Lead Co',
      href: '/studio/prospects',
      intent: null,
    })
  })
})
