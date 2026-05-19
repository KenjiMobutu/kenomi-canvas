import { describe, expect, it } from 'vitest'
import { buildRevenueAutopilotPlan, filterDuplicateDailyAutopilotSteps } from './revenue-autopilot'
import type { RevenueLoopSnapshot } from './revenue-loop'

const baseSnapshot: RevenueLoopSnapshot = {
  summary: {
    activeLoops: 1,
    readyCheckouts: 0,
    pendingApprovals: 0,
    blockedLoops: 0,
    revenueEur: 0,
    paidPayments: 0,
    blockedRevenueEur: 0,
    recommendedAction: null,
  },
  loops: [],
  agentRevenueAttribution: [],
}

describe('buildRevenueAutopilotPlan', () => {
  it('exécute automatiquement la prochaine action agent low-risk', () => {
    const plan = buildRevenueAutopilotPlan({
      snapshot: {
        ...baseSnapshot,
        summary: {
          ...baseSnapshot.summary,
          recommendedAction: {
            type: 'run_agent',
            agentId: 'payment',
            ventureId: 'venture-1',
            label: 'Lancer Payment',
            loopId: 'loop-1',
            ventureName: 'NoteFast',
            priorityScore: 80,
            blockedRevenueEur: 0,
            reason: 'Offre tarifée manquante',
          },
        },
      },
      environment: 'production',
    })

    expect(plan.mode).toBe('execute')
    expect(plan.steps).toEqual([
      expect.objectContaining({
        kind: 'run_agent',
        execution: 'auto',
        agentId: 'payment',
        ventureId: 'venture-1',
        risk: 'low',
      }),
    ])
  })

  it('met checkout production en approval humaine au lieu de l’exécuter directement', () => {
    const plan = buildRevenueAutopilotPlan({
      snapshot: {
        ...baseSnapshot,
        summary: {
          ...baseSnapshot.summary,
          recommendedAction: {
            type: 'create_checkout',
            ventureId: 'venture-1',
            pipelineId: 'pipeline-1',
            label: 'Créer le checkout Stripe',
            loopId: 'loop-1',
            ventureName: 'NoteFast',
            priorityScore: 90,
            blockedRevenueEur: 29,
            reason: 'Checkout Stripe manquant',
          },
        },
      },
      environment: 'production',
    })

    expect(plan.mode).toBe('approval_required')
    expect(plan.steps[0]).toMatchObject({
      kind: 'create_checkout',
      execution: 'approval',
      risk: 'medium',
      blockedRevenueEur: 29,
    })
  })

  it('propose stop_venture si une boucle acquisition est ancienne sans revenu', () => {
    const plan = buildRevenueAutopilotPlan({
      snapshot: {
        ...baseSnapshot,
        loops: [
          {
            id: 'loop-stale',
            pipelineId: 'pipeline-stale',
            ventureId: 'venture-stale',
            ventureName: 'WeakIdea',
            status: 'approved',
            revenueEur: 0,
            paidPayments: 0,
            stages: [
              { key: 'idea', label: 'Idea', status: 'done' },
              { key: 'validation', label: 'Validation', status: 'done' },
              { key: 'landing', label: 'Landing', status: 'done' },
              { key: 'payment', label: 'Payment', status: 'done' },
              { key: 'checkout', label: 'Checkout', status: 'done' },
              { key: 'marketing', label: 'Marketing', status: 'done' },
              { key: 'revenue', label: 'Revenue', status: 'ready' },
              { key: 'decision', label: 'Decision', status: 'idle' },
            ],
            nextAction: {
              type: 'run_agent',
              agentId: 'decision',
              ventureId: 'venture-stale',
              label: 'Lancer Decision',
            },
            priorityScore: 70,
            priorityReason: 'Décision post-revenu manquante',
            blockedRevenueEur: 0,
            updatedAt: '2026-05-01T00:00:00.000Z',
          },
        ],
        summary: {
          ...baseSnapshot.summary,
          recommendedAction: {
            type: 'run_agent',
            agentId: 'decision',
            ventureId: 'venture-stale',
            label: 'Lancer Decision',
            loopId: 'loop-stale',
            ventureName: 'WeakIdea',
            priorityScore: 70,
            blockedRevenueEur: 0,
            reason: 'Décision post-revenu manquante',
          },
        },
      },
      environment: 'production',
      now: new Date('2026-05-19T00:00:00.000Z'),
      staleNoRevenueDays: 7,
    })

    expect(plan.steps[0]).toMatchObject({
      kind: 'stop_venture',
      execution: 'approval',
      ventureId: 'venture-stale',
      risk: 'high',
    })
    expect(plan.steps[0].reason).toContain('18 jours')
  })

  it('propose scale_budget si une boucle encaisse déjà', () => {
    const plan = buildRevenueAutopilotPlan({
      snapshot: {
        ...baseSnapshot,
        loops: [
          {
            id: 'loop-winner',
            pipelineId: 'pipeline-winner',
            ventureId: 'venture-winner',
            ventureName: 'Winner',
            status: 'approved',
            revenueEur: 87,
            paidPayments: 3,
            stages: [],
            nextAction: { type: 'monitor', label: 'Surveiller', ventureId: 'venture-winner' },
            priorityScore: 10,
            priorityReason: 'Boucle à surveiller',
            blockedRevenueEur: 0,
            updatedAt: '2026-05-18T00:00:00.000Z',
          },
        ],
        summary: {
          ...baseSnapshot.summary,
          revenueEur: 87,
          paidPayments: 3,
          recommendedAction: {
            type: 'monitor',
            label: 'Surveiller',
            ventureId: 'venture-winner',
            loopId: 'loop-winner',
            ventureName: 'Winner',
            priorityScore: 10,
            blockedRevenueEur: 0,
            reason: 'Boucle à surveiller',
          },
        },
      },
      environment: 'production',
    })

    expect(plan.steps[0]).toMatchObject({
      kind: 'scale_budget',
      execution: 'approval',
      ventureId: 'venture-winner',
      risk: 'high',
      recommendedBudgetEur: 26,
    })
  })
})

