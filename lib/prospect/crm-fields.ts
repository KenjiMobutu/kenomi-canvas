import type { ProspectPipelineStatus } from '@/lib/prospect/types'

const TERMINAL_STATUSES = new Set<ProspectPipelineStatus>(['won', 'lost'])

export function normalizeProspectTags(tags: string[] | null | undefined) {
  const items = Array.isArray(tags) ? tags : []
  return [...new Set(items.map((tag) => tag.trim().toLowerCase()).filter(Boolean))]
}

export function asProspectPipelineStatus(value: unknown): ProspectPipelineStatus {
  switch (value) {
    case 'new':
    case 'ready_to_contact':
    case 'awaiting_approval':
    case 'approved_to_send':
    case 'draft_created':
    case 'sent':
    case 'replied':
    case 'won':
    case 'lost':
    case 'follow_up_due':
      return value
    default:
      return 'new'
  }
}

export function derivePipelineStatus(input: {
  pipelineStatus: ProspectPipelineStatus
  nextFollowupAt?: string | null
  nowIso?: string
}) {
  if (input.pipelineStatus === 'awaiting_approval') return input.pipelineStatus
  if (input.pipelineStatus === 'approved_to_send') return input.pipelineStatus
  if (input.pipelineStatus === 'draft_created') return input.pipelineStatus
  if (input.pipelineStatus === 'follow_up_due') return input.pipelineStatus
  if (TERMINAL_STATUSES.has(input.pipelineStatus)) return input.pipelineStatus
  if (!input.nextFollowupAt) return input.pipelineStatus

  const next = new Date(input.nextFollowupAt).getTime()
  if (Number.isNaN(next)) return input.pipelineStatus

  const now = new Date(input.nowIso ?? new Date().toISOString()).getTime()
  return next <= now ? 'follow_up_due' : input.pipelineStatus
}
