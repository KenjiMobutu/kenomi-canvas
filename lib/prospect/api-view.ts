import { deriveProspectApprovalState } from '@/lib/prospect/approval-state'
import { asProspectPipelineStatus, derivePipelineStatus, normalizeProspectTags } from '@/lib/prospect/crm-fields'
import type {
  ProspectActivityEvent,
  ProspectActivityRow,
  ProspectApprovalStatus,
  ProspectBand,
  ProspectOutreachKind,
  ProspectPipelineStatus,
} from '@/lib/prospect/types'

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
  pipeline_status?: string | null
  operator_notes?: string | null
  next_action?: string | null
  last_activity_at?: string | null
  tags?: string[] | null
  next_followup_at?: string | null
  follow_up_count?: number | null
  last_outreach_kind?: string | null
  last_follow_up_generated_at?: string | null
  follow_up_version?: number | null
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
  draftCreated: number
  sent: number
  replied: number
  won: number
  lost: number
  followUpDue: number
}

export interface ProspectRecordView extends ProspectRecordRow {
  offer_id?: string | null
  offer_variant?: string | null
  outreach_angle?: string | null
  latest_conversation_event_type?: string | null
  latest_conversation_event_value?: string | null
  latest_conversation_notes?: string | null
  latest_conversation_at?: string | null
  pipeline_status: ProspectPipelineStatus
  approval_status: ProspectApprovalStatus
  outreach_action_id: string | null
  outreach_approval_id: string | null
  draft_provider: string | null
  draft_external_id: string | null
  operator_notes: string
  next_action: string
  last_activity_at: string | null
  tags: string[]
  activity: Array<ProspectActivityEvent | ProspectActivityRow>
  summary: string | null
  pain_points: unknown[]
  cta: string | null
  follow_up_count: number
  last_outreach_kind: ProspectOutreachKind
  last_follow_up_generated_at: string | null
  follow_up_version: number
}

function pickActionForProspect(
  prospectId: string,
  actions: ProspectActionRow[]
): ProspectActionRow | null {
  for (const action of actions) {
    if (
      action.input?.prospect_id === prospectId &&
      (action.action_type === 'send_outreach' || action.action_type === 'send_follow_up')
    ) {
      return action
    }
  }
  return null
}

function asOutreachKind(value: unknown): ProspectOutreachKind {
  switch (value) {
    case 'follow_up_1':
    case 'follow_up_2':
    case 'follow_up_3':
      return value
    default:
      return 'initial'
  }
}

export function buildProspectViews(input: {
  prospects: ProspectRecordRow[]
  actions: ProspectActionRow[]
  approvals: ProspectApprovalRow[]
  activitiesByProspectId?: Record<string, ProspectActivityRow[]>
  nowIso?: string
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
    const activity = input.activitiesByProspectId?.[row.id] ?? (
      Array.isArray(metadata.activity) ? (metadata.activity as ProspectActivityEvent[]) : []
    )
    const draftProvider = typeof row.draft_provider === 'string' ? row.draft_provider : null
    const draftExternalId = typeof row.draft_external_id === 'string' ? row.draft_external_id : null
    const status = typeof row.status === 'string' ? row.status : 'new'
    const storedPipeline = asProspectPipelineStatus(row.pipeline_status ?? status)
    const lastOutreachKind = asOutreachKind(row.last_outreach_kind)
    const followUpCount = Number.isFinite(row.follow_up_count) ? Number(row.follow_up_count) : 0
    const followUpVersion = Number.isFinite(row.follow_up_version) ? Number(row.follow_up_version) : 0

    let pipelineStatus = derivePipelineStatus({
      pipelineStatus: storedPipeline,
      nextFollowupAt: typeof row.next_followup_at === 'string' ? row.next_followup_at : null,
      nowIso: input.nowIso,
    })
    if (
      state.approvalStatus === 'awaiting_approval' &&
      (storedPipeline === 'new' ||
        storedPipeline === 'ready_to_contact' ||
        storedPipeline === 'awaiting_approval' ||
        storedPipeline === 'approved_to_send')
    ) {
      pipelineStatus = 'awaiting_approval'
    } else if (
      draftProvider &&
      draftExternalId &&
      (storedPipeline === 'approved_to_send' || storedPipeline === 'draft_created')
    ) {
      pipelineStatus = 'draft_created'
    } else if (
      state.approvalStatus === 'approved_to_send' &&
      (storedPipeline === 'new' ||
        storedPipeline === 'ready_to_contact' ||
        storedPipeline === 'awaiting_approval' ||
        storedPipeline === 'approved_to_send')
    ) {
      pipelineStatus = 'approved_to_send'
    }

    return {
      ...row,
      pipeline_status: pipelineStatus,
      approval_status: state.approvalStatus,
      outreach_action_id: action?.id ?? null,
      outreach_approval_id: approval?.id ?? null,
      draft_provider: draftProvider,
      draft_external_id: draftExternalId,
      operator_notes: typeof row.operator_notes === 'string' ? row.operator_notes : '',
      next_action: typeof row.next_action === 'string' ? row.next_action : '',
      last_activity_at: typeof row.last_activity_at === 'string' ? row.last_activity_at : null,
      tags: normalizeProspectTags(row.tags),
      activity,
      summary: typeof metadata.summary === 'string' ? metadata.summary : null,
      pain_points: Array.isArray(metadata.pain_points) ? metadata.pain_points : [],
      cta: typeof metadata.cta === 'string' ? metadata.cta : null,
      follow_up_count: followUpCount,
      last_outreach_kind: lastOutreachKind,
      last_follow_up_generated_at:
        typeof row.last_follow_up_generated_at === 'string' ? row.last_follow_up_generated_at : null,
      follow_up_version: followUpVersion,
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
      if (row.pipeline_status === 'draft_created') acc.draftCreated += 1
      if (row.pipeline_status === 'sent') acc.sent += 1
      if (row.pipeline_status === 'replied') acc.replied += 1
      if (row.pipeline_status === 'won') acc.won += 1
      if (row.pipeline_status === 'lost') acc.lost += 1
      if (row.pipeline_status === 'follow_up_due') acc.followUpDue += 1
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
      draftCreated: 0,
      sent: 0,
      replied: 0,
      won: 0,
      lost: 0,
      followUpDue: 0,
    }
  )
}
