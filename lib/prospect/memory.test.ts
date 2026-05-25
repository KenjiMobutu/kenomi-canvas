import { describe, expect, it } from 'vitest'
import { buildProspectMemoryRecord } from './memory'

describe('buildProspectMemoryRecord', () => {
  it('packages prospect context for long-term memory storage', () => {
    const record = buildProspectMemoryRecord({
      id: 'prospect-1',
      companyName: 'Acme Studio',
      source: 'upwork',
      score: 88,
      band: 'hot',
      summary: 'Need faster follow-up and better lead prioritization',
      tags: ['upwork', 'hot'],
    })

    expect(record.namespace).toBe('prospects')
    expect(record.id).toBe('prospect-1')
    expect(record.metadata.companyName).toBe('Acme Studio')
    expect(record.metadata.score).toBe(88)
  })
})
