// lib/pipeline-types.test.ts
import { describe, it, expect } from 'vitest'
import {
  AGENT_CHAIN,
  nextAgentInChain,
  isAgentUnlocked,
  parsePipelineIdea,
  buildSystemPrompt,
} from './pipeline-types'

describe('AGENT_CHAIN', () => {
  it('contient 6 agents dans le bon ordre', () => {
    expect(AGENT_CHAIN).toEqual([
      'scout',
      'validation',
      'builder',
      'payment',
      'marketing',
      'decision',
    ])
  })
})

describe('nextAgentInChain', () => {
  it('retourne le suivant pour scout', () => {
    expect(nextAgentInChain('scout')).toBe('validation')
  })
  it('retourne le suivant pour validation', () => {
    expect(nextAgentInChain('validation')).toBe('builder')
  })
  it('retourne null pour decision (dernier)', () => {
    expect(nextAgentInChain('decision')).toBeNull()
  })
  it('retourne null pour un agent hors chaîne', () => {
    expect(nextAgentInChain('unknown')).toBeNull()
  })
})

describe('isAgentUnlocked', () => {
  it('scout est toujours débloqué', () => {
    expect(isAgentUnlocked('scout', null)).toBe(true)
  })
  it('prospect est toujours débloqué', () => {
    expect(isAgentUnlocked('prospect', null)).toBe(true)
  })
  it('validation est bloqué si pas de pipeline approved', () => {
    expect(isAgentUnlocked('validation', null)).toBe(false)
  })
  it('validation est débloqué si pipeline approved et validation_output null', () => {
    expect(
      isAgentUnlocked('validation', {
        status: 'approved',
        validation_output: null,
        builder_output: null,
        payment_output: null,
        marketing_output: null,
        decision_output: null,
      })
    ).toBe(true)
  })
  it('validation est bloqué si déjà exécuté', () => {
    expect(
      isAgentUnlocked('validation', {
        status: 'approved',
        validation_output: 'done',
        builder_output: null,
        payment_output: null,
        marketing_output: null,
        decision_output: null,
      })
    ).toBe(false)
  })
  it('builder est bloqué si validation_output null', () => {
    expect(
      isAgentUnlocked('builder', {
        status: 'approved',
        validation_output: null,
        builder_output: null,
        payment_output: null,
        marketing_output: null,
        decision_output: null,
      })
    ).toBe(false)
  })
  it('builder est débloqué si validation_output présent', () => {
    expect(
      isAgentUnlocked('builder', {
        status: 'approved',
        validation_output: 'ok',
        builder_output: null,
        payment_output: null,
        marketing_output: null,
        decision_output: null,
      })
    ).toBe(true)
  })
})

describe('parsePipelineIdea', () => {
  it('parse un output Scout bien formaté', () => {
    const raw = `TITRE: SaaS RH
NICHE: RH / PME
PROBLÈME: Onboarding chaotique
SOLUTION: Workflow automatisé
MARCHÉ: PME 10-50 salariés`
    const result = parsePipelineIdea(raw)
    expect(result.idea_title).toBe('SaaS RH')
    expect(result.idea_niche).toBe('RH / PME')
    expect(result.idea_problem).toBe('Onboarding chaotique')
    expect(result.idea_solution).toBe('Workflow automatisé')
    expect(result.idea_market).toBe('PME 10-50 salariés')
  })
  it('retourne des chaînes vides si format invalide', () => {
    const result = parsePipelineIdea('réponse libre sans format')
    expect(result.idea_title).toBe('')
  })

  it('parse un output Scout JSON vendable', () => {
    const result = parsePipelineIdea(
      JSON.stringify({
        title: 'AI proposal cleanup',
        niche: 'freelance consultants',
        buyer: 'Solo consultants selling 1k-10k EUR services',
        urgent_pain: 'They lose deals when proposals take too long.',
        concrete_promise: 'Client-ready proposal in 10 minutes.',
        offer: 'Proposal cleanup in 10 minutes',
        price_hypothesis_eur: 29,
        acquisition_channel: 'linkedin',
        landing_angle: 'Win the deal while the call is still fresh.',
      })
    )

    expect(result).toMatchObject({
      idea_title: 'AI proposal cleanup',
      idea_niche: 'freelance consultants',
      idea_problem: 'They lose deals when proposals take too long.',
      idea_solution: 'Client-ready proposal in 10 minutes.',
      idea_market: 'Solo consultants selling 1k-10k EUR services',
    })
  })
})

describe('buildSystemPrompt', () => {
  it('injects the Scout sellable offer into Builder prompts', () => {
    const prompt = buildSystemPrompt(
      'builder',
      {
        id: 'pipeline-1',
        user_id: 'user-1',
        idea_title: 'AI proposal cleanup',
        idea_niche: 'freelance consultants',
        idea_problem: 'They lose deals when proposals take too long.',
        idea_solution: 'Client-ready proposal in 10 minutes.',
        idea_market: 'Solo consultants',
        scout_raw: JSON.stringify({
          buyer: 'Solo consultants selling 1k-10k EUR services',
          urgent_pain: 'They lose deals when proposals take too long.',
          concrete_promise: 'Client-ready proposal in 10 minutes.',
          price_hypothesis_eur: 29,
          acquisition_channel: 'linkedin',
          landing_angle: 'Win the deal while the call is still fresh.',
        }),
        status: 'approved',
        validation_output: 'ok',
        validation_score: 82,
        builder_output: null,
        payment_output: null,
        marketing_output: null,
        decision_output: null,
        venture_id: 'venture-1',
        current_agent: null,
        created_at: '2026-05-20T10:00:00.000Z',
        updated_at: '2026-05-20T10:00:00.000Z',
      },
      ''
    )

    expect(prompt).toContain('Acheteur: Solo consultants')
    expect(prompt).toContain('Douleur urgente: They lose deals')
    expect(prompt).toContain('La landing doit vendre cette offre')
  })

  it('creates a strict Prospect system prompt', () => {
    const prompt = buildSystemPrompt('prospect', null, '')

    expect(prompt).toContain('Prospect')
    expect(prompt).toContain('JSON strict')
    expect(prompt).toContain('company_name')
    expect(prompt).toContain('outreach_body')
  })
})
