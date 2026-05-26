import { describe, expect, it } from 'vitest'
import { buildProspectStagePatch } from './stage-transition'

describe('buildProspectStagePatch', () => {
  it('stamps sent transitions with last_contacted_at', () => {
    const patch = buildProspectStagePatch({
      currentMetadata: {},
      nextStatus: 'sent',
      nowIso: '2026-05-26T11:00:00.000Z',
    })

    expect(patch).toMatchObject({
      status: 'sent',
      last_contacted_at: '2026-05-26T11:00:00.000Z',
      updated_at: '2026-05-26T11:00:00.000Z',
    })
    expect(patch.metadata).toMatchObject({
      activity: [expect.objectContaining({ type: 'marked_sent' })],
    })
  })

  it('stamps won transitions with closed_at', () => {
    const patch = buildProspectStagePatch({
      currentMetadata: {},
      nextStatus: 'won',
      nowIso: '2026-05-26T11:00:00.000Z',
    })

    expect(patch).toMatchObject({
      status: 'won',
      closed_at: '2026-05-26T11:00:00.000Z',
    })
  })
})
