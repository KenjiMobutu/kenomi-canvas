import { describe, expect, it } from 'vitest'
import { verifyHermesOperatorSmoke } from '@/lib/hermes-operator/smoke.mjs'

describe('verifyHermesOperatorSmoke', () => {
  it('fails when there is no operator run, no recommendations, or no alerts shape', () => {
    const result = verifyHermesOperatorSmoke({
      healthOk: true,
      automationsProtected: true,
      operatorProtected: true,
      notificationsProtected: true,
      briefProtected: true,
      triggerAttempted: false,
      triggerOk: false,
      runAdvanced: false,
      runCount: 0,
      recommendationCount: 0,
      alertCount: 0,
      businessAlertCount: 0,
      briefCount: 0,
      blockedByPolicyCount: Number.NaN,
      acceptedFollowUpScanCount: Number.NaN,
      acceptedProspectCount: Number.NaN,
      acceptedDevopsCount: Number.NaN,
    })

    expect(result.ok).toBe(false)
    expect(result.failures).toContain('operator_trigger_not_attempted')
    expect(result.failures).toContain('operator_trigger_failed')
    expect(result.failures).toContain('operator_run_not_advanced')
    expect(result.failures).toContain('operator_run_missing')
    expect(result.failures).toContain('operator_recommendation_missing')
    expect(result.failures).toContain('operator_alert_missing')
    expect(result.failures).toContain('operator_business_alert_missing')
    expect(result.failures).toContain('operator_brief_missing')
    expect(result.failures).toContain('operator_policy_accounting_missing')
    expect(result.failures).toContain('operator_follow_up_acceptance_missing')
    expect(result.failures).toContain('operator_prospect_acceptance_missing')
    expect(result.failures).toContain('operator_devops_acceptance_missing')
  })

  it('passes when the Hermes operator loop has persisted data and protected routes', () => {
    const result = verifyHermesOperatorSmoke({
      healthOk: true,
      automationsProtected: true,
      operatorProtected: true,
      notificationsProtected: true,
      briefProtected: true,
      triggerAttempted: true,
      triggerOk: true,
      runAdvanced: true,
      runCount: 2,
      recommendationCount: 3,
      alertCount: 1,
      businessAlertCount: 1,
      briefCount: 1,
      blockedByPolicyCount: 0,
      acceptedFollowUpScanCount: 0,
      acceptedProspectCount: 1,
      acceptedDevopsCount: 0,
    })

    expect(result).toEqual({ ok: true, failures: [] })
  })
})
