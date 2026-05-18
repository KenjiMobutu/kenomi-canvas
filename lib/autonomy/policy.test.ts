import { describe, expect, it } from 'vitest'
import { requiresApproval } from './policy'
import type { AutonomyAction } from './types'

function action(overrides: Partial<AutonomyAction>): AutonomyAction {
  return {
    actionType: 'run_agent',
    riskLevel: 'low',
    environment: 'development',
    estimatedCostEur: 0,
    ...overrides,
  }
}

describe('requiresApproval', () => {
  it('autorise les actions low-risk sans approbation', () => {
    expect(requiresApproval(action({ actionType: 'run_agent' }))).toBe(false)
    expect(requiresApproval(action({ actionType: 'create_landing' }))).toBe(false)
  })

  it('demande une approbation pour checkout et deploy en production', () => {
    expect(requiresApproval(action({ actionType: 'create_checkout', environment: 'production', riskLevel: 'medium' }))).toBe(true)
    expect(requiresApproval(action({ actionType: 'deploy', environment: 'production', riskLevel: 'medium' }))).toBe(true)
  })

  it('autorise checkout et deploy hors production', () => {
    expect(requiresApproval(action({ actionType: 'create_checkout', environment: 'staging', riskLevel: 'medium' }))).toBe(false)
    expect(requiresApproval(action({ actionType: 'deploy', environment: 'development', riskLevel: 'medium' }))).toBe(false)
  })

  it('bloque toujours les actions à risque business', () => {
    expect(requiresApproval(action({ actionType: 'publish_campaign', riskLevel: 'high' }))).toBe(true)
    expect(requiresApproval(action({ actionType: 'scale_budget', riskLevel: 'critical' }))).toBe(true)
    expect(requiresApproval(action({ actionType: 'stop_venture', riskLevel: 'high' }))).toBe(true)
  })

  it('bloque toute action au-dessus du budget autorisé', () => {
    expect(requiresApproval(action({ estimatedCostEur: 75, budgetCapEur: 50 }))).toBe(true)
  })
})
