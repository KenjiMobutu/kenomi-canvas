import type { LandingHealthStatus } from './autonomy/types'

export type PublicLandingHealthReason =
  | 'missing_slug'
  | 'missing_sellable_offer'
  | 'missing_landing'
  | 'landing_not_deployed'
  | 'missing_headline'
  | 'missing_sales_copy'
  | 'missing_cta'
  | 'tracking_missing'

export interface PublicLandingSellableOffer {
  buyer: string
  urgentPain: string
  concretePromise: string
  priceHypothesisEur: number
  acquisitionChannel: string
}

export interface PublicLandingHealthInput {
  slug: string | null
  sellableOffer?: PublicLandingSellableOffer | null
  landing: {
    headline?: string | null
    statut?: string | null
    copywriting?: {
      hero?: {
        headline?: string | null
        subtitle?: string | null
        cta?: string | null
      } | null
      features?: Array<unknown> | null
    } | null
  } | null
  hasTracking: boolean
}

export interface PublicLandingHealth {
  status: LandingHealthStatus
  reasons: PublicLandingHealthReason[]
  repairAction: { label: string; agentId: 'builder' } | null
}

function hasText(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length > 0
}

function normalizedWords(value: string): string[] {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length >= 4)
}

function hasSalesOverlap(copy: string, offer: PublicLandingSellableOffer): boolean {
  const copyWords = new Set(normalizedWords(copy))
  const offerWords = [
    ...normalizedWords(offer.buyer),
    ...normalizedWords(offer.urgentPain),
    ...normalizedWords(offer.concretePromise),
  ]
  return offerWords.some((word) => copyWords.has(word))
}

function isActionCta(value: string | null | undefined): boolean {
  if (typeof value !== 'string' || !hasText(value)) return false
  const normalized = value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
  return [
    'buy',
    'acheter',
    'commander',
    'get access',
    'start',
    'demarrer',
    'rejoindre',
    'essayer',
  ].some((token) => normalized.includes(token))
}

function hasSellableOffer(
  offer: PublicLandingSellableOffer | null | undefined
): offer is PublicLandingSellableOffer {
  return Boolean(
    offer &&
    hasText(offer.buyer) &&
    hasText(offer.urgentPain) &&
    hasText(offer.concretePromise) &&
    Number.isFinite(offer.priceHypothesisEur) &&
    offer.priceHypothesisEur > 0 &&
    hasText(offer.acquisitionChannel)
  )
}

export function evaluatePublicLandingHealth(input: PublicLandingHealthInput): PublicLandingHealth {
  const reasons: PublicLandingHealthReason[] = []

  if (!hasText(input.slug)) reasons.push('missing_slug')
  if (!hasSellableOffer(input.sellableOffer)) reasons.push('missing_sellable_offer')
  if (!input.landing) reasons.push('missing_landing')
  if (input.landing && input.landing.statut !== 'deployed') reasons.push('landing_not_deployed')

  const headline = input.landing?.copywriting?.hero?.headline ?? input.landing?.headline
  const subtitle = input.landing?.copywriting?.hero?.subtitle
  if (input.landing && !hasText(headline)) reasons.push('missing_headline')
  if (
    input.landing &&
    hasSellableOffer(input.sellableOffer) &&
    !hasSalesOverlap(`${headline ?? ''} ${subtitle ?? ''}`, input.sellableOffer)
  ) {
    reasons.push('missing_sales_copy')
  }
  if (input.landing && !isActionCta(input.landing.copywriting?.hero?.cta)) {
    reasons.push('missing_cta')
  }
  if (!input.hasTracking) reasons.push('tracking_missing')

  if (reasons.length === 0) {
    return {
      status: 'ready',
      reasons: [],
      repairAction: null,
    }
  }

  return {
    status: reasons.includes('missing_landing') ? 'missing' : 'repair_required',
    reasons,
    repairAction: {
      label: 'Lancer Builder',
      agentId: 'builder',
    },
  }
}
