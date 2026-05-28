import { describe, expect, it } from 'vitest'
import { buildCashActions } from './cash-queue'

describe('buildCashActions', () => {
  it('prioritizes the strongest cash actions with operator intents', () => {
    const actions = buildCashActions({
      prospects: [
        {
          id: 'p-approval',
          company_name: 'Approve Co',
          source: 'linkedin',
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
          source: 'reddit',
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
          source: 'linkedin',
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
      segmentFocus: { source: 'reddit', band: 'hot', qualityScore: 65 },
      nowIso: '2026-05-28T12:00:00.000Z',
    })

    expect(actions.map((action) => action.kind)).toEqual([
      'follow_up',
      'approval',
      'send',
      'revenue',
    ])
    expect(actions[0].intent).toEqual({
      method: 'PATCH',
      endpoint: '/api/studio/prospects',
      body: { id: 'p-follow-up', action: 'mark_follow_up_sent' },
      successMessage: 'Follow-up marked sent',
    })
    expect(actions[0]).toMatchObject({
      impactLabel: '82/100 lead',
      blockedLabel: '4h blocked',
    })
    expect(actions[1].intent).toEqual({
      method: 'PATCH',
      endpoint: '/api/studio/autonomy/jobs',
      body: { approvalId: 'approval-1', decision: 'approved' },
      successMessage: 'Draft approved',
    })
    expect(actions[3]).toMatchObject({
      impactLabel: '900 €',
      blockedLabel: '87 priority',
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
          source: 'reddit',
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
      nowIso: '2026-05-28T12:00:00.000Z',
    })

    expect(actions).toHaveLength(1)
    expect(actions[0]).toMatchObject({
      kind: 'lead',
      label: 'Travailler Lead Co',
      href: '/studio/prospects',
      impactLabel: '88/100 lead',
      blockedLabel: 'new lead',
      intent: null,
    })
  })

  it('chooses the strongest candidate within a kind instead of the first one', () => {
    const actions = buildCashActions({
      prospects: [
        {
          id: 'p-cold',
          company_name: 'Cold Approval Co',
          source: 'linkedin',
          band: 'cold',
          score: 35,
          pipeline_status: 'awaiting_approval',
          approval_status: 'awaiting_approval',
          outreach_approval_id: 'approval-cold',
          next_followup_at: null,
          last_outreach_kind: 'initial',
        },
        {
          id: 'p-hot',
          company_name: 'Hot Approval Co',
          source: 'reddit',
          band: 'hot',
          score: 93,
          pipeline_status: 'awaiting_approval',
          approval_status: 'awaiting_approval',
          outreach_approval_id: 'approval-hot',
          next_followup_at: null,
          last_outreach_kind: 'initial',
        },
      ],
      revenueSnapshot: null,
      segmentFocus: { source: 'reddit', band: 'hot', qualityScore: 65 },
      nowIso: '2026-05-28T12:00:00.000Z',
    })

    expect(actions).toHaveLength(1)
    expect(actions[0]).toMatchObject({
      kind: 'approval',
      label: 'Approuver Hot Approval Co',
    })
    expect(actions[0].intent).toMatchObject({
      body: { approvalId: 'approval-hot', decision: 'approved' },
    })
  })

  it('boosts prospects that match the best source-band segment', () => {
    const actions = buildCashActions({
      prospects: [
        {
          id: 'p-match',
          company_name: 'Matched Lead',
          source: 'reddit',
          band: 'hot',
          score: 80,
          pipeline_status: 'draft_created',
          approval_status: 'approved_to_send',
          outreach_approval_id: null,
          next_followup_at: null,
          last_outreach_kind: 'initial',
        },
        {
          id: 'p-nomatch',
          company_name: 'Higher Score Lead',
          source: 'linkedin',
          band: 'warm',
          score: 95,
          pipeline_status: 'draft_created',
          approval_status: 'approved_to_send',
          outreach_approval_id: null,
          next_followup_at: null,
          last_outreach_kind: 'initial',
        },
      ],
      revenueSnapshot: null,
      segmentFocus: { source: 'reddit', band: 'hot', qualityScore: 90 },
      nowIso: '2026-05-28T12:00:00.000Z',
    })

    expect(actions[0]).toMatchObject({
      kind: 'send',
      label: 'Envoyer Matched Lead',
      boostLabel: 'top segment · reddit/hot',
    })
  })

  it('shifts priority toward lead generation when the best segment needs volume', () => {
    const actions = buildCashActions({
      prospects: [
        {
          id: 'p-send',
          company_name: 'Ready Draft Co',
          source: 'reddit',
          band: 'hot',
          score: 84,
          pipeline_status: 'draft_created',
          approval_status: 'approved_to_send',
          outreach_approval_id: null,
          next_followup_at: null,
          last_outreach_kind: 'initial',
        },
        {
          id: 'p-lead',
          company_name: 'Volume Lead Co',
          source: 'reddit',
          band: 'hot',
          score: 83,
          pipeline_status: 'new',
          approval_status: 'none',
          outreach_approval_id: null,
          next_followup_at: null,
          last_outreach_kind: 'initial',
        },
      ],
      revenueSnapshot: null,
      segmentFocus: { source: 'reddit', band: 'hot', qualityScore: 65, playbookHint: 'needs volume' },
      nowIso: '2026-05-28T12:00:00.000Z',
    })

    expect(actions[0]).toMatchObject({
      kind: 'lead',
      label: 'Travailler Volume Lead Co',
    })
  })

  it('shifts priority toward follow-up when the best segment is win-heavy', () => {
    const actions = buildCashActions({
      prospects: [
        {
          id: 'p-followup',
          company_name: 'Win Follow-up Co',
          source: 'reddit',
          band: 'hot',
          score: 78,
          pipeline_status: 'follow_up_due',
          approval_status: 'approved_to_send',
          outreach_approval_id: null,
          next_followup_at: '2026-05-28T11:00:00.000Z',
          last_outreach_kind: 'follow_up_1',
        },
        {
          id: 'p-send',
          company_name: 'Win Draft Co',
          source: 'reddit',
          band: 'hot',
          score: 92,
          pipeline_status: 'draft_created',
          approval_status: 'approved_to_send',
          outreach_approval_id: null,
          next_followup_at: null,
          last_outreach_kind: 'initial',
        },
      ],
      revenueSnapshot: null,
      segmentFocus: { source: 'reddit', band: 'hot', qualityScore: 65, playbookHint: 'win-heavy' },
      nowIso: '2026-05-28T12:00:00.000Z',
    })

    expect(actions[0]).toMatchObject({
      kind: 'follow_up',
      label: 'Relancer Win Follow-up Co',
    })
  })
})
