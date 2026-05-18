import { db } from '@/lib/db'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { buildHealthSummary, checkEnvVars, getHealthDependencyConfig } from '@/lib/health-check'

interface Check {
  ok: boolean
  latencyMs?: number
  error?: string
}

export async function GET() {
  const checks: Record<string, Check> = {}
  const config = getHealthDependencyConfig()

  // 1. Variables d'env critiques
  checks.env = checkEnvVars()

  // 2. Base de données Prisma
  const dbStart = Date.now()
  try {
    await db.$queryRaw`SELECT 1`
    checks.database = { ok: true, latencyMs: Date.now() - dbStart }
  } catch (e) {
    checks.database = { ok: false, latencyMs: Date.now() - dbStart, error: process.env.NODE_ENV === 'production' ? 'database check failed' : (e as Error).message }
  }

  // 3. Supabase Auth (ping simple)
  const sbStart = Date.now()
  try {
    const { error } = await supabaseAdmin.from('profiles').select('id').limit(1)
    checks.supabase = {
      ok: !error,
      latencyMs: Date.now() - sbStart,
      ...(error ? { error: error.message } : {}),
    }
  } catch (e) {
    checks.supabase = { ok: false, latencyMs: Date.now() - sbStart, error: process.env.NODE_ENV === 'production' ? 'supabase check failed' : (e as Error).message }
  }

  // 4. Storage bucket documents
  const stStart = Date.now()
  try {
    const { error: stError } = await supabaseAdmin.storage
      .from('documents')
      .list('', { limit: 1 })
    checks.storage = {
      ok: !stError,
      latencyMs: Date.now() - stStart,
      ...(stError ? { error: process.env.NODE_ENV === 'production' ? 'storage check failed' : stError.message } : {}),
    }
  } catch (e) {
    checks.storage = {
      ok: false,
      latencyMs: Date.now() - stStart,
      error: process.env.NODE_ENV === 'production' ? 'storage check failed' : (e as Error).message,
    }
  }

  const summary = buildHealthSummary({ checks, config })

  return Response.json(
    { status: summary.status, checks, timestamp: new Date().toISOString() },
    { status: summary.statusCode }
  )
}
