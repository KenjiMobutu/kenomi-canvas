export const DIAGNOSTIC_CASH_LANE = {
  offer: {
    slug: '300eur-diagnostic',
    title: '300EUR Diagnostic',
    priceEur: 300,
  },
  segment: {
    slug: 'freelancers-small-agencies',
    title: 'Freelancers / Small Agencies',
  },
  cta: {
    kind: 'book_diagnostic_call',
    title: 'Book diagnostic call',
  },
  messageFamily: {
    slug: 'diagnostic-call-outbound-v1',
    title: 'Diagnostic call outbound v1',
  },
} as const

type ProspectLike = {
  source?: string | null
  segment?: string | null
  offer_variant?: string | null
  contact_email?: string | null
}

export function isDiagnosticLaneProspect(input: ProspectLike): boolean {
  return (
    input.segment === DIAGNOSTIC_CASH_LANE.segment.slug &&
    input.offer_variant === DIAGNOSTIC_CASH_LANE.offer.slug
  )
}

export function isDiagnosticLaneContactableProspect(input: ProspectLike): boolean {
  return isDiagnosticLaneProspect(input) && Boolean(input.contact_email?.includes('@'))
}
