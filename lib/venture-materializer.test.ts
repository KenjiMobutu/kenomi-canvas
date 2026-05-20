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
        headline: 'Priorisez vos leads email avant qu ils refroidissent',
        subline:
          'Pour agences B2B: identifiez chaque matin les conversations à relancer avant vos concurrents.',
        cta: 'Acheter maintenant',
        features: [
          'Score automatique: classe chaque lead par probabilité de réponse.',
          'Alertes chaudes: remonte les conversations à traiter aujourd hui.',
          'Résumé quotidien: donne un plan de relance concret avant 9h.',
        ],
        pricing: '29€/mois',
        buyer: 'Agences B2B avec leads email entrants',
        urgent_pain: 'Les leads chauds sont traités trop tard et se refroidissent.',
        concrete_promise: 'Prioriser les leads les plus proches de l achat chaque matin.',
        price_anchor: 'Moins qu une heure perdue sur un lead tiède.',
        objection_handling: [
          'Vous gardez votre CRM actuel.',
          'Aucun setup lourd avant la première liste priorisée.',
        ],
        sections: [
          {
            title: 'Comment ça marche',
            body: 'Connectez votre pipeline, récupérez une liste priorisée et relancez avant midi.',
          },
          {
            title: 'Pourquoi maintenant',
            body: 'Chaque heure de retard après un signal entrant réduit vos chances de réponse.',
          },
        ],
        faq: [
          {
            q: 'Qui doit utiliser Inbox Pulse ?',
            a: 'Les agences B2B qui gèrent des leads entrants.',
          },
          { q: 'Quel est le prix ?', a: '29€/mois, sans setup lourd.' },
        ],
      },
    })

    expect(insert).toEqual({
      venture_id: 'venture-1',
      headline: 'Priorisez vos leads email avant qu ils refroidissent',
      statut: 'deployed',
      health_status: 'ready',
      copywriting: {
        hero: {
          headline: 'Priorisez vos leads email avant qu ils refroidissent',
          subtitle:
            'Pour agences B2B: identifiez chaque matin les conversations à relancer avant vos concurrents.',
          cta: 'Acheter maintenant',
        },
        features: [
          {
            icon: '01',
            title: 'Score automatique',
            description: 'classe chaque lead par probabilité de réponse.',
          },
          {
            icon: '02',
            title: 'Alertes chaudes',
            description: 'remonte les conversations à traiter aujourd hui.',
          },
          {
            icon: '03',
            title: 'Résumé quotidien',
            description: 'donne un plan de relance concret avant 9h.',
          },
        ],
        pricing: {
          label: '29€/mois',
          price_anchor: 'Moins qu une heure perdue sur un lead tiède.',
          included: ['Score automatique', 'Alertes chaudes', 'Résumé quotidien'],
        },
        proof: {
          headline:
            'Pensé pour agences b2b avec leads email entrants confrontés à une douleur urgente.',
          bullets: [
            'Prioriser les leads les plus proches de l achat chaque matin.',
            'Pour Agences B2B avec leads email entrants',
          ],
        },
        objections: [
          {
            objection: 'Objection 1',
            answer: 'Vous gardez votre CRM actuel.',
          },
          {
            objection: 'Objection 2',
            answer: 'Aucun setup lourd avant la première liste priorisée.',
          },
        ],
        sections: [
          {
            title: 'Comment ça marche',
            body: 'Connectez votre pipeline, récupérez une liste priorisée et relancez avant midi.',
          },
          {
            title: 'Pourquoi maintenant',
            body: 'Chaque heure de retard après un signal entrant réduit vos chances de réponse.',
          },
        ],
        audience: {
          for: ['Agences B2B avec leads email entrants'],
          not_for: ['Équipes sans volume de leads entrant ou sans besoin de relance rapide'],
        },
        faq: [
          {
            q: 'Qui doit utiliser Inbox Pulse ?',
            a: 'Les agences B2B qui gèrent des leads entrants.',
          },
          { q: 'Quel est le prix ?', a: '29€/mois, sans setup lourd.' },
        ],
        meta_title: 'Inbox Pulse',
        meta_desc:
          'Pour agences B2B: identifiez chaque matin les conversations à relancer avant vos concurrents.',
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
        features: ['Score: priorise vos relances du jour'],
        pricing: '29€/mois',
        buyer: 'Agences B2B avec leads email entrants',
        urgent_pain: 'Les leads chauds sont traités trop tard.',
        concrete_promise: 'Prioriser les leads les plus proches de l achat chaque matin.',
        price_anchor: 'Moins qu une heure perdue sur un lead tiède.',
        objection_handling: ['Vous gardez votre CRM.', 'Aucun setup lourd.'],
        sections: [
          { title: 'Comment ça marche', body: 'Priorisez et relancez.' },
          { title: 'Pourquoi maintenant', body: 'Chaque heure compte.' },
        ],
        faq: [
          { q: 'Pour qui ?', a: 'Agences B2B.' },
          { q: 'Quel prix ?', a: '29€/mois.' },
        ],
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
          features: ['Score: priorise vos relances du jour'],
          pricing: '29€/mois',
          buyer: 'Agences B2B avec leads email entrants',
          urgent_pain: 'Les leads chauds sont traités trop tard.',
          concrete_promise: 'Prioriser les leads les plus proches de l achat chaque matin.',
          price_anchor: 'Moins qu une heure perdue sur un lead tiède.',
          objection_handling: ['Vous gardez votre CRM.', 'Aucun setup lourd.'],
          sections: [
            { title: 'Comment ça marche', body: 'Priorisez et relancez.' },
            { title: 'Pourquoi maintenant', body: 'Chaque heure compte.' },
          ],
          faq: [
            { q: 'Pour qui ?', a: 'Agences B2B.' },
            { q: 'Quel prix ?', a: '29€/mois.' },
          ],
        },
        insertLandingPage: async () => ({ error: { message: 'insert failed' } }),
      })
    ).rejects.toThrow('insert failed')
  })
})
