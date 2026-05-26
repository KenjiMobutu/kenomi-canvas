import { appendProspectActivity } from './activity'

export type ProspectStageTransition = 'sent' | 'replied' | 'won' | 'lost'

export function buildProspectStagePatch(input: {
  currentMetadata: Record<string, unknown> | null | undefined
  nextStatus: ProspectStageTransition
  nowIso: string
}) {
  const eventType =
    input.nextStatus === 'sent'
      ? 'marked_sent'
      : input.nextStatus === 'replied'
        ? 'marked_replied'
        : input.nextStatus === 'won'
          ? 'marked_won'
          : 'marked_lost'

  const detail =
    input.nextStatus === 'sent'
      ? 'Prospect marked sent'
      : input.nextStatus === 'replied'
        ? 'Prospect marked replied'
        : input.nextStatus === 'won'
          ? 'Prospect marked won'
          : 'Prospect marked lost'

  return {
    status: input.nextStatus,
    last_contacted_at: input.nextStatus === 'sent' ? input.nowIso : undefined,
    replied_at: input.nextStatus === 'replied' ? input.nowIso : undefined,
    closed_at: input.nextStatus === 'won' || input.nextStatus === 'lost' ? input.nowIso : undefined,
    metadata: appendProspectActivity(input.currentMetadata, {
      type: eventType,
      actor: 'operator',
      at: input.nowIso,
      detail,
    }),
    updated_at: input.nowIso,
  }
}
