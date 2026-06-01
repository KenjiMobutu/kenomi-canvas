import { describe, expect, it } from 'vitest'
import {
  buildInfrastructureDeployEntries,
  buildInfrastructureLogEntries,
} from '@/lib/studio/infrastructure-panels'

describe('buildInfrastructureLogEntries', () => {
  it('prefers ops events when available', () => {
    const result = buildInfrastructureLogEntries({
      events: [
        {
          id: 'event-1',
          type: 'recheck',
          severity: 'warn',
          message: 'Coolify · degraded · timeout',
          createdAt: '2026-06-01T12:00:00.000Z',
        },
      ],
      incidents: [
        {
          id: 'incident-1',
          targetLabel: 'Coolify',
          severity: 'error',
          lastError: 'timeout',
          createdAt: '2026-06-01T11:00:00.000Z',
        },
      ],
    })

    expect(result).toEqual([
      {
        id: 'event-1',
        severity: 'warn',
        label: 'recheck',
        message: 'Coolify · degraded · timeout',
        createdAt: '2026-06-01T12:00:00.000Z',
      },
    ])
  })

  it('falls back to devops summary when no events exist', () => {
    const result = buildInfrastructureLogEntries({
      devopsSummary: {
        headline: '1 open infra incident',
        summary: 'Ollama is degraded.',
        checkedAt: '2026-06-01T12:00:00.000Z',
        runtimeCommit: '390137b',
      },
    })

    expect(result[0]).toMatchObject({
      id: 'devops-summary',
      label: '1 open infra incident',
      message: 'Ollama is degraded.',
    })
  })
})

describe('buildInfrastructureDeployEntries', () => {
  it('builds runtime and expected commit entries from parity', () => {
    const result = buildInfrastructureDeployEntries({
      checkedAt: '2026-06-01T12:00:00.000Z',
      parity: {
        status: 'mismatch',
        runtimeCommit: '390137b',
        expectedCommit: '342019a',
        message: 'Runtime different from expected commit',
      },
    })

    expect(result).toEqual([
      {
        id: 'runtime-parity',
        status: 'mismatch',
        label: 'Runtime parity',
        detail: 'Runtime different from expected commit',
        commit: '390137b',
        createdAt: '2026-06-01T12:00:00.000Z',
      },
      {
        id: 'expected-commit',
        status: 'unknown',
        label: 'Expected commit',
        detail: 'Expected deployment target',
        commit: '342019a',
        createdAt: '2026-06-01T12:00:00.000Z',
      },
    ])
  })
})
