import { describe, expect, it } from 'vitest'
import { buildProspectActivityInsert } from './activity-log'

describe('buildProspectActivityInsert', () => {
  it('builds a normalized append-only activity payload', () => {
    const row = buildProspectActivityInsert({
      prospectId: 'prospect-1',
      userId: 'user-1',
      type: 'note_updated',
      detail: 'Updated operator note',
      metadata: { note: 'Follow up Thursday' },
      nowIso: '2026-05-26T12:00:00.000Z',
    })

    expect(row).toMatchObject({
      prospect_id: 'prospect-1',
      user_id: 'user-1',
      type: 'note_updated',
      detail: 'Updated operator note',
      created_at: '2026-05-26T12:00:00.000Z',
    })
    expect(row.metadata).toEqual({ note: 'Follow up Thursday' })
  })
})
