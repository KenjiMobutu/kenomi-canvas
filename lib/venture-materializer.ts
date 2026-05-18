interface PipelineVentureInput {
  userId: string
  ideaTitle: string
  ideaNiche: string
  slug: string
}

interface BuilderOutput {
  headline: string
  subline: string
  cta: string
  features: string[]
  pricing: string
}

interface LandingPageInput {
  ventureId: string
  ventureName: string
  builderOutput: BuilderOutput
}

interface MaterializeBuilderOutputInput extends LandingPageInput {
  insertLandingPage: (payload: LandingPageInsert) => Promise<{ error: { message: string } | null }>
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
  return {
    user_id: input.userId,
    name: input.ideaTitle,
    niche: input.ideaNiche,
    nom: input.ideaTitle,
    slug: input.slug,
    type_produit: 'micro-saas',
    statut: 'actif',
    stage: 'Validation',
    score: 50,
    mrr: '0',
    cac: '0',
    conversion: '0',
    next_action: 'Lancer agent Validation',
    insight: 'Idée générée par Scout',
  }
}

export function buildLandingPageInsert(input: LandingPageInput) {
  const { builderOutput, ventureId, ventureName } = input

  return {
    venture_id: ventureId,
    headline: builderOutput.headline,
    statut: 'deployed',
    copywriting: {
      hero: {
        headline: builderOutput.headline,
        subtitle: builderOutput.subline,
        cta: builderOutput.cta,
      },
      features: builderOutput.features.map((feature, index) => ({
        icon: String(index + 1).padStart(2, '0'),
        title: feature,
        description: feature,
      })),
      faq: [
        {
          q: `Quand ${ventureName} sera disponible ?`,
          a: 'Les premiers accès sont ouverts progressivement aux inscrits.',
        },
        {
          q: 'Combien cela coûte ?',
          a: builderOutput.pricing,
        },
      ],
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
    if (!await exists(candidate)) return candidate
  }
  return `${baseSlug}-${Date.now()}`
}
export type LandingPageInsert = ReturnType<typeof buildLandingPageInsert>

export async function materializeBuilderOutput(input: MaterializeBuilderOutputInput): Promise<LandingPageInsert> {
  const payload = buildLandingPageInsert(input)
  const result = await input.insertLandingPage(payload)
  if (result.error) throw new Error(result.error.message)
  return payload
}
