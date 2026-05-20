import { describe, expect, it } from 'vitest'
import { evaluatePublicLandingHealth } from './public-landing-health'

describe('evaluatePublicLandingHealth', () => {
  it('marks a complete venture landing as ready', () => {
    expect(
      evaluatePublicLandingHealth({
        slug: 'inbox-pulse',
        sellableOffer: {
          buyer: 'Agences B2B avec leads email entrants',
          urgentPain: 'Les leads chauds sont traités trop tard et se refroidissent.',
          concretePromise: 'Prioriser les leads les plus proches de l achat chaque matin.',
          priceHypothesisEur: 29,
          acquisitionChannel: 'linkedin',
        },
        landing: {
          headline: 'Priorisez vos leads',
          statut: 'deployed',
          copywriting: {
            hero: {
              headline: 'Priorisez vos leads',
              subtitle: 'Scoring IA pour commerciaux.',
              cta: 'Rejoindre la beta',
            },
            features: [{ title: 'Score', description: 'Score automatique' }],
          },
        },
        hasTracking: true,
      })
    ).toEqual({
      status: 'ready',
      reasons: [],
      repairAction: null,
    })
  })

  it('returns actionable reasons for missing slug, landing, CTA, and tracking', () => {
    expect(
      evaluatePublicLandingHealth({
        slug: '',
        sellableOffer: null,
        landing: {
          headline: '',
          statut: 'draft',
          copywriting: { hero: { headline: '', subtitle: 'Subline', cta: '' }, features: [] },
        },
        hasTracking: false,
      })
    ).toEqual({
      status: 'repair_required',
      reasons: [
        'missing_slug',
        'missing_sellable_offer',
        'landing_not_deployed',
        'missing_headline',
        'missing_cta',
        'tracking_missing',
      ],
      repairAction: {
        label: 'Lancer Builder',
        agentId: 'builder',
      },
    })
  })

  it('marks missing landing distinctly', () => {
    expect(
      evaluatePublicLandingHealth({
        slug: 'inbox-pulse',
        sellableOffer: {
          buyer: 'Agences B2B avec leads email entrants',
          urgentPain: 'Les leads chauds sont traités trop tard et se refroidissent.',
          concretePromise: 'Prioriser les leads les plus proches de l achat chaque matin.',
          priceHypothesisEur: 29,
          acquisitionChannel: 'linkedin',
        },
        landing: null,
        hasTracking: false,
      })
    ).toEqual({
      status: 'missing',
      reasons: ['missing_landing', 'tracking_missing'],
      repairAction: {
        label: 'Lancer Builder',
        agentId: 'builder',
      },
    })
  })

  it('marks generic explanatory copy as repair required when it does not sell the Scout offer', () => {
    expect(
      evaluatePublicLandingHealth({
        slug: 'ai-proposal-cleanup',
        sellableOffer: {
          buyer: 'Solo consultants selling 1k-10k EUR services',
          urgentPain: 'They lose deals because proposals are slow and generic.',
          concretePromise: 'Client-ready proposal in 10 minutes.',
          priceHypothesisEur: 29,
          acquisitionChannel: 'linkedin',
        },
        landing: {
          headline: 'A simple AI app',
          statut: 'deployed',
          copywriting: {
            hero: {
              headline: 'A simple AI app',
              subtitle: 'It helps with productivity.',
              cta: 'Learn more',
            },
            features: [{ title: 'AI', description: 'Uses AI.' }],
          },
        },
        hasTracking: true,
      })
    ).toMatchObject({
      status: 'repair_required',
      reasons: ['missing_sales_copy', 'missing_cta'],
    })
  })
})
