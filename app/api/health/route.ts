import { db } from '@/lib/db'
import { createClient } from '@supabase/supabase-js'

interface Check {
  ok: boolean
  latencyMs?: number
  error?: string
}

export async function GET() {
  const checks: Record<string, Check> = {}

  // 1. Variables d'env critiques
  const requiredEnvs = [
    'NEXT_PUBLIC_SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    'SUPABASE_SERVICE_ROLE_KEY',
    'DATABASE_URL',
    'DASHBOARD_PASSWORD',
    'DASHBOARD_TOKEN_SECRET',
    'ALLOWED_EMAIL',
  ]
  const missingEnvs = requiredEnvs.filter(k => !process.env[k])
  checks.env = {
    ok: missingEnvs.length === 0,
    ...(missingEnvs.length > 0 ? { error: `Manquantes: ${missingEnvs.join(', ')}` } : {}),
  }

  // 2. Base de données Prisma
  const dbStart = Date.now()
  try {
    await db.$queryRaw`SELECT 1`
    checks.database = { ok: true, latencyMs: Date.now() - dbStart }
  } catch (e) {
    checks.database = { ok: false, latencyMs: Date.now() - dbStart, error: (e as Error).message }
  }

  // 3. Supabase Auth (ping simple)
  const sbStart = Date.now()
  try {
    const sb = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
    const { error } = await sb.from('profiles').select('id').limit(1)
    checks.supabase = {
      ok: !error,
      latencyMs: Date.now() - sbStart,
      ...(error ? { error: error.message } : {}),
    }
  } catch (e) {
    checks.supabase = { ok: false, latencyMs: Date.now() - sbStart, error: (e as Error).message }
  }

  const allOk = Object.values(checks).every(c => c.ok)
  const status = allOk ? 200 : 503

  return Response.json(
    { status: allOk ? 'ok' : 'degraded', checks, timestamp: new Date().toISOString() },
    { status }
  )
}
