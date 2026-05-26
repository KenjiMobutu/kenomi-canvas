export type ProspectSource = 'linkedin' | 'malt' | 'upwork' | 'indeed' | 'reddit' | 'other'
export type ProspectBand = 'hot' | 'warm' | 'cold'
export type ProspectFit = 'low' | 'medium' | 'high'
export type ProspectUrgency = 'low' | 'medium' | 'high'
export type ProspectFocus = 'prospect' | 'crm' | 'reply'
export type ProspectApprovalStatus =
  | 'no_approval'
  | 'awaiting_approval'
  | 'approved_to_send'
  | 'rejected'
export type ProspectOutreachKind = 'initial' | 'follow_up_1' | 'follow_up_2' | 'follow_up_3'
export type ProspectPipelineStatus =
  | 'new'
  | 'ready_to_contact'
  | 'awaiting_approval'
  | 'approved_to_send'
  | 'draft_created'
  | 'sent'
  | 'replied'
  | 'won'
  | 'lost'
  | 'follow_up_due'

export type ProspectActivityEvent = {
  type:
    | 'prospect_created'
    | 'approval_created'
    | 'approval_approved'
    | 'approval_rejected'
    | 'gmail_draft_created'
    | 'note_updated'
    | 'tags_updated'
    | 'next_action_updated'
    | 'marked_sent'
    | 'marked_replied'
    | 'marked_won'
    | 'marked_lost'
    | 'follow_up_scheduled'
    | 'follow_up_generated'
    | 'follow_up_approved'
    | 'follow_up_rejected'
    | 'follow_up_marked_sent'
    | 'follow_up_skipped'
    | 'follow_up_regenerated'
  actor: 'system' | 'operator'
  at: string
  detail: string
}

export type ProspectActivityType = ProspectActivityEvent['type']

export interface ProspectActivityRow {
  id: string
  prospect_id: string
  user_id: string
  type: ProspectActivityType
  detail: string
  metadata: Record<string, unknown>
  created_at: string
}

export interface ProspectScoreInput {
  companyName: string
  source: ProspectSource
  signals: string[]
  fit: ProspectFit
  urgency: ProspectUrgency
}

export interface ProspectScoreResult {
  score: number
  band: ProspectBand
  reasons: string[]
}

export interface ProspectOutreachInput {
  companyName: string
  contactName?: string | null
  source: ProspectSource
  score: number
  band: ProspectBand
  painPoints: string[]
  focus: ProspectFocus
}

export interface ProspectOutreachDraft {
  subject: string
  body: string
  cta: string
}

export interface ProspectMemoryInput {
  id: string
  companyName: string
  source: ProspectSource
  score: number
  band: ProspectBand
  summary: string
  tags: string[]
  contactName?: string | null
  contactRole?: string | null
  contactEmail?: string | null
}

export interface ProspectMemoryRecord {
  namespace: 'prospects'
  id: string
  text: string
  metadata: {
    companyName: string
    source: ProspectSource
    score: number
    band: ProspectBand
    summary: string
    tags: string[]
    contactName?: string | null
    contactRole?: string | null
    contactEmail?: string | null
  }
}
