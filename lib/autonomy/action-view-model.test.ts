import { describe, expect, it } from 'vitest'
import { buildActionList, buildJobList } from './action-view-model'

describe('buildActionList', () => {
  it('sorts actions and exposes provider, model, duration and last error', () => {
    const items = buildActionList([
      {
        id: 'a-old',
        action_type: 'deploy',
        risk_level: 'medium',
        status: 'completed',
        input: {},
        output: { provider: 'coolify', duration_ms: 1200 },
        created_at: '2026-05-18T10:00:00.000Z',
      },
      {
        id: 'a-new',
        action_type: 'run_agent',
        risk_level: 'low',
        status: 'failed',
        input: { model: 'qwen3:8b' },
        output: { error: 'timeout' },
        created_at: '2026-05-18T11:00:00.000Z',
      },
    ])

    expect(items.map((item) => item.id)).toEqual(['a-new', 'a-old'])
    expect(items[0]).toMatchObject({
      label: 'Run agent',
      model: 'qwen3:8b',
      lastError: 'timeout',
    })
    expect(items[1]).toMatchObject({
      provider: 'coolify',
      durationMs: 1200,
    })
  })
})

describe('buildJobList', () => {
  it('sorts jobs and exposes retry count and last error', () => {
    const items = buildJobList([
      {
        id: 'j-old',
        kind: 'run_agent',
        status: 'completed',
        attempt_count: 1,
        created_at: '2026-05-18T10:00:00.000Z',
      },
      {
        id: 'j-new',
        kind: 'publish_campaign',
        status: 'failed',
        attempt_count: 3,
        last_error: 'n8n unavailable',
        next_run_at: '2026-05-18T12:00:00.000Z',
        created_at: '2026-05-18T11:00:00.000Z',
      },
    ])

    expect(items.map((item) => item.id)).toEqual(['j-new', 'j-old'])
    expect(items[0]).toMatchObject({
      label: 'publish campaign',
      retryCount: 3,
      lastError: 'n8n unavailable',
      nextRunAt: '2026-05-18T12:00:00.000Z',
    })
  })
})
