import { appendProspectActivity } from './activity'
import type { ProspectActivityType, ProspectPipelineStatus } from './types'

export type ProspectStageTransition = 'sent' | 'replied' | 'won' | 'lost'

export function buildProspectStageActivity(input: { nextStatus: ProspectStageTransition }) {
  const eventType: ProspectActivityType =
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

  const pipelineStatus: ProspectPipelineStatus = input.nextStatus
  return { eventType, detail, pipelineStatus }
}

export function buildProspectStagePatch(input: {
  currentMetadata: Record<string, unknown> | null | undefined
  nextStatus: ProspectStageTransition
  nowIso: string
}) {
  const { eventType, detail, pipelineStatus } = buildProspectStageActivity({
    nextStatus: input.nextStatus,
  })

  return {
    status: input.nextStatus,
    pipeline_status: pipelineStatus,
    last_contacted_at: input.nextStatus === 'sent' ? input.nowIso : undefined,
    replied_at: input.nextStatus === 'replied' ? input.nowIso : undefined,
    closed_at: input.nextStatus === 'won' || input.nextStatus === 'lost' ? input.nowIso : undefined,
    metadata: appendProspectActivity(input.currentMetadata, {
      type: eventType,
      actor: 'operator',
      at: input.nowIso,
      detail,
    }),
    last_activity_at: input.nowIso,
    updated_at: input.nowIso,
  }
}
