import { describe, expect, it } from 'vitest'
import { buildDiagnosticCashLaneSummary } from '@/lib/studio/diagnostic-cash-lane-view'

describe('diagnostic cash lane studio view', () => {
  it('builds the active playbook summary for Studio surfaces', () => {
    const summary = buildDiagnosticCashLaneSummary({
      laneContactable: 12,
      laneAwaitingApproval: 3,
      laneFollowUpDue: 4,
      paidCount: 1,
      paidCashEur: 300,
    })

    expect(summary.title).toBe('300EUR diagnostic')
    expect(summary.subtitle).toContain('Freelancers / Small Agencies')
    expect(summary.primaryMetric).toContain('300')
    expect(summary.blockers).toContain('3 approvals')
  })
})
