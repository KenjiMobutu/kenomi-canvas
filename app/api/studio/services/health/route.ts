/**
 * app/api/studio/services/health/route.ts
 * Remplace / étend le health check existant.
 * Expose le statut Ollama + indicateur fallback actif.
 */

import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { checkOllamaHealth } from '@/lib/llm-client'
import { requireAllowedUser } from '@/lib/auth-server'
import { resolveHealthServiceUrls, type UserInfraSettings } from '@/lib/infra-config'
import { unwrapOptionalInfraSettings } from '@/lib/user-settings-normalization'

type ServiceStatus = {
  status: 'ok' | 'degraded' | 'down'
  latency_ms?: number
  detail?: string
}

// 401/403 = service up mais auth requise — on considère "ok"
const REACHABLE_CODES = new Set([200, 201, 204, 301, 302, 401, 403, 404, 405])

async function pingService(url: string, timeoutMs = 5000): Promise<ServiceStatus> {
  const start = Date.now()
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    const res = await fetch(url, { signal: controller.signal })
    clearTimeout(timer)
    return {
      status: REACHABLE_CODES.has(res.status) ? 'ok' : 'degraded',
      latency_ms: Date.now() - start,
    }
  } catch (e) {
    return {
      status: 'down',
      latency_ms: Date.now() - start,
      detail: e instanceof Error ? e.message : 'unreachable',
    }
  }
}

export async function GET() {
  const cookieStore = await cookies()
  const { user, supabase: supabaseClient, response } = await requireAllowedUser(cookieStore)
  if (response) return response

  const { data, error } = await supabaseClient
    .from('user_settings')
    .select('ollama_base_url,n8n_base_url,supabase_url,coolify_url')
    .eq('user_id', user!.id)
    .maybeSingle()
  const urls = resolveHealthServiceUrls(
    unwrapOptionalInfraSettings(data as UserInfraSettings | null, error)
  )

  const [ollama, n8n, supabaseHealth, coolify] = await Promise.all([
    pingService(urls.ollama),
    pingService(urls.n8n),
    pingService(urls.supabase),
    pingService(urls.coolify),
  ])

  const ollamaHealthy = await checkOllamaHealth()
  const fallbackActive = !ollamaHealthy

  const toHealthResult = (s: ServiceStatus) => ({
    ok: s.status === 'ok',
    latencyMs: s.latency_ms ?? 0,
  })

  // Ollama est sur le réseau local — en prod le container ne peut pas l'atteindre
  // directement. On utilise checkOllamaHealth() comme source de vérité.
  const ollamaResult = { ok: ollamaHealthy, latencyMs: ollama.latency_ms ?? 0 }

  const allOk = ollamaHealthy && [n8n, supabaseHealth, coolify].every((s) => s.status === 'ok')

  return NextResponse.json(
    {
      ollama: ollamaResult,
      n8n: toHealthResult(n8n),
      supabase: toHealthResult(supabaseHealth),
      coolify: toHealthResult(coolify),
      _meta: {
        status: allOk ? 'ok' : 'degraded',
        llm: {
          provider: fallbackActive ? 'claude' : 'ollama',
          fallback_active: fallbackActive,
          claude_fallback_model: process.env.CLAUDE_FALLBACK_MODEL ?? 'claude-sonnet-4-5',
        },
        timestamp: new Date().toISOString(),
      },
    },
    { status: allOk ? 200 : 207 }
  )
}
