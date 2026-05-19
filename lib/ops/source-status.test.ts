import { describe, expect, it } from 'vitest'
import { getFreshnessStatus, makeSourceStatus } from './source-status'

describe('source status', () => {
  it('marks recent data as fresh', () => {
    expect(
      getFreshnessStatus('2026-05-19T10:00:00.000Z', new Date('2026-05-19T10:04:00.000Z'), 10)
    ).toBe('fresh')
  })

  it('marks old data as stale', () => {
    expect(
      getFreshnessStatus('2026-05-19T09:00:00.000Z', new Date('2026-05-19T10:04:00.000Z'), 10)
    ).toBe('stale')
  })

  it('builds a repairable missing source status', () => {
    expect(
      makeSourceStatus({
        source: 'agent_runs',
        checkedAt: null,
        repairHref: '/studio/agents',
        emptyLabel: 'Aucun run agent enregistré',
      })
    ).toEqual({
      source: 'agent_runs',
      checkedAt: null,
      freshness: 'missing',
      repairHref: '/studio/agents',
      emptyLabel: 'Aucun run agent enregistré',
    })
  })
})
