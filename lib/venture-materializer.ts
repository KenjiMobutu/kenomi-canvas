interface PipelineVentureInput {
  userId: string
  ideaTitle: string
  ideaNiche: string
  slug: string
  scoutRaw?: string | null
}

interface BuilderOutput {
  headline: string
  subline: string
  cta: string
  features: string[]
  pricing: string
  buyer: string
  urgent_pain: string
  concrete_promise: string
  price_anchor: string
  objection_handling: string[]
  sections: Array<{ title: string; body: string }>
  faq: Array<{ q: string; a: string }>
}

interface LandingPageInput {
  ventureId: string
  ventureName: string
  builderOutput: BuilderOutput
}

interface MaterializeBuilderOutputInput extends LandingPageInput {
  insertLandingPage: (payload: LandingPageInsert) => Promise<{ error: { message: string } | null }>
}

interface ValidatedIdeaPipelineInput {
  id: string
  idea_title: string
  idea_niche: string
  scout_raw?: string | null
}

interface MaterializeValidatedIdeaInput {
  userId: string
  pipeline: ValidatedIdeaPipelineInput
  slug: string
  nowIso: string
}

function parseScoutOffer(raw: string | null | undefined): Record<string, unknown> {
  if (!raw?.trim().startsWith('{')) return {}
  try {
    const parsed = JSON.parse(raw) as unknown
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

function readString(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : fallback
}

function readPositiveNumber(value: unknown, fallback: number): number {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? n : fallback
}

function buildSellableInsight(input: {
  buyer: string
  urgentPain: string
  concretePromise: string
  offer: string
  priceHypothesisEur: number
  acquisitionChannel: string
  landingAngle: string
}): string {
  return [
    `Acheteur: ${input.buyer}`,
    `Douleur urgente: ${input.urgentPain}`,
    `Promesse: ${input.concretePromise}`,
    `Offre: ${input.offer}`,
    `Prix plausible: ${input.priceHypothesisEur} EUR`,
    `Canal: ${input.acquisitionChannel}`,
    `Angle landing: ${input.landingAngle}`,
  ].join('\n')
}

export function slugifyVentureName(name: string): string {
  const slug = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

  return slug || 'venture'
}

export function buildVentureInsertFromPipeline(input: PipelineVentureInput) {
  const scout = parseScoutOffer(input.scoutRaw)
  const buyer = readString(scout.buyer, input.ideaNiche)
  const urgentPain = readString(scout.urgent_pain, 'Douleur à clarifier avant landing')
  const concretePromise = readString(scout.concrete_promise, 'Promesse à clarifier avant landing')
  const offer = readString(scout.offer, concretePromise)
  const priceHypothesisEur = readPositiveNumber(scout.price_hypothesis_eur, 29)
  const acquisitionChannel = readString(scout.acquisition_channel, 'manual_validation')
  const landingAngle = readString(scout.landing_angle, urgentPain)

  return {
    user_id: input.userId,
    name: input.ideaTitle,
    niche: input.ideaNiche,
    nom: input.ideaTitle,
    slug: input.slug,
    type_produit: 'micro-saas',
    statut: 'draft',
    lifecycle_status: 'draft',
    current_decision: 'continue',
    stage: 'Validation',
    score: 50,
    mrr: '0',
    cac: '0',
    conversion: '0',
    next_action: 'Créer landing et offre publique',
    insight: buildSellableInsight({
      buyer,
      urgentPain,
      concretePromise,
      offer,
      priceHypothesisEur,
      acquisitionChannel,
      landingAngle,
    }),
  }
}

export function materializeValidatedIdea(input: MaterializeValidatedIdeaInput) {
  const venture = buildVentureInsertFromPipeline({
    userId: input.userId,
    ideaTitle: input.pipeline.idea_title,
    ideaNiche: input.pipeline.idea_niche,
    slug: input.slug,
    scoutRaw: input.pipeline.scout_raw,
  })

  return {
    venture,
    pipelinePatch: {
      status: 'approved' as const,
      updated_at: input.nowIso,
    },
  }
}

export function buildLandingPageInsert(input: LandingPageInput) {
  const { builderOutput, ventureId, ventureName } = input
  const normalizedFeatures = builderOutput.features.map((feature, index) => {
    const [rawTitle, ...rest] = feature.split(':')
    const title = rawTitle.trim()
    const detail = rest.join(':').trim()
    return {
      icon: String(index + 1).padStart(2, '0'),
      title: title || `Bénéfice ${index + 1}`,
      description: detail || `Résultat concret: ${title || feature}.`,
    }
  })

  return {
    venture_id: ventureId,
    headline: builderOutput.headline,
    statut: 'deployed',
    health_status: 'ready',
    copywriting: {
      hero: {
        headline: builderOutput.headline,
        subtitle: builderOutput.subline,
        cta: builderOutput.cta,
      },
      features: normalizedFeatures,
      pricing: {
        label: builderOutput.pricing,
        price_anchor: builderOutput.price_anchor,
        included: normalizedFeatures.map((feature) => feature.title),
      },
      proof: {
        headline: `Pensé pour ${builderOutput.buyer.toLowerCase()} confrontés à une douleur urgente.`,
        bullets: [builderOutput.concrete_promise, `Pour ${builderOutput.buyer}`],
      },
      objections: builderOutput.objection_handling.map((answer, index) => ({
        objection: `Objection ${index + 1}`,
        answer,
      })),
      sections: builderOutput.sections,
      audience: {
        for: [builderOutput.buyer],
        not_for: ['Équipes sans volume de leads entrant ou sans besoin de relance rapide'],
      },
      faq: builderOutput.faq,
      meta_title: ventureName,
      meta_desc: builderOutput.subline,
    },
  }
}

export async function findAvailableSlug(
  exists: (slug: string) => Promise<boolean>,
  baseName: string
): Promise<string> {
  const baseSlug = slugifyVentureName(baseName)
  for (let index = 0; index < 50; index += 1) {
    const candidate = index === 0 ? baseSlug : `${baseSlug}-${index + 1}`
    if (!(await exists(candidate))) return candidate
  }
  return `${baseSlug}-${Date.now()}`
}
export type LandingPageInsert = ReturnType<typeof buildLandingPageInsert>

export async function materializeBuilderOutput(
  input: MaterializeBuilderOutputInput
): Promise<LandingPageInsert> {
  const payload = buildLandingPageInsert(input)
  const result = await input.insertLandingPage(payload)
  if (result.error) throw new Error(result.error.message)
  return payload
}
