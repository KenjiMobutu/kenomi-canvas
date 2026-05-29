import { describe, expect, it } from 'vitest'
import { verifyHermesOperatorSmoke } from '@/lib/hermes-operator/smoke.mjs'

describe('verifyHermesOperatorSmoke', () => {
  it('fails when there is no operator run, no recommendations, or no alerts shape', () => {
    const result = verifyHermesOperatorSmoke({
      healthOk: true,
      automationsProtected: true,
      operatorProtected: true,
      notificationsProtected: true,
      runCount: 0,
      recommendationCount: 0,
      alertCount: 0,
    })

    expect(result.ok).toBe(false)
    expect(result.failures).toContain('operator_run_missing')
    expect(result.failures).toContain('operator_recommendation_missing')
    expect(result.failures).toContain('operator_alert_missing')
  })

  it('passes when the Hermes operator loop has persisted data and protected routes', () => {
    const result = verifyHermesOperatorSmoke({
      healthOk: true,
      automationsProtected: true,
      operatorProtected: true,
      notificationsProtected: true,
      runCount: 2,
      recommendationCount: 3,
      alertCount: 1,
    })

    expect(result).toEqual({ ok: true, failures: [] })
  })
})
