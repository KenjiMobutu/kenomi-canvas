export type RevenueCadenceStatusValue = 'live' | 'stale' | 'missing'

export interface RevenueCadenceEvent {
  event_type: string
  created_at: string | null
}

export interface RevenueCadenceStatus {
  status: RevenueCadenceStatusValue
  lastRunAt: string | null
  nextExpectedAt: string | null
  hoursSinceLastRun: number | null
  detail: string
}

export function buildRevenueCadenceStatus(input: {
  events: RevenueCadenceEvent[]
  now?: Date
  expectedEveryHours?: number
  staleAfterHours?: number
}): RevenueCadenceStatus {
  const now = input.now ?? new Date()
  const expectedEveryHours = input.expectedEveryHours ?? 24
  const staleAfterHours = input.staleAfterHours ?? 30
  const latest = input.events
    .filter((event) => event.event_type === 'revenue.daily_cycle.completed' && event.created_at)
    .sort((a, b) => Date.parse(b.created_at ?? '') - Date.parse(a.created_at ?? ''))[0]

  if (!latest?.created_at) {
    return {
      status: 'missing',
      lastRunAt: null,
      nextExpectedAt: null,
      hoursSinceLastRun: null,
      detail: 'Aucun daily cycle revenue audité.',
    }
  }

  const lastRunMs = Date.parse(latest.created_at)
  const hoursSinceLastRun = Number(((now.getTime() - lastRunMs) / 3_600_000).toFixed(1))
  const nextExpectedAt = new Date(lastRunMs + expectedEveryHours * 3_600_000).toISOString()
  const status: RevenueCadenceStatusValue = hoursSinceLastRun <= staleAfterHours ? 'live' : 'stale'

  return {
    status,
    lastRunAt: latest.created_at,
    nextExpectedAt,
    hoursSinceLastRun,
    detail:
      status === 'live'
        ? `Dernier cycle il y a ${hoursSinceLastRun}h.`
        : `Dernier cycle il y a ${hoursSinceLastRun}h, au-delà du seuil ${staleAfterHours}h.`,
  }
}
