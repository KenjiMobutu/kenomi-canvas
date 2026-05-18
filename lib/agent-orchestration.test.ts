import { describe, expect, it } from 'vitest'
import { selectDueAgentRuns } from './agent-orchestration'

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
