import { describe, expect, it } from 'vitest'
import { buildProspectViews, summarizeProspects } from './api-view'

describe('buildProspectViews', () => {
  it('adds approval metadata for send_outreach approvals', () => {
    const prospects = buildProspectViews({
      prospects: [
        {
          id: 'prospect-1',
          company_name: 'Acme',
          source: 'linkedin',
          score: 88,
          band: 'hot',
          status: 'ready_to_contact',
          outreach_subject: 'Subject',
          outreach_body: 'Body',
          metadata: {
            summary: 'Need faster lead qualification.',
            pain_points: ['manual triage'],
            cta: 'Can I show a concrete workflow?',
          },
        },
      ],
      actions: [
        {
          id: 'action-1',
          action_type: 'send_outreach',
          status: 'blocked',
          input: { prospect_id: 'prospect-1' },
        },
      ],
      approvals: [{ id: 'approval-1', action_id: 'action-1', status: 'pending' }],
    })

    expect(prospects[0]).toMatchObject({
      approval_status: 'awaiting_approval',
      outreach_action_id: 'action-1',
      outreach_approval_id: 'approval-1',
      summary: 'Need faster lead qualification.',
      pain_points: ['manual triage'],
      cta: 'Can I show a concrete workflow?',
    })
  })
})

describe('summarizeProspects', () => {
  it('counts approvals and due follow-ups', () => {
    const summary = summarizeProspects(
      [
        {
          id: 'prospect-1',
          band: 'hot',
          status: 'ready_to_contact',
          next_followup_at: '2026-05-24T08:00:00.000Z',
          approval_status: 'awaiting_approval',
          outreach_action_id: 'action-1',
          outreach_approval_id: 'approval-1',
          summary: null,
          pain_points: [],
          cta: null,
        },
        {
          id: 'prospect-2',
          band: 'warm',
          status: 'follow_up',
          next_followup_at: '2026-05-26T08:00:00.000Z',
          approval_status: 'approved_to_send',
          outreach_action_id: 'action-2',
          outreach_approval_id: 'approval-2',
          summary: null,
          pain_points: [],
          cta: null,
        },
      ],
      new Date('2026-05-25T10:00:00.000Z').getTime()
    )

    expect(summary).toMatchObject({
      hot: 1,
      warm: 1,
      cold: 0,
      readyToContact: 1,
      dueFollowups: 1,
      awaitingApproval: 1,
      approvedToSend: 1,
    })
  })
})
