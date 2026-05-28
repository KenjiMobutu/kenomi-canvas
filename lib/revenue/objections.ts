export const conversationEventTypes = [
  'positive_reply',
  'soft_interest',
  'hard_no',
  'budget_block',
  'timing_block',
  'wrong_person',
  'referral',
  'meeting_booked',
  'closed_won',
  'closed_lost',
] as const

export type ConversationEventType = (typeof conversationEventTypes)[number]

export interface ProspectConversationEventRow {
  id: string
  prospect_id: string
  user_id: string
  event_type: ConversationEventType
  event_value?: string | null
  notes?: string | null
  created_at: string
}

export interface ConversationSummaryByType {
  type: ConversationEventType
  label: string
  count: number
}

export interface ProspectConversationLatest {
  eventType: ConversationEventType
  label: string
  eventValue: string | null
  notes: string | null
  createdAt: string
}

export interface ProspectConversationSummary {
  totalEvents: number
  byType: ConversationSummaryByType[]
  blockers: ConversationSummaryByType[]
  latestByProspectId: Record<string, ProspectConversationLatest>
}

const labels: Record<ConversationEventType, string> = {
  positive_reply: 'positive reply',
  soft_interest: 'soft interest',
  hard_no: 'hard no',
  budget_block: 'budget block',
  timing_block: 'timing block',
  wrong_person: 'wrong person',
  referral: 'referral',
  meeting_booked: 'meeting booked',
  closed_won: 'closed won',
  closed_lost: 'closed lost',
}

export function getConversationEventLabel(type: ConversationEventType) {
  return labels[type]
}

export function isConversationBlocker(type: ConversationEventType) {
  return (
    type === 'hard_no' ||
    type === 'budget_block' ||
    type === 'timing_block' ||
    type === 'wrong_person' ||
    type === 'closed_lost'
  )
}

export function buildConversationEventInsert(input: {
  prospectId: string
  userId: string
  eventType: ConversationEventType
  eventValue?: string | null
  notes?: string | null
  createdAt?: string
}) {
  return {
    prospect_id: input.prospectId,
    user_id: input.userId,
    event_type: input.eventType,
    event_value: input.eventValue?.trim() || null,
    notes: input.notes?.trim() || null,
    created_at: input.createdAt ?? new Date().toISOString(),
  }
}

export function summarizeConversationEvents(
  rows: ProspectConversationEventRow[]
): ProspectConversationSummary {
  const counts = new Map<ConversationEventType, number>()
  const latestByProspectId: Record<string, ProspectConversationLatest> = {}

  for (const row of rows) {
    counts.set(row.event_type, (counts.get(row.event_type) ?? 0) + 1)

    const current = latestByProspectId[row.prospect_id]
    if (!current || new Date(current.createdAt).getTime() < new Date(row.created_at).getTime()) {
      latestByProspectId[row.prospect_id] = {
        eventType: row.event_type,
        label: getConversationEventLabel(row.event_type),
        eventValue: typeof row.event_value === 'string' ? row.event_value : null,
        notes: typeof row.notes === 'string' ? row.notes : null,
        createdAt: row.created_at,
      }
    }
  }

  const byType = Array.from(counts.entries())
    .map(([type, count]) => ({
      type,
      label: getConversationEventLabel(type),
      count,
    }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))

  return {
    totalEvents: rows.length,
    byType,
    blockers: byType.filter((item) => isConversationBlocker(item.type)).slice(0, 4),
    latestByProspectId,
  }
}
