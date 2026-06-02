import { describe, expect, it } from 'vitest'
import { buildDevopsSummaryApiView, reconcileDevopsSummaryApiView } from './api-view'

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

  it('reconciles a stale stored summary with the current runtime snapshot', () => {
    const live = reconcileDevopsSummaryApiView({
      diagnostics: {
        checkedAt: '2026-06-01T15:00:00.000Z',
        runtime: {
          environment: 'production',
          sourceCommit: '490914c507419f5752c0d572341436203d1bbc0f',
          commitShort: '490914c',
        },
        summary: { ok: true, checksOk: 6, checksTotal: 6 },
        services: [
          {
            id: 'hermesAgent',
            label: 'Hermes Agent',
            status: 'ok',
            source: 'settings',
            checkedAt: '2026-06-01T15:00:00.000Z',
            urlLabel: 'hermes.kenomi.eu',
            latencyMs: 10,
            lastError: null,
            repairAction: 'Aucune action',
          },
        ],
        proxmox: {
          id: 'proxmox',
          label: 'Proxmox',
          status: 'ok',
          source: 'settings',
          checkedAt: '2026-06-01T15:00:00.000Z',
          urlLabel: '192.168.0.10',
          latencyMs: 20,
          lastError: null,
          repairAction: 'Aucune action',
          detail: '1 node · 3 VMs',
        },
      },
      timeline: {
        summary: { actionsTotal: 0, openIncidents: 0, lastActionAt: null },
        incidents: [],
        events: [],
      },
      parity: {
        status: 'unknown',
        runtimeCommit: '490914c',
        expectedCommit: 'non configuré',
        message: 'SOURCE_COMMIT attendu non configuré côté déploiement',
      },
      view: {
        id: 'run-1',
        status: 'ok',
        headline: 'Infra saine',
        summary: 'Ancien résumé',
        operatorNextStep: 'Old step',
        checkedAt: '2026-05-28T12:32:42.849Z',
        createdAt: '2026-05-28T12:32:42.849Z',
        runtimeCommit: 'd050098',
        parity: {
          status: 'unknown',
          runtimeCommit: 'd050098',
          expectedCommit: 'non configuré',
          message: 'SOURCE_COMMIT attendu non configuré côté déploiement',
        },
        services: [],
        incidents: [],
      },
    })

    expect(live.runtimeCommit).toBe('490914c')
    expect(live.checkedAt).toBe('2026-06-01T15:00:00.000Z')
    expect(live.parity?.runtimeCommit).toBe('490914c')
    expect(live.headline).toBe('Infra healthy')
  })
})
