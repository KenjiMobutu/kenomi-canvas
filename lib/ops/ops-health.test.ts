import { describe, it, expect } from 'vitest'
import { buildOpsHealthSummary } from './ops-health'

const now = new Date('2026-05-20T12:00:00Z')

describe('buildOpsHealthSummary', () => {
  it('mode calm si tous les signaux sont ok', () => {
    const summary = buildOpsHealthSummary({
      jobsFailed24h: 0,
      approvalsPending: 0,
      lastDeployCommit: 'abcdef1234',
      lastDeployStatus: 'ok',
      lastDeployAt: new Date('2026-05-20T10:00:00Z').toISOString(),
      diskRootPct: 45,
      paymentsCompletedToday: 3,
      ventureEventsToday: 12,
      now,
    })
    expect(summary.mode).toBe('calm')
    expect(summary.signalsFresh).toBe(true)
    expect(summary.signals).toHaveLength(5)
    expect(summary.signals.every((s) => s.tone === 'ok')).toBe(true)
  })

  it('mode attention si au moins un signal warn', () => {
    const summary = buildOpsHealthSummary({
      jobsFailed24h: 2,
      approvalsPending: 0,
      lastDeployCommit: 'abc123',
      lastDeployStatus: 'ok',
      lastDeployAt: new Date('2026-05-20T11:00:00Z').toISOString(),
      diskRootPct: 50,
      paymentsCompletedToday: 1,
      ventureEventsToday: 5,
      now,
    })
    expect(summary.mode).toBe('attention')
    expect(summary.signals[0].tone).toBe('warn')
    expect(summary.signals[0].value).toBe('2 failed')
  })

  it('crit si 5+ jobs failed', () => {
    const summary = buildOpsHealthSummary({
      jobsFailed24h: 7,
      approvalsPending: 0,
      lastDeployCommit: null,
      lastDeployStatus: null,
      lastDeployAt: null,
      diskRootPct: null,
      paymentsCompletedToday: 0,
      ventureEventsToday: 0,
      now,
    })
    expect(summary.signals[0].tone).toBe('crit')
  })

  it('disque crit à 90%, warn à 80%, ok en-dessous', () => {
    const at90 = buildOpsHealthSummary({
      jobsFailed24h: 0,
      approvalsPending: 0,
      lastDeployCommit: null,
      lastDeployStatus: null,
      lastDeployAt: null,
      diskRootPct: 91,
      paymentsCompletedToday: 0,
      ventureEventsToday: 0,
      now,
    })
    const at85 = buildOpsHealthSummary({ ...at90Args(91), diskRootPct: 85, now })
    const at60 = buildOpsHealthSummary({ ...at90Args(91), diskRootPct: 60, now })

    expect(at90.signals[3].tone).toBe('crit')
    expect(at85.signals[3].tone).toBe('warn')
    expect(at60.signals[3].tone).toBe('ok')
  })

  it('disque muted si Proxmox indisponible (diskRootPct null)', () => {
    const summary = buildOpsHealthSummary({
      jobsFailed24h: 0,
      approvalsPending: 0,
      lastDeployCommit: null,
      lastDeployStatus: null,
      lastDeployAt: null,
      diskRootPct: null,
      paymentsCompletedToday: 0,
      ventureEventsToday: 0,
      now,
    })
    expect(summary.signals[3].tone).toBe('muted')
    expect(summary.signals[3].value).toBe('n/a')
    expect(summary.signalsFresh).toBe(false)
  })

  it('last deploy stale (>7j) → warn', () => {
    const summary = buildOpsHealthSummary({
      jobsFailed24h: 0,
      approvalsPending: 0,
      lastDeployCommit: 'oldcommit12345',
      lastDeployStatus: 'ok',
      lastDeployAt: new Date('2026-05-01T00:00:00Z').toISOString(), // ~19j avant now
      diskRootPct: 50,
      paymentsCompletedToday: 0,
      ventureEventsToday: 0,
      now,
    })
    expect(summary.signals[2].tone).toBe('warn')
    expect(summary.signals[2].value).toContain('oldcomm')
  })

  it('last deploy avec commit sans date → tone selon status seul', () => {
    const summary = buildOpsHealthSummary({
      jobsFailed24h: 0,
      approvalsPending: 0,
      lastDeployCommit: 'abc12345',
      lastDeployStatus: 'ok',
      lastDeployAt: null,
      diskRootPct: 50,
      paymentsCompletedToday: 0,
      ventureEventsToday: 0,
      now,
    })
    expect(summary.signals[2].tone).toBe('ok')
    expect(summary.signals[2].value).toBe('abc1234')
  })

  it('last deploy down → crit', () => {
    const summary = buildOpsHealthSummary({
      jobsFailed24h: 0,
      approvalsPending: 0,
      lastDeployCommit: 'abc1234',
      lastDeployStatus: 'down',
      lastDeployAt: new Date('2026-05-20T11:00:00Z').toISOString(),
      diskRootPct: 50,
      paymentsCompletedToday: 0,
      ventureEventsToday: 0,
      now,
    })
    expect(summary.signals[2].tone).toBe('crit')
  })

  it('revenue today: paiements > 0 → ok, events seulement → warn, vide → muted', () => {
    const withPayments = buildOpsHealthSummary({
      jobsFailed24h: 0,
      approvalsPending: 0,
      lastDeployCommit: null,
      lastDeployStatus: null,
      lastDeployAt: null,
      diskRootPct: 50,
      paymentsCompletedToday: 2,
      ventureEventsToday: 8,
      now,
    })
    const eventsOnly = buildOpsHealthSummary({
      ...at90Args(60),
      paymentsCompletedToday: 0,
      ventureEventsToday: 5,
      diskRootPct: 50,
      now,
    })
    const empty = buildOpsHealthSummary({
      ...at90Args(60),
      paymentsCompletedToday: 0,
      ventureEventsToday: 0,
      diskRootPct: 50,
      now,
    })

    expect(withPayments.signals[4].tone).toBe('ok')
    expect(eventsOnly.signals[4].tone).toBe('warn')
    expect(empty.signals[4].tone).toBe('muted')
  })

  it('approvals: 1-4 → warn, ≥5 → crit', () => {
    const at1 = buildOpsHealthSummary({
      ...at90Args(60),
      approvalsPending: 1,
      diskRootPct: 50,
      now,
    })
    const at5 = buildOpsHealthSummary({
      ...at90Args(60),
      approvalsPending: 5,
      diskRootPct: 50,
      now,
    })
    expect(at1.signals[1].tone).toBe('warn')
    expect(at5.signals[1].tone).toBe('crit')
  })

  it('signalsFresh false si au moins un signal muted', () => {
    const summary = buildOpsHealthSummary({
      jobsFailed24h: 0,
      approvalsPending: 0,
      lastDeployCommit: null,
      lastDeployStatus: null,
      lastDeployAt: null,
      diskRootPct: 50,
      paymentsCompletedToday: 1,
      ventureEventsToday: 1,
      now,
    })
    expect(summary.signalsFresh).toBe(false)
  })
})

function at90Args(pct: number) {
  return {
    jobsFailed24h: 0,
    approvalsPending: 0,
    lastDeployCommit: null,
    lastDeployStatus: null,
    lastDeployAt: null,
    diskRootPct: pct,
    paymentsCompletedToday: 0,
    ventureEventsToday: 0,
  }
}
