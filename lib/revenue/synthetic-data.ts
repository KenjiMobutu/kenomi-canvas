const SYNTHETIC_MARKER = /(^|[\s:._/-])(smoke|bootstrap)(?=$|[\s:._/-])/i

function hasMarkerInString(value: string | null | undefined) {
  return typeof value === 'string' && SYNTHETIC_MARKER.test(value)
}

export function hasSyntheticBusinessMarker(value: unknown): boolean {
  if (value == null) return false
  if (typeof value === 'string') return hasMarkerInString(value)
  if (Array.isArray(value)) return value.some((entry) => hasSyntheticBusinessMarker(entry))
  if (typeof value === 'object') {
    return Object.values(value as Record<string, unknown>).some((entry) => hasSyntheticBusinessMarker(entry))
  }
  return false
}

export function isSyntheticOfferRow(row: { id?: string | null; name?: string | null }) {
  return hasSyntheticBusinessMarker(row.id) || hasMarkerInString(row.name)
}

export function isSyntheticProspectRow(row: {
  id?: string | null
  company_name?: string | null
  source?: string | null
  band?: string | null
  offer_variant?: string | null
  outreach_angle?: string | null
  metadata?: Record<string, unknown> | null
}) {
  return (
    hasSyntheticBusinessMarker(row.id) ||
    hasMarkerInString(row.company_name) ||
    hasMarkerInString(row.source) ||
    hasMarkerInString(row.band) ||
    hasMarkerInString(row.offer_variant) ||
    hasMarkerInString(row.outreach_angle) ||
    hasSyntheticBusinessMarker(row.metadata)
  )
}

export function isSyntheticPaymentAttributionRow(row: {
  prospect_id?: string | null
  offer_id?: string | null
  offer_variant?: string | null
  outreach_angle?: string | null
  source?: string | null
  band?: string | null
}) {
  return (
    hasSyntheticBusinessMarker(row.prospect_id) ||
    hasSyntheticBusinessMarker(row.offer_id) ||
    hasMarkerInString(row.offer_variant) ||
    hasMarkerInString(row.outreach_angle) ||
    hasMarkerInString(row.source) ||
    hasMarkerInString(row.band)
  )
}

export function isSyntheticVentureRow(row: {
  id?: string | null
  name?: string | null
  slug?: string | null
  next_action?: string | null
}) {
  return (
    hasSyntheticBusinessMarker(row.id) ||
    hasMarkerInString(row.name) ||
    hasMarkerInString(row.slug) ||
    hasMarkerInString(row.next_action)
  )
}
