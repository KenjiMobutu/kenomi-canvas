import { describe, expect, it } from 'vitest'
import { buildStudioOpsSummary } from './studio-ops-summary'

describe('studio ops summary', () => {
  it('reports calm state when critical sources are empty but not failing', () => {
    const summary = buildStudioOpsSummary({
      agentRunCount: 0,
      automationRunCount: 0,
      pendingApprovalCount: 0,
      failedAutomationRunCount: 0,
      staleServiceCount: 0,
      latestAgentRunAt: null,
      latestAutomationRunAt: null,
      now: new Date('2026-05-19T10:00:00.000Z'),
    })

    expect(summary.mode).toBe('calm')
    expect(summary.cards.map((card) => card.label)).toEqual([
      'Agents',
      'Automations',
      'Approvals',
      'Infrastructure',
    ])
    expect(summary.cards[0].value).toBe('0')
    expect(summary.cards[0].source.source).toBe('agent_runs')
  })

  it('reports attention when approvals or failures exist', () => {
    const summary = buildStudioOpsSummary({
      agentRunCount: 2,
      automationRunCount: 3,
      pendingApprovalCount: 1,
      failedAutomationRunCount: 1,
      staleServiceCount: 0,
      latestAgentRunAt: '2026-05-19T09:59:00.000Z',
      latestAutomationRunAt: '2026-05-19T09:58:00.000Z',
      now: new Date('2026-05-19T10:00:00.000Z'),
    })

    expect(summary.mode).toBe('attention')
    expect(summary.primaryRepairHref).toBe('/studio/agents')
  })

  it('prioritizes pending approvals before other actions', () => {
    const summary = buildStudioOpsSummary({
      agentRunCount: 0,
      automationRunCount: 0,
      pendingApprovalCount: 2,
      failedAutomationRunCount: 1,
      staleServiceCount: 1,
      latestAgentRunAt: null,
      latestAutomationRunAt: null,
      now: new Date('2026-05-19T10:00:00.000Z'),
    })

    expect(summary.actions[0]).toMatchObject({
      id: 'review-approvals',
      label: 'Valider les approvals',
      href: '/studio/agents',
      tone: 'warn',
    })
  })

  it('keeps a calm verification action when nothing needs repair', () => {
    const summary = buildStudioOpsSummary({
      agentRunCount: 1,
      automationRunCount: 1,
      pendingApprovalCount: 0,
      failedAutomationRunCount: 0,
      staleServiceCount: 0,
      latestAgentRunAt: '2026-05-19T09:59:00.000Z',
      latestAutomationRunAt: '2026-05-19T09:58:00.000Z',
      now: new Date('2026-05-19T10:00:00.000Z'),
    })

    expect(summary.actions).toEqual([
      {
        id: 'verify-sources',
        label: 'Vérifier les sources',
        detail: 'Les sources critiques répondent. Ouvrir le cockpit pour inspection.',
        href: '/studio',
        tone: 'ok',
      },
    ])
  })
})
