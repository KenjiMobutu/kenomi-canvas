export const REQUIRED_ENV_VARS = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'DATABASE_URL',
  'DASHBOARD_PASSWORD',
  'DASHBOARD_TOKEN_SECRET',
  'ALLOWED_EMAIL',
] as const

export interface EnvCheck {
  ok: boolean
  error?: string
}

export interface HealthDependencyConfig {
  databaseRequired: boolean
  supabaseRequired: boolean
  storageRequired: boolean
}

export interface HealthSummaryInput {
  checks: Record<string, EnvCheck>
  config: HealthDependencyConfig
}

export interface HealthSummary {
  ok: boolean
  status: 'ok' | 'degraded'
  statusCode: 200 | 503
}

export function checkEnvVars(env: NodeJS.ProcessEnv = process.env): EnvCheck {
  const missing = REQUIRED_ENV_VARS.filter(k => !env[k])
  if (missing.length === 0) return { ok: true }
  return {
    ok: false,
    error: env.NODE_ENV === 'production'
      ? 'configuration incomplete'
      : `Manquantes: ${missing.join(', ')}`,
  }
}

export function getHealthDependencyConfig(env: NodeJS.ProcessEnv = process.env): HealthDependencyConfig {
  return {
    databaseRequired: env.HEALTH_DATABASE_REQUIRED !== 'false',
    supabaseRequired: env.HEALTH_SUPABASE_REQUIRED !== 'false',
    storageRequired: env.HEALTH_STORAGE_REQUIRED !== 'false',
  }
}

export function buildHealthSummary(input: HealthSummaryInput): HealthSummary {
  const requiredChecks = [
    input.checks.env,
    input.config.databaseRequired ? input.checks.database : undefined,
    input.config.supabaseRequired ? input.checks.supabase : undefined,
    input.config.storageRequired ? input.checks.storage : undefined,
  ].filter((check): check is EnvCheck => Boolean(check))

  const ok = requiredChecks.every(check => check.ok)
  return {
    ok,
    status: ok ? 'ok' : 'degraded',
    statusCode: ok ? 200 : 503,
  }
}
