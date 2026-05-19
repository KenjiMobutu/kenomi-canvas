import type { LandingHealthStatus } from './autonomy/types'

export type PublicLandingHealthReason =
  | 'missing_slug'
  | 'missing_landing'
  | 'landing_not_deployed'
  | 'missing_headline'
  | 'missing_cta'
  | 'tracking_missing'

export interface PublicLandingHealthInput {
  slug: string | null
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

export function evaluatePublicLandingHealth(input: PublicLandingHealthInput): PublicLandingHealth {
  const reasons: PublicLandingHealthReason[] = []

  if (!hasText(input.slug)) reasons.push('missing_slug')
  if (!input.landing) reasons.push('missing_landing')
  if (input.landing && input.landing.statut !== 'deployed') reasons.push('landing_not_deployed')

  const headline = input.landing?.copywriting?.hero?.headline ?? input.landing?.headline
  if (input.landing && !hasText(headline)) reasons.push('missing_headline')
  if (input.landing && !hasText(input.landing.copywriting?.hero?.cta)) reasons.push('missing_cta')
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
