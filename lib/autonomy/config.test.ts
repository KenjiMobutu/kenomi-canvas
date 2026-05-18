import { describe, it, expect } from 'vitest'
import { getAutonomyConfig } from './config'

describe('getAutonomyConfig', () => {
  it('defaults: enabled, dryRun false, globalBudgetCapEur 100', () => {
    expect(getAutonomyConfig({})).toEqual({
      enabled: true,
      dryRun: false,
      globalBudgetCapEur: 100,
    })
  })

  it('respecte AUTONOMY_ENABLED=false', () => {
    expect(getAutonomyConfig({ AUTONOMY_ENABLED: 'false' }).enabled).toBe(false)
  })

  it('respecte AUTONOMY_DRY_RUN=true', () => {
    expect(getAutonomyConfig({ AUTONOMY_DRY_RUN: 'true' }).dryRun).toBe(true)
  })

  it('respecte AUTONOMY_GLOBAL_BUDGET_CAP_EUR=250', () => {
    expect(getAutonomyConfig({ AUTONOMY_GLOBAL_BUDGET_CAP_EUR: '250' }).globalBudgetCapEur).toBe(250)
  })

  it('fallback à 100 si AUTONOMY_GLOBAL_BUDGET_CAP_EUR invalide', () => {
    expect(getAutonomyConfig({ AUTONOMY_GLOBAL_BUDGET_CAP_EUR: 'abc' }).globalBudgetCapEur).toBe(100)
  })
})