describe('filterDuplicateDailyAutopilotSteps', () => {
  it('retire une approval revenue deja créée le même jour pour la même venture', () => {
    const plan = buildRevenueAutopilotPlan({
      snapshot: {
        ...baseSnapshot,
        summary: {
          ...baseSnapshot.summary,
          recommendedAction: {
            type: 'create_checkout',
            ventureId: 'venture-1',
            pipelineId: 'pipeline-1',
            label: 'Créer le checkout Stripe',
            loopId: 'loop-1',
            ventureName: 'NoteFast',
            priorityScore: 90,
            blockedRevenueEur: 29,
            reason: 'Checkout Stripe manquant',
          },
        },
      },
      environment: 'production',
      now: new Date('2026-05-19T08:00:00.000Z'),
    })

    const filtered = filterDuplicateDailyAutopilotSteps({
      plan,
      now: new Date('2026-05-19T12:00:00.000Z'),
      actions: [
        {
          action_type: 'create_checkout',
          venture_id: 'venture-1',
          status: 'blocked',
          input: { source: 'revenue_autopilot' },
          created_at: '2026-05-19T09:00:00.000Z',
        },
      ],
    })

    expect(filtered.mode).toBe('hold')
    expect(filtered.steps).toEqual([])
  })

  it('conserve une action si la derniere tentative date d’un autre jour', () => {
    const plan = buildRevenueAutopilotPlan({
      snapshot: {
        ...baseSnapshot,
        loops: [
          {
            id: 'loop-winner',
            pipelineId: 'pipeline-winner',
            ventureId: 'venture-winner',
            ventureName: 'Winner',
            status: 'approved',
            revenueEur: 87,
            paidPayments: 3,
            stages: [],
            nextAction: { type: 'monitor', label: 'Surveiller', ventureId: 'venture-winner' },
            priorityScore: 10,
            priorityReason: 'Boucle à surveiller',
            blockedRevenueEur: 0,
            updatedAt: '2026-05-18T00:00:00.000Z',
          },
        ],
        summary: {
          ...baseSnapshot.summary,
          revenueEur: 87,
          paidPayments: 3,
        },
      },
      environment: 'production',
      now: new Date('2026-05-19T08:00:00.000Z'),
    })

    const filtered = filterDuplicateDailyAutopilotSteps({
      plan,
      now: new Date('2026-05-19T12:00:00.000Z'),
      actions: [
        {
          action_type: 'scale_budget',
          venture_id: 'venture-winner',
          status: 'blocked',
          input: { source: 'revenue_autopilot' },
          created_at: '2026-05-18T09:00:00.000Z',
        },
      ],
    })

    expect(filtered.mode).toBe('approval_required')
    expect(filtered.steps).toHaveLength(1)
  })
})
