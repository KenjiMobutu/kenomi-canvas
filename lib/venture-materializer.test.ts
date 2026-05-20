import { describe, expect, it } from 'vitest'
import {
  buildLandingPageInsert,
  buildVentureInsertFromPipeline,
  materializeValidatedIdea,
  materializeBuilderOutput,
  slugifyVentureName,
} from './venture-materializer'

describe('slugifyVentureName', () => {
  it('crée un slug stable et public depuis un nom de venture', () => {
    expect(slugifyVentureName('Inbox Pulse IA !')).toBe('inbox-pulse-ia')
  })

  it('retourne un fallback si le nom est vide', () => {
    expect(slugifyVentureName('---')).toBe('venture')
  })
})

describe('buildVentureInsertFromPipeline', () => {
  it('remplit les champs studio et legacy nécessaires à la landing publique', () => {
    const insert = buildVentureInsertFromPipeline({
      userId: 'user-1',
      ideaTitle: 'Inbox Pulse',
      ideaNiche: 'Agences B2B',
      slug: 'inbox-pulse',
    })

    expect(insert).toMatchObject({
      user_id: 'user-1',
      name: 'Inbox Pulse',
      niche: 'Agences B2B',
      nom: 'Inbox Pulse',
      slug: 'inbox-pulse',
      type_produit: 'micro-saas',
      statut: 'draft',
      lifecycle_status: 'draft',
      current_decision: 'continue',
      stage: 'Validation',
      next_action: 'Créer landing et offre publique',
    })
  })
})

describe('materializeValidatedIdea', () => {
  it('materializes a validated Scout offer into a revenue-ready venture draft', () => {
    const result = materializeValidatedIdea({
      userId: 'user-1',
      pipeline: {
        id: 'pipeline-1',
        idea_title: 'AI proposal cleanup',
        idea_niche: 'freelance consultants',
        scout_raw: JSON.stringify({
          buyer: 'Solo consultants selling 1k-10k EUR services',
          urgent_pain: 'They lose deals when proposals take too long.',
          concrete_promise: 'Client-ready proposal in 10 minutes.',
          offer: 'Proposal cleanup in 10 minutes',
          price_hypothesis_eur: 29,
          acquisition_channel: 'linkedin',
          landing_angle: 'Win the deal while the call is still fresh.',
        }),
      },
      slug: 'ai-proposal-cleanup',
      nowIso: '2026-05-20T10:00:00.000Z',
    })

    expect(result.venture).toMatchObject({
      user_id: 'user-1',
      name: 'AI proposal cleanup',
      niche: 'freelance consultants',
      slug: 'ai-proposal-cleanup',
      lifecycle_status: 'draft',
      current_decision: 'continue',
      next_action: 'Créer landing et offre publique',
    })
    expect(result.venture.insight).toContain('Acheteur: Solo consultants')
    expect(result.venture.insight).toContain('Prix plausible: 29 EUR')
    expect(result.pipelinePatch).toMatchObject({
      status: 'approved',
      updated_at: '2026-05-20T10:00:00.000Z',
    })
  })
})

describe('buildLandingPageInsert', () => {
  it('transforme une sortie Builder en copywriting public', () => {
    const insert = buildLandingPageInsert({
      ventureId: 'venture-1',
      ventureName: 'Inbox Pulse',
      builderOutput: {
        headline: 'Priorisez vos leads email',
        subline: 'Un scoring IA pour vos conversations commerciales.',
        cta: 'Rejoindre la beta',
        features: ['Score automatique', 'Alertes chaudes', 'Résumé quotidien'],
        pricing: '29€/mois',
      },
    })

    expect(insert).toEqual({
      venture_id: 'venture-1',
      headline: 'Priorisez vos leads email',
      statut: 'deployed',
      health_status: 'ready',
      copywriting: {
        hero: {
          headline: 'Priorisez vos leads email',
          subtitle: 'Un scoring IA pour vos conversations commerciales.',
          cta: 'Rejoindre la beta',
        },
        features: [
          { icon: '01', title: 'Score automatique', description: 'Score automatique' },
          { icon: '02', title: 'Alertes chaudes', description: 'Alertes chaudes' },
          { icon: '03', title: 'Résumé quotidien', description: 'Résumé quotidien' },
        ],
        faq: [
          {
            q: 'Quand Inbox Pulse sera disponible ?',
            a: 'Les premiers accès sont ouverts progressivement aux inscrits.',
          },
          { q: 'Combien cela coûte ?', a: '29€/mois' },
        ],
        meta_title: 'Inbox Pulse',
        meta_desc: 'Un scoring IA pour vos conversations commerciales.',
      },
    })
  })
})

describe('materializeBuilderOutput', () => {
  it('insère la landing générée et retourne le payload inséré', async () => {
    const inserted: unknown[] = []
    const result = await materializeBuilderOutput({
      ventureId: 'venture-1',
      ventureName: 'Inbox Pulse',
      builderOutput: {
        headline: 'Priorisez vos leads email',
        subline: 'Un scoring IA.',
        cta: 'Rejoindre',
        features: ['Score'],
        pricing: '29€/mois',
      },
      insertLandingPage: async (payload) => {
        inserted.push(payload)
        return { error: null }
      },
    })

    expect(inserted).toHaveLength(1)
    expect(result.headline).toBe('Priorisez vos leads email')
  })

  it('remonte une erreur si la landing ne peut pas être insérée', async () => {
    await expect(
      materializeBuilderOutput({
        ventureId: 'venture-1',
        ventureName: 'Inbox Pulse',
        builderOutput: {
          headline: 'Priorisez vos leads email',
          subline: 'Un scoring IA.',
          cta: 'Rejoindre',
          features: ['Score'],
          pricing: '29€/mois',
        },
        insertLandingPage: async () => ({ error: { message: 'insert failed' } }),
      })
    ).rejects.toThrow('insert failed')
  })
})
