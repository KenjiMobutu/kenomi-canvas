import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { requireAllowedUser } from '@/lib/auth-server'
import { isAllowedOllamaUrl, isAllowedWebhookUrl } from '@/lib/security'

async function pingUrl(url: string, timeoutMs = 4000): Promise<{ ok: boolean; latencyMs: number }> {
  const start = Date.now()
  try {
    const resp = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) })
    return { ok: resp.ok, latencyMs: Date.now() - start }
  } catch {
    return { ok: false, latencyMs: Date.now() - start }
  }
}

export async function GET() {
  const cookieStore = await cookies()
  const { user, supabase, response } = await requireAllowedUser(cookieStore)
  if (response) return response

  const { data: settings } = await supabase
    .from('user_settings')
    .select('ollama_base_url, n8n_base_url')
    .eq('user_id', user!.id)
    .maybeSingle()

  const ollamaBase = (settings?.ollama_base_url ?? 'http://192.168.0.14:11434').replace(/\/$/, '')
  const n8nBase = settings?.n8n_base_url?.replace(/\/$/, '') ?? null

  const checks: Record<string, { ok: boolean; latencyMs?: number; error?: string }> = {}

  if (isAllowedOllamaUrl(ollamaBase)) {
    checks.ollama = await pingUrl(`${ollamaBase}/api/tags`)
  } else {
    checks.ollama = { ok: false, error: 'URL non autorisée' }
  }

  if (n8nBase && isAllowedWebhookUrl(n8nBase)) {
    checks.n8n = await pingUrl(`${n8nBase}/healthz`)
  } else if (!n8nBase) {
    checks.n8n = { ok: false, error: 'Non configuré' }
  } else {
    checks.n8n = { ok: false, error: 'URL non autorisée' }
  }

  return NextResponse.json(checks)
}
