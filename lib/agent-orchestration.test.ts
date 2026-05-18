import { describe, expect, it } from 'vitest'
import { computeNextRunAt, executeDueAgentRuns, partitionDueRuns, selectDueAgentRuns } from './agent-orchestration'

describe('selectDueAgentRuns', () => {
  it('retourne les schedules activés dont next_run_at est passé', () => {
    const now = new Date('2026-05-18T10:00:00.000Z')
    const runs = selectDueAgentRuns([
      { id: '1', agent_id: 'scout', enabled: true, next_run_at: '2026-05-18T09:59:00.000Z', requires_human_approval: false },
      { id: '2', agent_id: 'builder', enabled: true, next_run_at: '2026-05-18T10:10:00.000Z', requires_human_approval: false },
    ], now)

    expect(runs).toEqual([{ scheduleId: '1', agentId: 'scout', blockedByApproval: false }])
  })

  it('ignore les schedules désactivés même si dus', () => {
    const now = new Date('2026-05-18T10:00:00.000Z')
    const runs = selectDueAgentRuns([
      { id: '1', agent_id: 'scout', enabled: false, next_run_at: '2026-05-18T09:00:00.000Z', requires_human_approval: false },
    ], now)

    expect(runs).toEqual([])
  })

  it('marque blockedByApproval=true pour les agents risqués', () => {
    const now = new Date('2026-05-18T10:00:00.000Z')
    const runs = selectDueAgentRuns([
      { id: '1', agent_id: 'payment', enabled: true, next_run_at: '2026-05-18T09:59:00.000Z', requires_human_approval: true },
    ], now)

    expect(runs).toEqual([{ scheduleId: '1', agentId: 'payment', blockedByApproval: true }])
  })

  it('utilise now=new Date() par défaut', () => {
    const runs = selectDueAgentRuns([
      { id: '1', agent_id: 'scout', enabled: true, next_run_at: '2000-01-01T00:00:00.000Z', requires_human_approval: false },
    ])
    expect(runs).toHaveLength(1)
  })
})

describe('computeNextRunAt', () => {
  it('ajoute interval_minutes à partir de now', () => {
    expect(
      computeNextRunAt(new Date('2026-05-18T10:00:00.000Z'), 30)
    ).toBe('2026-05-18T10:30:00.000Z')
  })
})

describe('partitionDueRuns', () => {
  it('sépare les runs exécutables des runs bloqués par approbation', () => {
    const partition = partitionDueRuns([
      { scheduleId: '1', agentId: 'scout', blockedByApproval: false },
      { scheduleId: '2', agentId: 'payment', blockedByApproval: true },
    ])

    expect(partition.executable).toEqual([
      { scheduleId: '1', agentId: 'scout', blockedByApproval: false },
    ])
    expect(partition.blocked).toEqual([
      { scheduleId: '2', agentId: 'payment', blockedByApproval: true },
    ])
  })
})

describe('executeDueAgentRuns', () => {
  it('exécute les runs et avance seulement les schedules réussis', async () => {
    const updates: Array<{ scheduleId: string; nextRunAt: string }> = []
    const result = await executeDueAgentRuns({
      runs: [
        { scheduleId: '1', agentId: 'scout', blockedByApproval: false },
        { scheduleId: '2', agentId: 'validation', blockedByApproval: false },
      ],
      schedules: [
        { id: '1', agent_id: 'scout', enabled: true, next_run_at: '2026-05-18T09:00:00.000Z', interval_minutes: 30, requires_human_approval: false },
        { id: '2', agent_id: 'validation', enabled: true, next_run_at: '2026-05-18T09:00:00.000Z', interval_minutes: 60, requires_human_approval: false },
      ],
      now: new Date('2026-05-18T10:00:00.000Z'),
      runAgent: async (run) => {
        if (run.agentId === 'validation') throw new Error('locked')
        return { agentRunId: 'run-1' }
      },
      updateSchedule: async (scheduleId, nextRunAt) => {
        updates.push({ scheduleId, nextRunAt })
        return null
      },
    })

    expect(updates).toEqual([{ scheduleId: '1', nextRunAt: '2026-05-18T10:30:00.000Z' }])
    expect(result.executed).toEqual([{ scheduleId: '1', agentId: 'scout', agentRunId: 'run-1' }])
    expect(result.execution_errors).toEqual([{ scheduleId: '2', agentId: 'validation', message: 'locked' }])
  })

  it('retourne les erreurs de mise à jour schedule après exécution réussie', async () => {
    const result = await executeDueAgentRuns({
      runs: [{ scheduleId: '1', agentId: 'scout', blockedByApproval: false }],
      schedules: [{ id: '1', agent_id: 'scout', enabled: true, next_run_at: '2026-05-18T09:00:00.000Z', interval_minutes: 30, requires_human_approval: false }],
      now: new Date('2026-05-18T10:00:00.000Z'),
      runAgent: async () => ({ agentRunId: 'run-1' }),
      updateSchedule: async () => 'db failed',
    })

    expect(result.executed).toEqual([{ scheduleId: '1', agentId: 'scout', agentRunId: 'run-1' }])
    expect(result.update_errors).toEqual([{ scheduleId: '1', agentId: 'scout', message: 'db failed' }])
  })
})
