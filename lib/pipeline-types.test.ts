// lib/pipeline-types.test.ts
import { describe, it, expect } from 'vitest'
import { AGENT_CHAIN, nextAgentInChain, isAgentUnlocked, parsePipelineIdea } from './pipeline-types'

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
})
