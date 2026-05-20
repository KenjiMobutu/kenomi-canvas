import { describe, expect, it } from 'vitest'
import { parseAgentOutput } from './agent-output-schemas'

describe('parseAgentOutput', () => {
  it('parse le format Scout legacy en objet structuré', () => {
    const parsed = parseAgentOutput(
      'scout',
      [
        'TITRE: InboxPulse',
        'NICHE: agences B2B',
        'PROBLÈME: les leads email sont mal priorisés',
        'SOLUTION: scoring automatique des conversations',
        'MARCHÉ: agences de prospection outbound',
      ].join('\n')
    )

    expect(parsed).toEqual({
      title: 'InboxPulse',
      niche: 'agences B2B',
      problem: 'les leads email sont mal priorisés',
      solution: 'scoring automatique des conversations',
      market: 'agences de prospection outbound',
    })
  })

  it('valide une sortie Validation JSON stricte', () => {
    const parsed = parseAgentOutput(
      'validation',
      JSON.stringify({
        score: 82,
        tam: '120M EUR',
        cpc: '3.20 EUR',
        seo_difficulty: 'moyen',
        verdict: 'go',
        reason: 'Marché clair. Distribution réaliste.',
      })
    )

    expect(parsed).toMatchObject({ score: 82, verdict: 'go' })
  })

  it('rejette une sortie JSON invalide', () => {
    expect(() => parseAgentOutput('payment', '{"price_amount": "29"}')).toThrow(
      'Invalid payment output'
    )
  })

  it('valide une sortie Marketing avec assets par canal et vidéo faceless', () => {
    const parsed = parseAgentOutput(
      'marketing',
      JSON.stringify({
        channels: ['linkedin', 'tiktok'],
        messages: ['Pain clair', 'CTA checkout'],
        day1: 'Publier LinkedIn',
        day3: 'Publier TikTok faceless',
        day7: 'Retarget waitlist',
        assets: [
          {
            channel: 'linkedin',
            asset_kind: 'post',
            format: 'carousel 5 slides',
            title: 'Stop losing sales notes',
            body: 'Transforme chaque meeting en action commerciale.',
            cta: 'Rejoindre la waitlist',
          },
          {
            channel: 'tiktok',
            asset_kind: 'faceless_video',
            format: '9:16 short',
            title: 'Tes notes te coûtent du revenu',
            body: 'Script vidéo court orienté douleur.',
            cta: 'Essayer maintenant',
            video: {
              hook: 'Tu perds du revenu dans tes notes.',
              voiceover: 'Chaque meeting crée une action qui disparaît.',
              scenes: ['Notes dispersées', 'Dashboard propre'],
              captions: ['Notes perdues', 'Actions claires'],
              visual_prompt: 'SaaS dashboard, no human face',
            },
          },
        ],
      })
    )

    expect(parsed).toMatchObject({
      assets: [
        { channel: 'linkedin', title: 'Stop losing sales notes' },
        { channel: 'tiktok', asset_kind: 'faceless_video' },
      ],
    })
  })

  it('valide une sortie Decision actionnable', () => {
    const parsed = parseAgentOutput(
      'decision',
      JSON.stringify({
        verdict: 'continue',
        confidence: 76,
        rationale: 'Le signal waitlist est suffisant pour continuer.',
        next_step: 'Créer le checkout puis lancer une campagne LinkedIn.',
      })
    )

    expect(parsed).toMatchObject({ verdict: 'continue', confidence: 76 })
  })
})
