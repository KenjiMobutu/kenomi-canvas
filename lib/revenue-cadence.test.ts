import { describe, expect, it } from 'vitest'
import { buildRevenueCadenceStatus } from './revenue-cadence'

describe('buildRevenueCadenceStatus', () => {
  it('marque la cadence live quand un daily cycle récent existe', () => {
    const status = buildRevenueCadenceStatus({
      events: [
        {
          event_type: 'revenue.daily_cycle.completed',
          created_at: '2026-05-19T06:00:00.000Z',
        },
      ],
      now: new Date('2026-05-19T18:00:00.000Z'),
    })

    expect(status).toMatchObject({
      status: 'live',
      lastRunAt: '2026-05-19T06:00:00.000Z',
      hoursSinceLastRun: 12,
      nextExpectedAt: '2026-05-20T06:00:00.000Z',
    })
  })

  it('marque la cadence stale quand le dernier cycle dépasse la fenêtre quotidienne', () => {
    const status = buildRevenueCadenceStatus({
      events: [
        {
          event_type: 'revenue.daily_cycle.completed',
          created_at: '2026-05-18T06:00:00.000Z',
        },
      ],
      now: new Date('2026-05-19T18:30:00.000Z'),
    })

    expect(status).toMatchObject({
      status: 'stale',
      hoursSinceLastRun: 36.5,
    })
  })

  it('marque la cadence missing sans audit de daily cycle', () => {
    const status = buildRevenueCadenceStatus({
      events: [
        { event_type: 'revenue.autopilot.evaluated', created_at: '2026-05-19T06:00:00.000Z' },
      ],
      now: new Date('2026-05-19T18:00:00.000Z'),
    })

    expect(status).toMatchObject({
      status: 'missing',
      lastRunAt: null,
      nextExpectedAt: null,
    })
  })
})
