import type { ProspectActivityEvent } from './types'

export function appendProspectActivity(
  metadata: Record<string, unknown> | null | undefined,
  event: ProspectActivityEvent
) {
  const base = metadata && typeof metadata === 'object' ? metadata : {}
  const current = Array.isArray((base as Record<string, unknown>).activity)
    ? ((base as Record<string, unknown>).activity as ProspectActivityEvent[])
    : []

  return {
    ...base,
    activity: [...current, event],
  }
}
