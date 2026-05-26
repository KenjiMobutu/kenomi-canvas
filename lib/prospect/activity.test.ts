import { describe, expect, it } from 'vitest'
import { appendProspectActivity } from './activity'

describe('appendProspectActivity', () => {
  it('appends an approval-created event to prospect metadata activity', () => {
    const next = appendProspectActivity(
      { activity: [] },
      {
        type: 'approval_created',
        actor: 'system',
        at: '2026-05-26T10:00:00.000Z',
        detail: 'send_outreach approval created',
      }
    )

    expect(next.activity).toEqual([
      {
        type: 'approval_created',
        actor: 'system',
        at: '2026-05-26T10:00:00.000Z',
        detail: 'send_outreach approval created',
      },
    ])
  })

  it('preserves previous activity events', () => {
    const next = appendProspectActivity(
      {
        activity: [
          {
            type: 'prospect_created',
            actor: 'system',
            at: '2026-05-26T09:00:00.000Z',
            detail: 'Prospect stored',
          },
        ],
      },
      {
        type: 'approval_created',
        actor: 'system',
        at: '2026-05-26T10:00:00.000Z',
        detail: 'send_outreach approval created',
      }
    )

    expect(next.activity).toHaveLength(2)
    expect(next.activity[0]).toMatchObject({ type: 'prospect_created' })
    expect(next.activity[1]).toMatchObject({ type: 'approval_created' })
  })
})
