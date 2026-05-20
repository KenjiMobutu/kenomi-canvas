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
              headline: 'Priorisez vos leads les plus chauds avant vos concurrents',
              subtitle:
                'Pour agences B2B: remontez chaque matin les conversations à relancer avant qu elles refroidissent.',
              cta: 'Acheter maintenant',
            },
            features: [{ title: 'Score', description: 'Score automatique' }],
            pricing: {
              label: '29 EUR / mois',
              price_anchor: 'Moins qu une heure perdue sur un lead tiède.',
              included: ['Scoring', 'Alertes', 'Résumé quotidien'],
            },
            objections: [
              {
                objection: 'Nous avons déjà un CRM.',
                answer: 'Inbox Pulse priorise les relances chaudes au-dessus du CRM existant.',
              },
            ],
            proof: {
              headline:
                'Pensé pour des cycles de vente courts et des leads qui refroidissent vite.',
              bullets: ['Promesse claire', 'Offre ciblée', 'Usage immédiat'],
            },
            sections: [
              {
                title: 'Pourquoi maintenant',
                body: 'Chaque heure perdue entre un call et un follow-up coûte du revenu.',
              },
            ],
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
        'missing_price_anchor',
        'missing_objection_handling',
        'missing_believability',
        'missing_offer_stack',
        'missing_sales_sections',
        'tracking_missing',
      ],
      repairAction: {
        label: 'Regenerer la landing de vente',
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
        label: 'Regenerer la landing de vente',
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
      reasons: [
        'missing_sales_copy',
        'missing_cta',
        'missing_price_anchor',
        'missing_objection_handling',
        'missing_believability',
        'missing_offer_stack',
        'missing_sales_sections',
      ],
    })
  })

  it('rejects a generic landing even when headline, CTA and tracking exist', () => {
    expect(
      evaluatePublicLandingHealth({
        slug: 'proposal-fast',
        sellableOffer: {
          buyer: 'Solo consultants selling 1k-10k EUR services',
          urgentPain: 'They lose deals because proposals are slow and generic.',
          concretePromise: 'Client-ready proposal in 10 minutes.',
          priceHypothesisEur: 29,
          acquisitionChannel: 'linkedin',
        },
        landing: {
          headline: 'Win the deal before the client forgets the call',
          statut: 'deployed',
          copywriting: {
            hero: {
              headline: 'Win the deal before the client forgets the call',
              subtitle:
                'For solo consultants: turn messy call notes into a stronger proposal in 10 minutes.',
              cta: 'Buy now',
            },
            features: [
              { title: 'Proposal cleanup', description: 'Proposal cleanup in 10 minutes.' },
            ],
          },
        },
        hasTracking: true,
      })
    ).toMatchObject({
      status: 'repair_required',
      reasons: [
        'missing_price_anchor',
        'missing_objection_handling',
        'missing_believability',
        'missing_offer_stack',
        'missing_sales_sections',
      ],
    })
  })
})
