import { describe, expect, it } from 'vitest'
import { buildBusinessGaugeSnapshot } from './prometheus'

describe('buildBusinessGaugeSnapshot', () => {
  it('exposes approval backlog, failed jobs and daily cycle age', () => {
    const snapshot = buildBusinessGaugeSnapshot({
      approvalsPending: 2,
      jobsFailed24h: 1,
      deployFailures24h: 0,
      dailyCycleAgeHours: 5,
    })

    expect(snapshot).toContainEqual({ name: 'kenomi_approval_backlog', value: 2 })
    expect(snapshot).toContainEqual({ name: 'kenomi_jobs_failed_24h', value: 1 })
    expect(snapshot).toContainEqual({ name: 'kenomi_deploy_failures_24h', value: 0 })
    expect(snapshot).toContainEqual({ name: 'kenomi_daily_cycle_age_hours', value: 5 })
  })
})
