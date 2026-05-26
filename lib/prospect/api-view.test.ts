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
      pipeline_status: 'awaiting_approval',
      approval_status: 'awaiting_approval',
      outreach_action_id: 'action-1',
      outreach_approval_id: 'approval-1',
      summary: 'Need faster lead qualification.',
      pain_points: ['manual triage'],
      cta: 'Can I show a concrete workflow?',
    })
  })

  it('returns crm-local fields and derived follow_up_due status', () => {
    const [view] = buildProspectViews({
      prospects: [
        {
          id: 'prospect-1',
          company_name: 'Acme',
          source: 'linkedin',
          band: 'warm',
          score: 71,
          pipeline_status: 'sent',
          next_followup_at: '2026-05-25T10:00:00.000Z',
          tags: ['saas'],
          operator_notes: 'Waiting for reply',
          next_action: 'Send follow-up',
          metadata: {},
        },
      ],
      actions: [],
      approvals: [],
      activitiesByProspectId: {
        'prospect-1': [
          {
            id: 'a1',
            prospect_id: 'prospect-1',
            user_id: 'user-1',
            type: 'note_updated',
            detail: 'Waiting for reply',
            metadata: {},
            created_at: '2026-05-26T10:00:00.000Z',
          },
        ],
      },
      nowIso: '2026-05-26T12:00:00.000Z',
    })

    expect(view.pipeline_status).toBe('follow_up_due')
    expect(view.tags).toEqual(['saas'])
    expect(view.operator_notes).toBe('Waiting for reply')
    expect(view.activity).toHaveLength(1)
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
          pipeline_status: 'awaiting_approval',
          approval_status: 'awaiting_approval',
          outreach_action_id: 'action-1',
          outreach_approval_id: 'approval-1',
          draft_provider: null,
          draft_external_id: null,
          operator_notes: '',
          next_action: '',
          last_activity_at: null,
          tags: [],
          activity: [],
          summary: null,
          pain_points: [],
          cta: null,
        },
        {
          id: 'prospect-2',
          band: 'warm',
          status: 'follow_up',
          next_followup_at: '2026-05-26T08:00:00.000Z',
          pipeline_status: 'draft_created',
          approval_status: 'approved_to_send',
          outreach_action_id: 'action-2',
          outreach_approval_id: 'approval-2',
          draft_provider: 'gmail',
          draft_external_id: 'draft-1',
          operator_notes: '',
          next_action: '',
          last_activity_at: null,
          tags: [],
          activity: [],
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
      draftCreated: 1,
      sent: 0,
      replied: 0,
      won: 0,
      lost: 0,
      followUpDue: 0,
    })
  })

  it('maps a gmail-backed approved prospect to draft_created', () => {
    const prospects = buildProspectViews({
      prospects: [
        {
          id: 'prospect-1',
          status: 'approved_to_send',
          draft_provider: 'gmail',
          draft_external_id: 'draft-1',
          metadata: { activity: [] },
        },
      ],
      actions: [],
      approvals: [],
    })

    expect(prospects[0]).toMatchObject({
      pipeline_status: 'draft_created',
      draft_provider: 'gmail',
      draft_external_id: 'draft-1',
    })
  })

  it('counts derived follow-up due and terminal crm states', () => {
    const summary = summarizeProspects(
      [
        {
          id: 'prospect-1',
          band: 'warm',
          status: 'sent',
          pipeline_status: 'follow_up_due',
          approval_status: 'approved_to_send',
          outreach_action_id: 'action-1',
          outreach_approval_id: 'approval-1',
          draft_provider: 'gmail',
          draft_external_id: 'draft-1',
          operator_notes: '',
          next_action: '',
          last_activity_at: null,
          tags: [],
          activity: [],
          summary: null,
          pain_points: [],
          cta: null,
        },
        {
          id: 'prospect-2',
          band: 'hot',
          status: 'won',
          pipeline_status: 'won',
          approval_status: 'no_approval',
          outreach_action_id: null,
          outreach_approval_id: null,
          draft_provider: null,
          draft_external_id: null,
          operator_notes: '',
          next_action: '',
          last_activity_at: null,
          tags: [],
          activity: [],
          summary: null,
          pain_points: [],
          cta: null,
        },
      ],
      new Date('2026-05-26T10:00:00.000Z').getTime()
    )

    expect(summary).toMatchObject({
      followUpDue: 1,
      won: 1,
    })
  })
})
