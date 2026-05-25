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
import { isAllowedHermesAgentUrl, isAllowedOllamaUrl } from '@/lib/security'
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
    .select('hermes_agent_url,ollama_base_url,n8n_base_url,supabase_url,coolify_url')
    .eq('user_id', user!.id)
    .maybeSingle()
  const urls = resolveHealthServiceUrls(
    unwrapOptionalInfraSettings(data as UserInfraSettings | null, error)
  )

  const hermesAllowed = isAllowedHermesAgentUrl(urls.hermesAgent)
  const ollamaAllowed = isAllowedOllamaUrl(urls.ollama.replace(/\/api\/tags$/, ''))
  const hermesDenied: ServiceStatus = { status: 'down', detail: 'URL Hermes invalide' }
  const ollamaDenied: ServiceStatus = { status: 'down', detail: 'URL Ollama invalide' }

  const [hermesAgent, ollama, n8n, supabaseHealth, coolify] = await Promise.all([
    hermesAllowed ? pingService(urls.hermesAgent) : Promise.resolve(hermesDenied),
    ollamaAllowed ? pingService(urls.ollama) : Promise.resolve(ollamaDenied),
    pingService(urls.n8n),
    pingService(urls.supabase),
    pingService(urls.coolify),
  ])

  const ollamaHealthy = ollamaAllowed && (await checkOllamaHealth(urls.ollama))
  const fallbackActive = !ollamaHealthy || !ollamaAllowed

  const toHealthResult = (s: ServiceStatus) => ({
    ok: s.status === 'ok',
    latencyMs: s.latency_ms ?? 0,
  })

  // Ollama peut avoir une URL différente par utilisateur/env. Le statut final
  // doit suivre l'URL résolue ci-dessus, pas seulement OLLAMA_BASE_URL.
  const ollamaResult = { ok: ollamaHealthy, latencyMs: ollama.latency_ms ?? 0 }
  const hermesAgentResult = { ok: hermesAgent.status === 'ok', latencyMs: hermesAgent.latency_ms ?? 0 }

  const allOk =
    hermesAgent.status === 'ok' &&
    ollamaHealthy &&
    [n8n, supabaseHealth, coolify].every((s) => s.status === 'ok')

  return NextResponse.json(
      {
        hermesAgent: hermesAgentResult,
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
