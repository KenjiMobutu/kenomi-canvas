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
