export interface AutonomyConfig {
  enabled: boolean
  dryRun: boolean
  globalBudgetCapEur: number
}

export function getAutonomyConfig(
  env: Record<string, string | undefined> = process.env
): AutonomyConfig {
  const rawCap = env.AUTONOMY_GLOBAL_BUDGET_CAP_EUR
  const parsedCap = rawCap !== undefined ? Number(rawCap) : NaN
  return {
    enabled: env.AUTONOMY_ENABLED !== 'false',
    dryRun: env.AUTONOMY_DRY_RUN === 'true',
    globalBudgetCapEur: Number.isFinite(parsedCap) ? parsedCap : 100,
  }
}
