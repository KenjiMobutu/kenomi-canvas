export interface AutonomyConfig {
  enabled: boolean
  dryRun: boolean
  globalBudgetCapEur: number
  portfolioMaxNewVenturesPerDay: number
  portfolioMaxActiveExperiments: number
}

function readPositiveInt(value: string | undefined, fallback: number): number {
  const parsed = value !== undefined ? Number.parseInt(value, 10) : Number.NaN
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

export function getAutonomyConfig(
  env: Record<string, string | undefined> = process.env
): AutonomyConfig {
  return {
    enabled: env.AUTONOMY_ENABLED !== 'false',
    dryRun: env.AUTONOMY_DRY_RUN === 'true',
    globalBudgetCapEur: readPositiveInt(env.AUTONOMY_GLOBAL_BUDGET_CAP_EUR, 100),
    portfolioMaxNewVenturesPerDay: readPositiveInt(
      env.AUTONOMY_PORTFOLIO_MAX_NEW_VENTURES_PER_DAY,
      1
    ),
    portfolioMaxActiveExperiments: readPositiveInt(
      env.AUTONOMY_PORTFOLIO_MAX_ACTIVE_EXPERIMENTS,
      5
    ),
  }
}
