export type VentureCommerceReadinessReason =
  | 'missing_slug'
  | 'missing_landing'
  | 'missing_price_anchor'
  | 'missing_objection_handling'
  | 'missing_believability'
  | 'missing_offer_stack'
  | 'missing_sales_sections'
  | 'missing_payment_config'

export type VentureCommerceReadinessStatus = 'ready' | 'repair_required'

export type CommercialRepairActionId = 'run-builder' | 'repair-landing' | 'run-payment'

export interface CommercialRepairAction {
  id: CommercialRepairActionId
  label: string
  detail: string
  href: string
  agentId?: 'builder' | 'payment'
  tone: 'warn' | 'muted' | 'ok'
}

export interface CommerceVentureRow {
  id: string
  name?: string | null
  slug?: string | null
  stage?: string | null
  statut?: string | null
  lifecycle_status?: string | null
}

export interface CommerceLandingPageRow {
  venture_id?: string | null
  statut?: string | null
  health_status?: string | null
  health_reasons?: string[] | null
}

export interface CommercePipelineRow {
  venture_id?: string | null
  payment_output?: string | null
}

export interface CommercePaymentRow {
  venture_id?: string | null
  checkout_url?: string | null
  provider_status?: string | null
  status?: string | null
}

export interface VentureCommerceReadiness {
  status: VentureCommerceReadinessStatus
  reasons: VentureCommerceReadinessReason[]
  hasSlug: boolean
  hasLanding: boolean
  hasPaymentConfig: boolean
  hasCheckout: boolean
}

function hasText(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length > 0
}

function statusIsReady(value: string | null | undefined): boolean {
  return ['ready', 'deployed', 'completed', 'paid', 'succeeded', 'success'].includes(
    String(value ?? '').toLowerCase()
  )
}

export function isValidatedVenture(venture: CommerceVentureRow): boolean {
  const stage = String(venture.stage ?? '').toLowerCase()
  const statut = String(venture.statut ?? '').toLowerCase()
  const lifecycle = String(venture.lifecycle_status ?? '').toLowerCase()

  return (
    statut === 'actif' ||
    lifecycle === 'approved' ||
    lifecycle === 'active' ||
    ['validation', 'build', 'launch', 'scale'].includes(stage)
  )
}

export function evaluateVentureCommerceReadiness(input: {
  venture: CommerceVentureRow
  landingPages: CommerceLandingPageRow[]
  pipelines: CommercePipelineRow[]
  payments: CommercePaymentRow[]
}): VentureCommerceReadiness {
  const ventureId = input.venture.id
  const hasSlug = hasText(input.venture.slug)
  const ventureLandings = input.landingPages.filter((landing) => landing.venture_id === ventureId)
  const conversionReasons = ventureLandings.flatMap((landing) =>
    Array.isArray(landing.health_reasons)
      ? landing.health_reasons.filter((reason): reason is VentureCommerceReadinessReason =>
          [
            'missing_price_anchor',
            'missing_objection_handling',
            'missing_believability',
            'missing_offer_stack',
            'missing_sales_sections',
          ].includes(reason)
        )
      : []
  )
  const hasLanding = ventureLandings.some(
    (landing) =>
      landing.health_status === 'ready' ||
      (landing.health_status === 'deployed' && conversionReasons.length === 0) ||
      (landing.statut === 'deployed' && conversionReasons.length === 0)
  )
  const hasPaymentConfig = input.pipelines.some(
    (pipeline) => pipeline.venture_id === ventureId && hasText(pipeline.payment_output)
  )
  const hasCheckout = input.payments.some(
    (payment) =>
      payment.venture_id === ventureId &&
      hasText(payment.checkout_url) &&
      (statusIsReady(payment.provider_status) || statusIsReady(payment.status))
  )

  const reasons: VentureCommerceReadinessReason[] = []
  if (!hasSlug) reasons.push('missing_slug')
  if (ventureLandings.length === 0) reasons.push('missing_landing')
  reasons.push(...conversionReasons)
  if (!hasPaymentConfig) reasons.push('missing_payment_config')
  return {
    status: reasons.length === 0 ? 'ready' : 'repair_required',
    reasons: [...new Set(reasons)],
    hasSlug,
    hasLanding,
    hasPaymentConfig,
    hasCheckout,
  }
}

export function getNextCommercialRepairAction(input: {
  ventureName: string
  readiness: VentureCommerceReadiness
}): CommercialRepairAction | null {
  const { readiness, ventureName } = input
  if (readiness.status === 'ready') return null

  if (
    readiness.reasons.some((reason) =>
      [
        'missing_price_anchor',
        'missing_objection_handling',
        'missing_believability',
        'missing_offer_stack',
        'missing_sales_sections',
      ].includes(reason)
    )
  ) {
    return {
      id: 'repair-landing',
      label: 'Renforcer page publique',
      detail: `La landing de ${ventureName} existe mais reste trop faible pour convertir du trafic froid.`,
      href: '/studio/agents',
      agentId: 'builder',
      tone: 'warn',
    }
  }

  if (!readiness.hasSlug || !readiness.hasLanding) {
    return {
      id: 'run-builder',
      label: 'Créer landing',
      detail: `Venture validée sans landing publique dédiée pour ${ventureName}.`,
      href: '/studio/agents',
      agentId: 'builder',
      tone: 'warn',
    }
  }

  if (!readiness.hasPaymentConfig) {
    return {
      id: 'run-payment',
      label: 'Créer paiement',
      detail: 'Landing prête, mais aucune configuration Payment agent dédiée.',
      href: '/studio/agents',
      agentId: 'payment',
      tone: 'warn',
    }
  }
  return null
}
