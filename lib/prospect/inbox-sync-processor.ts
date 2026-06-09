import { classifyInboxMessage } from './inbox-sync'

export interface InboxProspectRowLike {
  id: string
  company_name?: string | null
  contact_email?: string | null
  pipeline_status?: string | null
  operator_notes?: string | null
  metadata?: Record<string, unknown> | null
  last_outreach_kind?: string | null
}

export interface InboxMessageLike {
  id: string
  from?: string | null
  subject?: string | null
  body?: string | null
}

export interface InboxSyncMutation {
  messageId: string
  prospectId: string
  prospectEmail: string
  classification: 'bounce' | 'auto_ack' | 'human_reply'
  nextStatus: 'lost' | 'replied' | null
  note: string
}

function normalizeEmail(value: string | null | undefined): string | null {
  if (!value) return null
  return value.trim().toLowerCase()
}

export function buildInboxSyncMutations(input: {
  prospects: readonly InboxProspectRowLike[]
  messages: readonly InboxMessageLike[]
  nowIso: string
}) {
  const prospectsByEmail = new Map<string, InboxProspectRowLike>()
  for (const prospect of input.prospects) {
    const email = normalizeEmail(prospect.contact_email)
    if (email) prospectsByEmail.set(email, prospect)
  }

  const mutations: InboxSyncMutation[] = []

  for (const message of input.messages) {
    const classification = classifyInboxMessage({
      from: message.from,
      subject: message.subject,
      body: message.body,
    })

    if (classification.kind === 'ignore' || !classification.prospectEmail) continue
    const prospect = prospectsByEmail.get(classification.prospectEmail)
    if (!prospect) continue

    if (
      classification.kind === 'human_reply' &&
      (prospect.pipeline_status === 'replied' ||
        prospect.pipeline_status === 'won' ||
        prospect.pipeline_status === 'lost')
    ) {
      continue
    }

    if (classification.kind === 'bounce' && prospect.pipeline_status === 'lost') {
      continue
    }

    const note =
      classification.kind === 'bounce'
        ? `Bounce detected via inbox sync (${classification.reason}).`
        : classification.kind === 'auto_ack'
          ? 'Automatic acknowledgement detected via inbox sync.'
          : 'Human reply detected via inbox sync.'

    mutations.push({
      messageId: message.id,
      prospectId: prospect.id,
      prospectEmail: classification.prospectEmail,
      classification: classification.kind,
      nextStatus:
        classification.kind === 'bounce'
          ? 'lost'
          : classification.kind === 'human_reply'
            ? 'replied'
            : null,
      note,
    })
  }

  return { mutations }
}
