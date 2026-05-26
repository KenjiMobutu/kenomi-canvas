import type { ProspectActivityType } from '@/lib/prospect/types'

export function buildProspectActivityInsert(input: {
  prospectId: string
  userId: string
  type: ProspectActivityType
  detail: string
  metadata?: Record<string, unknown>
  nowIso?: string
}) {
  return {
    prospect_id: input.prospectId,
    user_id: input.userId,
    type: input.type,
    detail: input.detail,
    metadata: input.metadata ?? {},
    created_at: input.nowIso ?? new Date().toISOString(),
  }
}
