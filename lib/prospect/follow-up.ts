import type { ProspectOutreachKind, ProspectPipelineStatus } from '@/lib/prospect/types'

const FOLLOW_UP_KIND_BY_COUNT: Record<number, ProspectOutreachKind | null> = {
  0: 'follow_up_1',
  1: 'follow_up_2',
  2: 'follow_up_3',
}

const FOLLOW_UP_DELAY_DAYS: Record<ProspectOutreachKind, number | null> = {
  initial: 2,
  follow_up_1: 5,
  follow_up_2: 10,
  follow_up_3: null,
}

const TERMINAL_STATUSES = new Set<ProspectPipelineStatus>(['won', 'lost', 'replied'])

export interface ProspectFollowUpStateLike {
  pipeline_status?: string | null
  next_followup_at?: string | null
  follow_up_count?: number | null
  last_outreach_kind?: string | null
  follow_up_version?: number | null
}

export function asOutreachKind(value: unknown): ProspectOutreachKind {
  switch (value) {
    case 'follow_up_1':
    case 'follow_up_2':
    case 'follow_up_3':
      return value
    default:
      return 'initial'
  }
}

export function getFollowUpRank(kind: ProspectOutreachKind) {
  switch (kind) {
    case 'follow_up_1':
      return 1
    case 'follow_up_2':
      return 2
    case 'follow_up_3':
      return 3
    default:
      return 0
  }
}

export function getNextFollowUpKind(followUpCount: number | null | undefined): ProspectOutreachKind | null {
  const safeCount = Number.isFinite(followUpCount) ? Number(followUpCount) : 0
  return FOLLOW_UP_KIND_BY_COUNT[safeCount] ?? null
}

export function scheduleNextFollowUpAt(
  now: Date,
  completedKind: ProspectOutreachKind
): string | null {
  const days = FOLLOW_UP_DELAY_DAYS[completedKind]
  if (!days) return null
  return new Date(now.getTime() + days * 24 * 60 * 60 * 1000).toISOString()
}

export function getNextFollowUpVersion(input: {
  currentKind?: string | null
  currentVersion?: number | null
  targetKind: ProspectOutreachKind
}) {
  const currentVersion = Number.isFinite(input.currentVersion) ? Number(input.currentVersion) : 0
  return input.currentKind === input.targetKind ? currentVersion + 1 : 1
}

export function shouldGenerateFollowUp(input: ProspectFollowUpStateLike & { nowIso?: string | null }) {
  const pipelineStatus = (input.pipeline_status ?? 'new') as ProspectPipelineStatus
  if (TERMINAL_STATUSES.has(pipelineStatus)) return false
  if (pipelineStatus !== 'sent') return false
  if (!input.next_followup_at) return false

  const nextRun = new Date(input.next_followup_at).getTime()
  if (Number.isNaN(nextRun)) return false

  const now = new Date(input.nowIso ?? new Date().toISOString()).getTime()
  if (nextRun > now) return false

  return getNextFollowUpKind(input.follow_up_count) !== null
}

export function buildProspectFollowUpDraft(input: {
  companyName: string
  contactName?: string | null
  summary?: string | null
  painPoints?: string[]
  previousSubject?: string | null
  operatorNotes?: string | null
  kind: ProspectOutreachKind
}) {
  const firstName = input.contactName?.trim()?.split(/\s+/)[0] ?? 'there'
  const reminder =
    input.kind === 'follow_up_1'
      ? `Quick follow-up on ${input.companyName}`
      : input.kind === 'follow_up_2'
        ? `Following up again on ${input.companyName}`
        : `Last follow-up for ${input.companyName}`
  const summary = input.summary?.trim() || `the ${input.companyName} opportunity`
  const painPoint = input.painPoints?.find(Boolean)?.trim() ?? 'this workflow'
  const note = input.operatorNotes?.trim()

  const subject =
    input.kind === 'follow_up_1'
      ? `Re: ${input.previousSubject?.trim() || reminder}`
      : `${reminder} — ${painPoint}`

  const lines = [
    `Hi ${firstName},`,
    '',
    input.kind === 'follow_up_3'
      ? `Closing the loop on ${summary}.`
      : `Following up on my earlier note about ${summary}.`,
    `The main angle is still ${painPoint}.`,
    note ? `Operator note: ${note}.` : 'If useful, I can send a concrete next step and a short implementation outline.',
    '',
    'Would a quick reply make sense this week?',
  ]

  return {
    subject,
    body: lines.join('\n'),
    cta: 'Would a quick reply make sense this week?',
  }
}

export function requiresFollowUpApproval(kind: ProspectOutreachKind) {
  return kind === 'follow_up_1'
}
