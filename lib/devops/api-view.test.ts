import { describe, expect, it } from 'vitest'
import { buildDevopsSummaryApiView } from './api-view'

describe('buildDevopsSummaryApiView', () => {
  it('projects the latest DevOps snapshot for Studio', () => {
    const view = buildDevopsSummaryApiView({
      row: {
        id: 'run-1',
        summary_status: 'down',
        checked_at: '2026-05-27T10:00:00.000Z',
        created_at: '2026-05-27T10:00:03.000Z',
        summary_payload: {
          global_status: 'down',
          headline: '1 open infra incident',
          services: [
            {
              id: 'ollama',
              status: 'down',
              severity: 'high',
              reason: 'timeout',
              next_step: 'Verify Ollama reachability on the private host.',
            },
          ],
          summary: 'Ollama is unavailable and blocks local inference.',
          operator_next_step: 'Verify Ollama reachability on the private host.',
        },
        timeline_payload: {
          incidents: [
            {
              id: 'incident-1',
              targetId: 'ollama',
              targetLabel: 'Ollama',
              status: 'open',
              severity: 'error',
              lastError: 'timeout',
              repairAction: 'Verify Ollama reachability on the private host.',
              createdAt: '2026-05-27T10:00:00.000Z',
            },
          ],
          parity: {
            status: 'mismatch',
            runtimeCommit: 'abc1234',
            expectedCommit: 'def9999',
            message: 'Runtime différent du commit attendu',
          },
        },
        runtime_payload: {
          environment: 'production',
          sourceCommit: 'abc123456789',
          commitShort: 'abc1234',
        },
      },
    })

    expect(view).toMatchObject({
      status: 'down',
      headline: '1 open infra incident',
      summary: 'Ollama is unavailable and blocks local inference.',
      operatorNextStep: 'Verify Ollama reachability on the private host.',
      checkedAt: '2026-05-27T10:00:00.000Z',
      parity: {
        status: 'mismatch',
        runtimeCommit: 'abc1234',
      },
      incidents: [{ targetId: 'ollama', status: 'open' }],
    })
  })

  it('returns null when no snapshot row is available', () => {
    expect(buildDevopsSummaryApiView({ row: null })).toBeNull()
  })
})
