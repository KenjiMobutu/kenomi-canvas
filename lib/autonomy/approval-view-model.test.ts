import { describe, expect, it } from 'vitest'
import { buildApprovalQueue, extractBudgetBreach } from './approval-view-model'

describe('buildApprovalQueue', () => {
  it('associe approvals et actions puis remonte les pending', () => {
    const queue = buildApprovalQueue({
      approvals: [
        { id: 'approval-2', action_id: 'action-2', status: 'approved', reason: 'ok', created_at: '2026-05-18T09:00:00.000Z' },
        { id: 'approval-1', action_id: 'action-1', status: 'pending', reason: 'scale', created_at: '2026-05-18T10:00:00.000Z' },
      ],
      actions: [
        { id: 'action-1', action_type: 'scale_budget', risk_level: 'high', status: 'blocked', input: { confidence: 82 }, created_at: '2026-05-18T10:00:00.000Z' },
        { id: 'action-2', action_type: 'stop_venture', risk_level: 'high', status: 'completed', input: { confidence: 91 }, created_at: '2026-05-18T09:00:00.000Z' },
      ],
    })

    expect(queue.map(item => item.approval.id)).toEqual(['approval-1', 'approval-2'])
    expect(queue[0].action).toMatchObject({ id: 'action-1', action_type: 'scale_budget' })
    expect(queue[0].confidence).toBe(82)
    expect(queue[0].isPending).toBe(true)
    expect(queue[1].isPending).toBe(false)
    expect(queue[0].budgetBreach).toBeNull()
  })

  it('expose budgetBreach quand action.status=blocked et output.budget_breach valide', () => {
    const queue = buildApprovalQueue({
      approvals: [
        { id: 'a1', action_id: 'act-1', status: 'approved', reason: null, created_at: '2026-05-18T10:00:00.000Z' },
      ],
      actions: [
        {
          id: 'act-1', action_type: 'publish_campaign', risk_level: 'high', status: 'blocked',
          input: {},
          output: { budget_breach: 'global_cap_exceeded', detail: '150 > 100' },
          created_at: '2026-05-18T10:00:00.000Z',
        },
      ],
    })
    expect(queue[0].budgetBreach).toEqual({
      reason: 'global_cap_exceeded',
      detail: '150 > 100',
    })
  })
})

describe('extractBudgetBreach', () => {
  it('retourne null si action est null', () => {
    expect(extractBudgetBreach(null)).toBeNull()
  })

  it('retourne null si status != blocked', () => {
    expect(extractBudgetBreach({
      id: 'x', action_type: 'publish_campaign', risk_level: 'high', status: 'completed',
      input: {}, output: { budget_breach: 'action_cap_exceeded' },
      created_at: '2026-05-18T10:00:00.000Z',
    })).toBeNull()
  })

  it('retourne null si budget_breach absent', () => {
    expect(extractBudgetBreach({
      id: 'x', action_type: 'deploy', risk_level: 'high', status: 'blocked',
      input: {}, output: {},
      created_at: '2026-05-18T10:00:00.000Z',
    })).toBeNull()
  })

  it('retourne null si budget_breach reason inconnue', () => {
    expect(extractBudgetBreach({
      id: 'x', action_type: 'publish_campaign', risk_level: 'high', status: 'blocked',
      input: {}, output: { budget_breach: 'random_unknown_reason' },
      created_at: '2026-05-18T10:00:00.000Z',
    })).toBeNull()
  })

  it('detail null si absent', () => {
    expect(extractBudgetBreach({
      id: 'x', action_type: 'publish_campaign', risk_level: 'high', status: 'blocked',
      input: {}, output: { budget_breach: 'action_cap_exceeded' },
      created_at: '2026-05-18T10:00:00.000Z',
    })).toEqual({ reason: 'action_cap_exceeded', detail: null })
  })
})
