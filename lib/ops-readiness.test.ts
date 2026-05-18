import { describe, expect, it } from 'vitest'
import { evaluateOpsReadiness } from './ops-readiness'

describe('evaluateOpsReadiness', () => {
  it('requires the daily operations scripts', () => {
    const result = evaluateOpsReadiness({
      packageJson: {
        scripts: {
          typecheck: 'tsc --noEmit',
          test: 'vitest run',
          lint: 'eslint .',
          build: 'next build',
          smoke: 'node scripts/smoke-app.mjs',
          'supabase:validate': 'node scripts/validate-supabase-remote.mjs',
          'format:check': 'prettier --check',
          'ops:readiness': 'node scripts/ops-readiness.mjs',
        },
      },
      existingFiles: new Set([
        'docs/runbooks/daily-operations.md',
        'docs/runbooks/autonomy-incident.md',
        'docs/runbooks/stripe-webhook.md',
        'docs/runbooks/coolify-deploy.md',
        'docs/runbooks/database-migrations.md',
        'docs/runbooks/smoke-tests.md',
      ]),
      env: {
        NEXT_PUBLIC_SUPABASE_URL: 'https://supabase.test',
        NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon',
        SUPABASE_SERVICE_ROLE_KEY: 'service',
        DATABASE_URL: 'postgres://example',
        ALLOWED_EMAIL: 'operator@example.com',
        DASHBOARD_TOKEN_SECRET: 'secret',
        APP_ORIGIN: 'https://app.test',
      },
    })

    expect(result.ok).toBe(true)
    expect(result.missingScripts).toEqual([])
    expect(result.missingRunbooks).toEqual([])
    expect(result.missingEnv).toEqual([])
  })

  it('reports missing operational prerequisites without exposing secret values', () => {
    const result = evaluateOpsReadiness({
      packageJson: {
        scripts: {
          test: 'vitest run',
        },
      },
      existingFiles: new Set(['docs/runbooks/daily-operations.md']),
      env: {
        NEXT_PUBLIC_SUPABASE_URL: 'https://supabase.test',
      },
    })

    expect(result.ok).toBe(false)
    expect(result.missingScripts).toContain('ops:readiness')
    expect(result.missingScripts).toContain('smoke')
    expect(result.missingRunbooks).toContain('docs/runbooks/autonomy-incident.md')
    expect(result.missingEnv).toContain('SUPABASE_SERVICE_ROLE_KEY')
    expect(JSON.stringify(result)).not.toContain('https://supabase.test')
  })
})
