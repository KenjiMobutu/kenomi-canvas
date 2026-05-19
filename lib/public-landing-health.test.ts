import { describe, expect, it } from 'vitest'
import { evaluatePublicLandingHealth } from './public-landing-health'

describe('evaluatePublicLandingHealth', () => {
  it('marks a complete venture landing as ready', () => {
    expect(
      evaluatePublicLandingHealth({
        slug: 'inbox-pulse',
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
        landing: {
          headline: '',
          statut: 'draft',
          copywriting: { hero: { headline: '', subtitle: 'Subline', cta: '' }, features: [] },
        },
        hasTracking: false,
      })
    ).toEqual({
      status: 'repair_required',
      reasons: ['missing_slug', 'landing_not_deployed', 'missing_headline', 'missing_cta', 'tracking_missing'],
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
})
