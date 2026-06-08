export const DIAGNOSTIC_CASH_LANE = {
  offer: {
    slug: '300eur-diagnostic',
    title: '300EUR Diagnostic',
    priceEur: 300,
  },
  landing: {
    slug: 'diagnostic-300',
    path: '/diagnostic-300',
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

export function getDiagnosticCashLaneUrl(env: NodeJS.ProcessEnv = process.env): string {
  const rawOrigin = env.APP_ORIGIN?.trim() || env.NEXT_PUBLIC_SITE_URL?.trim() || 'https://lab.kenomi.eu'

  try {
    return new URL(DIAGNOSTIC_CASH_LANE.landing.path, rawOrigin).toString()
  } catch {
    return `https://lab.kenomi.eu${DIAGNOSTIC_CASH_LANE.landing.path}`
  }
}

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
