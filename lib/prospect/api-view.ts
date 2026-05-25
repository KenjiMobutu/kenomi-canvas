import { deriveProspectApprovalState } from '@/lib/prospect/approval-state'
import type { ProspectApprovalStatus, ProspectBand } from '@/lib/prospect/types'

export interface ProspectActionRow {
  id: string
  action_type?: string | null
  status?: string | null
  input?: Record<string, unknown> | null
  created_at?: string | null
}

export interface ProspectApprovalRow {
  id: string
  action_id: string
  status?: string | null
  created_at?: string | null
  updated_at?: string | null
}

export interface ProspectRecordRow {
  id: string
  band?: ProspectBand
  status?: string | null
  next_followup_at?: string | null
  metadata?: Record<string, unknown> | null
  [key: string]: unknown
}

export interface ProspectSummaryView {
  hot: number
  warm: number
  cold: number
  readyToContact: number
  dueFollowups: number
  awaitingApproval: number
  approvedToSend: number
}

export interface ProspectRecordView extends ProspectRecordRow {
  approval_status: ProspectApprovalStatus
  outreach_action_id: string | null
  outreach_approval_id: string | null
  summary: string | null
  pain_points: unknown[]
  cta: string | null
}

function pickActionForProspect(
  prospectId: string,
  actions: ProspectActionRow[]
): ProspectActionRow | null {
  for (const action of actions) {
    if (action.input?.prospect_id === prospectId) {
      return action
    }
  }
  return null
}

export function buildProspectViews(input: {
  prospects: ProspectRecordRow[]
  actions: ProspectActionRow[]
  approvals: ProspectApprovalRow[]
}): ProspectRecordView[] {
  const approvalsByActionId = new Map(input.approvals.map((approval) => [approval.action_id, approval]))

  return input.prospects.map((row) => {
    const metadata =
      row.metadata && typeof row.metadata === 'object'
        ? (row.metadata as Record<string, unknown>)
        : {}
    const action = pickActionForProspect(row.id, input.actions)
    const approval = action ? approvalsByActionId.get(action.id) ?? null : null
    const state = deriveProspectApprovalState({ action, approval })

    return {
      ...row,
      approval_status: state.approvalStatus,
      outreach_action_id: action?.id ?? null,
      outreach_approval_id: approval?.id ?? null,
      summary: typeof metadata.summary === 'string' ? metadata.summary : null,
      pain_points: Array.isArray(metadata.pain_points) ? metadata.pain_points : [],
      cta: typeof metadata.cta === 'string' ? metadata.cta : null,
    }
  })
}

export function summarizeProspects(rows: ProspectRecordView[], nowMs = Date.now()): ProspectSummaryView {
  return rows.reduce<ProspectSummaryView>(
    (acc, row) => {
      const status = typeof row.status === 'string' ? row.status : 'new'
      const nextFollowupAt = typeof row.next_followup_at === 'string' ? row.next_followup_at : null

      if (row.band === 'hot') acc.hot += 1
      if (row.band === 'warm') acc.warm += 1
      if (row.band === 'cold') acc.cold += 1
      if (status === 'ready_to_contact') acc.readyToContact += 1
      if (nextFollowupAt && new Date(nextFollowupAt).getTime() <= nowMs) acc.dueFollowups += 1
      if (row.approval_status === 'awaiting_approval') acc.awaitingApproval += 1
      if (row.approval_status === 'approved_to_send') acc.approvedToSend += 1
      return acc
    },
    {
      hot: 0,
      warm: 0,
      cold: 0,
      readyToContact: 0,
      dueFollowups: 0,
      awaitingApproval: 0,
      approvedToSend: 0,
    }
  )
}
