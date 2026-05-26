export type ProspectMemoryKind =
  | 'prospect_created'
  | 'outreach_draft_created'
  | 'follow_up_generated'
  | 'reply_recorded'
  | 'prospect_won'
  | 'prospect_lost'
  | 'operator_note'

export interface ProspectMemoryPoint {
  id: string
  userId: string
  namespace: 'prospects'
  prospectId: string
  companyName: string
  memoryKind: ProspectMemoryKind
  pipelineStatus: string
  band: string
  source: string
  createdAt: string
  text: string
  metadata: Record<string, unknown>
}

export interface ProspectMemorySearchResult {
  id: string
  text: string
  score?: number | null
  payload: Record<string, unknown>
}
