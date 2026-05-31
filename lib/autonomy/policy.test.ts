import { describe, expect, it } from 'vitest'
import { canHermesAutoExecute, checkBudgetPolicy, requiresApproval } from './policy'
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
    expect(
      requiresApproval(
        action({ actionType: 'create_checkout', environment: 'production', riskLevel: 'medium' })
      )
    ).toBe(true)
    expect(
      requiresApproval(
        action({ actionType: 'deploy', environment: 'production', riskLevel: 'medium' })
      )
    ).toBe(true)
  })

  it('autorise checkout et deploy hors production', () => {
    expect(
      requiresApproval(
        action({ actionType: 'create_checkout', environment: 'staging', riskLevel: 'medium' })
      )
    ).toBe(false)
    expect(
      requiresApproval(
        action({ actionType: 'deploy', environment: 'development', riskLevel: 'medium' })
      )
    ).toBe(false)
  })

  it('bloque toujours les actions à risque business', () => {
    expect(requiresApproval(action({ actionType: 'publish_campaign', riskLevel: 'high' }))).toBe(
      true
    )
    expect(requiresApproval(action({ actionType: 'scale_budget', riskLevel: 'critical' }))).toBe(
      true
    )
    expect(requiresApproval(action({ actionType: 'stop_venture', riskLevel: 'high' }))).toBe(true)
  })

  it('bloque toute action au-dessus du budget autorisé', () => {
    expect(requiresApproval(action({ estimatedCostEur: 75, budgetCapEur: 50 }))).toBe(true)
  })
})

describe('checkBudgetPolicy', () => {
  it('pass quand tout est sous les caps', () => {
    expect(
      checkBudgetPolicy({
        estimatedCostEur: 10,
        actionCapEur: 50,
        ventureSpentEur: 20,
        ventureSpendCapEur: 100,
        globalSpentEur: 50,
        globalCapEur: 500,
      })
    ).toEqual({ ok: true })
  })

  it('fail si cost > actionCap', () => {
    const result = checkBudgetPolicy({
      estimatedCostEur: 100,
      actionCapEur: 50,
      ventureSpentEur: 0,
      ventureSpendCapEur: 1000,
      globalSpentEur: 0,
      globalCapEur: 1000,
    })
    expect(result).toMatchObject({ ok: false, reason: 'action_cap_exceeded' })
  })

  it('fail si venture spend + cost > ventureCap', () => {
    const result = checkBudgetPolicy({
      estimatedCostEur: 60,
      actionCapEur: 100,
      ventureSpentEur: 950,
      ventureSpendCapEur: 1000,
      globalSpentEur: 0,
      globalCapEur: 10000,
    })
    expect(result).toMatchObject({ ok: false, reason: 'venture_cap_exceeded' })
  })

  it('fail si global spend + cost > globalCap', () => {
    const result = checkBudgetPolicy({
      estimatedCostEur: 60,
      actionCapEur: 100,
      ventureSpentEur: 0,
      ventureSpendCapEur: 10000,
      globalSpentEur: 950,
      globalCapEur: 1000,
    })
    expect(result).toMatchObject({ ok: false, reason: 'global_cap_exceeded' })
  })

  it('actionCap undefined => pas de plafond action', () => {
    const result = checkBudgetPolicy({
      estimatedCostEur: 9999,
      ventureSpentEur: 0,
      ventureSpendCapEur: 100000,
      globalSpentEur: 0,
      globalCapEur: 100000,
    })
    expect(result).toEqual({ ok: true })
  })

  it('priorité: action_cap vérifié avant venture_cap avant global_cap', () => {
    const result = checkBudgetPolicy({
      estimatedCostEur: 100,
      actionCapEur: 50,
      ventureSpentEur: 0,
      ventureSpendCapEur: 0,
      globalSpentEur: 0,
      globalCapEur: 0,
    })
    expect(result).toMatchObject({ ok: false, reason: 'action_cap_exceeded' })
  })
})

describe('canHermesAutoExecute', () => {
  it('allows Hermes Operator to auto-enqueue low-risk agent work in recommend mode only', () => {
    expect(
      canHermesAutoExecute({
        mode: 'recommend',
        actionType: 'run_agent',
        riskLevel: 'low',
      })
    ).toBe(true)
    expect(
      canHermesAutoExecute({
        mode: 'observe',
        actionType: 'run_agent',
        riskLevel: 'low',
      })
    ).toBe(false)
    expect(
      canHermesAutoExecute({
        mode: 'act',
        actionType: 'deploy',
        riskLevel: 'high',
      })
    ).toBe(false)
    expect(
      canHermesAutoExecute({
        mode: 'act',
        actionType: 'create_checkout',
        riskLevel: 'low',
      })
    ).toBe(false)
  })

  it('still gates on risk and mode even for mapped operator work like follow-up scans', () => {
    expect(
      canHermesAutoExecute({
        mode: 'act',
        actionType: 'run_agent',
        riskLevel: 'low',
      })
    ).toBe(true)
    expect(
      canHermesAutoExecute({
        mode: 'recommend',
        actionType: 'run_agent',
        riskLevel: 'medium',
      })
    ).toBe(false)
  })
})
