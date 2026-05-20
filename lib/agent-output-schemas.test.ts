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

    expect(parsed).toMatchObject({
      title: 'InboxPulse',
      niche: 'agences B2B',
      problem: 'les leads email sont mal priorisés',
      solution: 'scoring automatique des conversations',
      market: 'agences de prospection outbound',
      buyer: 'agences de prospection outbound',
      urgent_pain: 'les leads email sont mal priorisés',
      concrete_promise: 'scoring automatique des conversations',
      price_hypothesis_eur: 29,
    })
  })

  it('requires Scout ideas to be sellable offers, not just interesting ideas', () => {
    const parsed = parseAgentOutput(
      'scout',
      JSON.stringify({
        title: 'AI proposal cleanup for freelancers',
        niche: 'freelance consultants',
        buyer: 'Solo consultants selling 1k-10k EUR services',
        urgent_pain: 'Consultants lose deals because proposals are slow and generic.',
        concrete_promise: 'Upload messy notes, get a client-ready proposal in 10 minutes.',
        offer: 'Proposal cleanup and rewrite for one client opportunity.',
        price_hypothesis_eur: 29,
        acquisition_channel: 'linkedin',
        landing_angle: 'Win the deal before the client forgets the call.',
        evidence: ['Freelancers post proposal bottlenecks daily in public communities.'],
        confidence: 72,
      })
    )

    expect(parsed).toMatchObject({
      buyer: expect.stringContaining('consultants'),
      urgent_pain: expect.stringContaining('lose deals'),
      concrete_promise: expect.stringContaining('10 minutes'),
      price_hypothesis_eur: 29,
      acquisition_channel: 'linkedin',
      landing_angle: expect.stringContaining('Win the deal'),
    })
  })

  it('rejects generic Scout ideas without a buyer, urgent pain, promise, price and channel', () => {
    expect(() =>
      parseAgentOutput(
        'scout',
        JSON.stringify({
          title: 'Interesting AI thing',
          niche: 'founders',
          problem: 'Too much admin',
          solution: 'Use AI',
          market: 'startups',
        })
      )
    ).toThrow('Invalid scout output')
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

  it('requires Builder output to produce sales copy from the sellable offer', () => {
    const parsed = parseAgentOutput(
      'builder',
      JSON.stringify({
        headline: 'Win the deal before the client forgets the call',
        subline:
          'For solo consultants: turn messy call notes into a stronger proposal in 10 minutes.',
        cta: 'Buy now',
        features: [
          'Built for solo consultants',
          'Fixes proposal delay after sales calls',
          'Client-ready proposal in 10 minutes',
        ],
        pricing: '29 EUR one-time',
        buyer: 'Solo consultants selling 1k-10k EUR services',
        urgent_pain: 'Proposal delay causes warm leads to go cold.',
        concrete_promise: 'Client-ready proposal in 10 minutes.',
        price_anchor: 'Costs less than 2% of a 1,500 EUR client project.',
        objection_handling: [
          'Works from rough notes.',
          'No template setup required.',
          'Designed for one urgent proposal at a time.',
        ],
        sections: [
          {
            title: 'Built for urgent follow-up',
            body: 'Paste call notes and get a polished proposal while the opportunity is still warm.',
          },
          {
            title: 'Why buy now',
            body: 'The faster you send a clean proposal, the less likely the deal goes cold.',
          },
        ],
        faq: [
          { q: 'Who is this for?', a: 'Solo consultants with active client opportunities.' },
          { q: 'How is it priced?', a: '29 EUR one-time for one urgent proposal workflow.' },
        ],
      })
    )

    expect(parsed).toMatchObject({
      cta: 'Buy now',
      buyer: 'Solo consultants selling 1k-10k EUR services',
      price_anchor: expect.stringContaining('1,500 EUR'),
    })
  })

  it('rejects Builder output that lacks pricing anchor, objections, sections and faq', () => {
    expect(() =>
      parseAgentOutput(
        'builder',
        JSON.stringify({
          headline: 'Win the deal before the client forgets the call',
          subline:
            'For solo consultants: turn messy call notes into a stronger proposal in 10 minutes.',
          cta: 'Buy now',
          features: ['Proposal cleanup', 'Fast turnaround'],
          pricing: '29 EUR one-time',
          buyer: 'Solo consultants selling 1k-10k EUR services',
          urgent_pain: 'Proposal delay causes warm leads to go cold.',
          concrete_promise: 'Client-ready proposal in 10 minutes.',
        })
      )
    ).toThrow('Invalid builder output')
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
