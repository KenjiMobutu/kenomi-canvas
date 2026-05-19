export type FreshnessStatus = 'fresh' | 'stale' | 'missing'

export interface SourceStatus {
  source: string
  checkedAt: string | null
  freshness: FreshnessStatus
  repairHref: string
  emptyLabel: string
}

export function getFreshnessStatus(
  checkedAt: string | null,
  now: Date = new Date(),
  staleAfterMinutes = 15
): FreshnessStatus {
  if (!checkedAt) return 'missing'
  const checkedMs = Date.parse(checkedAt)
  if (!Number.isFinite(checkedMs)) return 'missing'
  const ageMs = now.getTime() - checkedMs
  return ageMs <= staleAfterMinutes * 60_000 ? 'fresh' : 'stale'
}

export function makeSourceStatus(input: {
  source: string
  checkedAt: string | null
  repairHref: string
  emptyLabel: string
  now?: Date
  staleAfterMinutes?: number
}): SourceStatus {
  return {
    source: input.source,
    checkedAt: input.checkedAt,
    freshness: getFreshnessStatus(input.checkedAt, input.now, input.staleAfterMinutes),
    repairHref: input.repairHref,
    emptyLabel: input.emptyLabel,
  }
}
