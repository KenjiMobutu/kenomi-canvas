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
