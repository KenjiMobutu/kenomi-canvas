import { describe, expect, it } from 'vitest'
import {
  canHermesAutoExecute,
  checkBudgetPolicy,
  evaluateHermesAutoExecution,
  requiresApproval,
} from './policy'
import type { AutonomyAction } from './types'
import { mapTelegramActionToOperatorExecution } from '../hermes-operator/telegram-actions'

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
  it('allows only allowlisted low-risk Hermes work in recommend/act mode', () => {
    expect(
      canHermesAutoExecute({
        mode: 'recommend',
        actionType: 'run_agent',
        riskLevel: 'low',
        agentId: 'prospect',
      })
    ).toBe(true)
    expect(
      canHermesAutoExecute({
        mode: 'act',
        actionType: 'run_agent',
        riskLevel: 'low',
        agentId: 'devops',
      })
    ).toBe(true)
    expect(
      canHermesAutoExecute({
        mode: 'recommend',
        actionType: 'run_agent',
        riskLevel: 'low',
        agentId: 'decision',
      })
    ).toBe(false)
    expect(
      canHermesAutoExecute({
        mode: 'observe',
        actionType: 'run_agent',
        riskLevel: 'low',
        agentId: 'prospect',
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
        actionType: 'run_agent',
        riskLevel: 'low',
        agentId: 'scout',
      })
    ).toBe(false)
  })

  it('still gates on risk and mode even for mapped operator work like follow-up scans', () => {
    expect(
      canHermesAutoExecute({
        mode: 'act',
        actionType: 'run_agent',
        riskLevel: 'low',
        recommendationKind: 'run_follow_up_scan',
      })
    ).toBe(true)
    expect(
      canHermesAutoExecute({
        mode: 'recommend',
        actionType: 'run_agent',
        riskLevel: 'medium',
        recommendationKind: 'run_follow_up_scan',
      })
    ).toBe(false)
  })

  it('requires explicit follow-up-scan provenance for follow_up_scan actions', () => {
    expect(
      canHermesAutoExecute({
        mode: 'act',
        actionType: 'follow_up_scan',
        riskLevel: 'low',
      })
    ).toBe(false)

    expect(
      canHermesAutoExecute({
        mode: 'act',
        actionType: 'follow_up_scan',
        riskLevel: 'low',
        recommendationKind: 'run_follow_up_scan',
      })
    ).toBe(true)
  })

  it('requires recommendation kind and agent id to agree for mapped run_agent work', () => {
    expect(
      canHermesAutoExecute({
        mode: 'act',
        actionType: 'run_agent',
        riskLevel: 'low',
        recommendationKind: 'run_prospect',
        agentId: 'devops',
      })
    ).toBe(false)

    expect(
      canHermesAutoExecute({
        mode: 'act',
        actionType: 'run_agent',
        riskLevel: 'low',
        recommendationKind: 'run_devops',
        agentId: 'prospect',
      })
    ).toBe(false)
  })

  it('keeps telegram low-risk mappings inside the same allowlist', () => {
    const runProspect = mapTelegramActionToOperatorExecution('run_prospect')
    const scanFollowups = mapTelegramActionToOperatorExecution('scan_followups')

    expect(runProspect).toBeTruthy()
    expect(scanFollowups).toBeTruthy()
    expect(runProspect?.actionType).toBe('run_agent')
    expect(scanFollowups?.actionType).toBe('follow_up_scan')

    if (!runProspect || runProspect.actionType !== 'run_agent') {
      throw new Error('run_prospect should map to run_agent')
    }

    if (!scanFollowups || scanFollowups.actionType !== 'follow_up_scan') {
      throw new Error('scan_followups should map to follow_up_scan')
    }

    expect(
      canHermesAutoExecute({
        mode: 'act',
        actionType: runProspect.actionType,
        riskLevel: 'low',
        recommendationKind: 'run_prospect',
        agentId: runProspect.payload.agentId,
      })
    ).toBe(true)

    expect(
      canHermesAutoExecute({
        mode: 'act',
        actionType: scanFollowups.actionType,
        riskLevel: 'low',
        recommendationKind: 'run_follow_up_scan',
      })
    ).toBe(true)

    expect(
      canHermesAutoExecute({
        mode: 'act',
        actionType: scanFollowups.actionType,
        riskLevel: 'medium',
        recommendationKind: 'run_follow_up_scan',
      })
    ).toBe(false)
  })
})

describe('evaluateHermesAutoExecution', () => {
  const caps = {
    maxAutoActionsPerDay: 4,
    maxAutoProspectRunsPerDay: 2,
    maxAutoFollowUpScansPerDay: 3,
    maxAutoDevopsRunsPerDay: 1,
  }

  it('blocks when action is not allowlisted', () => {
    expect(
      evaluateHermesAutoExecution({
        mode: 'recommend',
        actionType: 'run_agent',
        riskLevel: 'low',
        agentId: 'decision',
        caps,
        usage: {
          totalAutoActionsToday: 0,
          prospectRunsToday: 0,
          followUpScansToday: 0,
          devopsRunsToday: 0,
        },
      })
    ).toMatchObject({ ok: false, reason: 'action_not_allowlisted' })
  })

  it('blocks on daily global cap before action-specific caps', () => {
    expect(
      evaluateHermesAutoExecution({
        mode: 'recommend',
        actionType: 'run_agent',
        riskLevel: 'low',
        agentId: 'prospect',
        caps,
        usage: {
          totalAutoActionsToday: 4,
          prospectRunsToday: 0,
          followUpScansToday: 0,
          devopsRunsToday: 0,
        },
      })
    ).toMatchObject({ ok: false, reason: 'daily_cap_reached' })
  })

  it('blocks on action-specific caps', () => {
    expect(
      evaluateHermesAutoExecution({
        mode: 'recommend',
        actionType: 'run_agent',
        riskLevel: 'low',
        agentId: 'prospect',
        caps,
        usage: {
          totalAutoActionsToday: 1,
          prospectRunsToday: 2,
          followUpScansToday: 0,
          devopsRunsToday: 0,
        },
      })
    ).toMatchObject({ ok: false, reason: 'action_cap_reached' })
    expect(
      evaluateHermesAutoExecution({
        mode: 'act',
        actionType: 'run_agent',
        riskLevel: 'low',
        recommendationKind: 'run_follow_up_scan',
        caps,
        usage: {
          totalAutoActionsToday: 1,
          prospectRunsToday: 0,
          followUpScansToday: 3,
          devopsRunsToday: 0,
        },
      })
    ).toMatchObject({ ok: false, reason: 'action_cap_reached' })
  })

  it('returns allow when allowlist and caps both pass', () => {
    expect(
      evaluateHermesAutoExecution({
        mode: 'recommend',
        actionType: 'run_agent',
        riskLevel: 'low',
        agentId: 'devops',
        caps,
        usage: {
          totalAutoActionsToday: 1,
          prospectRunsToday: 0,
          followUpScansToday: 1,
          devopsRunsToday: 0,
        },
      })
    ).toEqual({ ok: true })
  })
})
