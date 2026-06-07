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
      contact_status: 'missing_contact',
      missing_contact_fields: ['contact_email'],
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
          contact_email: 'lea@acme.test',
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
    expect(view.contact_status).toBe('contactable')
    expect(view.tags).toEqual(['saas'])
    expect(view.operator_notes).toBe('Waiting for reply')
    expect(view.activity).toHaveLength(1)
  })

  it('keeps missing-contact prospects out of the due follow-up queue', () => {
    const [view] = buildProspectViews({
      prospects: [
        {
          id: 'prospect-1',
          company_name: 'Acme',
          source: 'linkedin',
          band: 'warm',
          score: 71,
          pipeline_status: 'follow_up_due',
          next_followup_at: '2026-05-25T10:00:00.000Z',
          metadata: {},
        },
      ],
      actions: [],
      approvals: [],
      nowIso: '2026-05-26T12:00:00.000Z',
    })

    expect(view.contact_status).toBe('missing_contact')
    expect(view.pipeline_status).toBe('sent')
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
          contact_status: 'missing_contact',
          missing_contact_fields: ['contact_email'],
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
          follow_up_count: 0,
          last_outreach_kind: 'initial',
          last_follow_up_generated_at: null,
          follow_up_version: 0,
          message_family: 'linkedin_initial',
          message_key: 'linkedin_initial_default',
        },
        {
          id: 'prospect-2',
          band: 'warm',
          status: 'follow_up',
          contact_status: 'contactable',
          missing_contact_fields: [],
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
          follow_up_count: 0,
          last_outreach_kind: 'initial',
          last_follow_up_generated_at: null,
          follow_up_version: 0,
          message_family: 'unknown_initial',
          message_key: 'unknown_initial_default',
        },
      ],
      new Date('2026-05-25T10:00:00.000Z').getTime()
    )

    expect(summary).toMatchObject({
      hot: 1,
      warm: 1,
      cold: 0,
      contactable: 1,
      missingContact: 1,
      activeQueue: 1,
      readyToContact: 1,
      dueFollowups: 0,
      awaitingApproval: 0,
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
          contact_email: 'lea@beta.test',
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

  it('keeps follow_up_due when a later follow-up already has a local draft', () => {
    const prospects = buildProspectViews({
      prospects: [
        {
          id: 'prospect-1',
          status: 'follow_up',
          pipeline_status: 'follow_up_due',
          draft_provider: 'gmail',
          draft_external_id: 'draft-2',
          last_outreach_kind: 'follow_up_2',
          metadata: { activity: [] },
          contact_email: 'lea@beta.test',
        },
      ],
      actions: [],
      approvals: [],
    })

    expect(prospects[0]).toMatchObject({
      pipeline_status: 'follow_up_due',
      draft_provider: 'gmail',
      draft_external_id: 'draft-2',
      last_outreach_kind: 'follow_up_2',
    })
  })

  it('counts derived follow-up due and terminal crm states', () => {
    const summary = summarizeProspects(
      [
        {
          id: 'prospect-1',
          band: 'warm',
          status: 'sent',
          contact_status: 'contactable',
          missing_contact_fields: [],
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
          follow_up_count: 1,
          last_outreach_kind: 'follow_up_1',
          last_follow_up_generated_at: null,
          follow_up_version: 1,
          message_family: 'unknown_follow_up',
          message_key: 'unknown_follow_up_default',
        },
        {
          id: 'prospect-2',
          band: 'hot',
          status: 'won',
          contact_status: 'missing_contact',
          missing_contact_fields: ['contact_email'],
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
          follow_up_count: 0,
          last_outreach_kind: 'initial',
          last_follow_up_generated_at: null,
          follow_up_version: 0,
          message_family: 'unknown_initial',
          message_key: 'unknown_initial_default',
        },
      ],
      new Date('2026-05-26T10:00:00.000Z').getTime()
    )

    expect(summary).toMatchObject({
      contactable: 1,
      missingContact: 1,
      activeQueue: 1,
      followUpDue: 1,
      won: 1,
    })
  })

  it('does not count missing-contact follow-up dues in the active queue', () => {
    const summary = summarizeProspects([
      {
        id: 'prospect-1',
        band: 'warm',
        status: 'follow_up',
        contact_status: 'missing_contact',
        missing_contact_fields: ['contact_email'],
        pipeline_status: 'follow_up_due',
        approval_status: 'no_approval',
        outreach_action_id: null,
        outreach_approval_id: null,
        draft_provider: 'gmail',
        draft_external_id: 'draft-1',
        operator_notes: '',
        next_action: '',
        last_activity_at: null,
        next_followup_at: '2026-05-25T08:00:00.000Z',
        tags: [],
        activity: [],
        summary: null,
        pain_points: [],
        cta: null,
        follow_up_count: 1,
        last_outreach_kind: 'follow_up_2',
        last_follow_up_generated_at: null,
        follow_up_version: 1,
        message_family: 'unknown_follow_up',
        message_key: 'unknown_follow_up_default',
      },
    ])

    expect(summary).toMatchObject({
      contactable: 0,
      missingContact: 1,
      activeQueue: 0,
      dueFollowups: 0,
      followUpDue: 0,
    })
  })
})
