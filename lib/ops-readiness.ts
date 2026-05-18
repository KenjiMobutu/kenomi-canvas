export const REQUIRED_OPS_SCRIPTS = [
  'typecheck',
  'test',
  'lint',
  'build',
  'smoke',
  'supabase:validate',
  'format:check',
  'ops:readiness',
] as const

export const REQUIRED_OPS_RUNBOOKS = [
  'docs/runbooks/daily-operations.md',
  'docs/runbooks/autonomy-incident.md',
  'docs/runbooks/stripe-webhook.md',
  'docs/runbooks/coolify-deploy.md',
  'docs/runbooks/database-migrations.md',
  'docs/runbooks/smoke-tests.md',
] as const

export const REQUIRED_OPS_ENV = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'DATABASE_URL',
  'ALLOWED_EMAIL',
  'DASHBOARD_TOKEN_SECRET',
  'APP_ORIGIN',
] as const

export interface OpsReadinessInput {
  packageJson: {
    scripts?: Record<string, string>
  }
  existingFiles: Set<string>
  env: Record<string, string | undefined>
}

export interface OpsReadinessResult {
  ok: boolean
  missingScripts: string[]
  missingRunbooks: string[]
  missingEnv: string[]
}

export function evaluateOpsReadiness(input: OpsReadinessInput): OpsReadinessResult {
  const scripts = input.packageJson.scripts ?? {}
  const missingScripts = REQUIRED_OPS_SCRIPTS.filter((name) => !scripts[name])
  const missingRunbooks = REQUIRED_OPS_RUNBOOKS.filter((path) => !input.existingFiles.has(path))
  const missingEnv = REQUIRED_OPS_ENV.filter((name) => !input.env[name])

  return {
    ok: missingScripts.length === 0 && missingRunbooks.length === 0 && missingEnv.length === 0,
    missingScripts,
    missingRunbooks,
    missingEnv,
  }
}
