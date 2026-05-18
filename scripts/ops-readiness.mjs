import fs from 'node:fs'

const requiredScripts = [
  'typecheck',
  'test',
  'lint',
  'build',
  'smoke',
  'supabase:validate',
  'format:check',
  'ops:readiness',
]

const requiredRunbooks = [
  'docs/runbooks/daily-operations.md',
  'docs/runbooks/autonomy-incident.md',
  'docs/runbooks/stripe-webhook.md',
  'docs/runbooks/coolify-deploy.md',
  'docs/runbooks/database-migrations.md',
  'docs/runbooks/smoke-tests.md',
]

const requiredEnv = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'DATABASE_URL',
  'ALLOWED_EMAIL',
  'DASHBOARD_TOKEN_SECRET',
  'APP_ORIGIN',
]

function loadEnvFile(path) {
  if (!fs.existsSync(path)) return {}

  return Object.fromEntries(
    fs
      .readFileSync(path, 'utf8')
      .split(/\r?\n/)
      .filter((line) => line && !line.trim().startsWith('#') && line.includes('='))
      .map((line) => {
        const index = line.indexOf('=')
        return [line.slice(0, index), line.slice(index + 1)]
      })
  )
}

const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'))
const fileEnv = loadEnvFile('.env.local')
const env = { ...fileEnv, ...process.env }

const missingScripts = requiredScripts.filter((name) => !packageJson.scripts?.[name])
const missingRunbooks = requiredRunbooks.filter((path) => !fs.existsSync(path))
const missingEnv = requiredEnv.filter((name) => !env[name])

const result = {
  ok: missingScripts.length === 0 && missingRunbooks.length === 0 && missingEnv.length === 0,
  missingScripts,
  missingRunbooks,
  missingEnv,
}

process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)

if (!result.ok) {
  process.exitCode = 1
}
