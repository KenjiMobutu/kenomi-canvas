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

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
  const coolifyUrl = process.env.COOLIFY_URL ?? 'http://192.168.0.19:8000'

  const [ollamaResult, n8nResult, supabaseResult, coolifyResult] = await Promise.all([
    isAllowedOllamaUrl(ollamaBase)
      ? pingUrl(`${ollamaBase}/api/tags`)
      : Promise.resolve({ ok: false, latencyMs: 0, error: 'URL non autorisée' }),

    n8nBase && isAllowedWebhookUrl(n8nBase)
      ? pingUrl(`${n8nBase}/healthz`)
      : Promise.resolve({ ok: false, latencyMs: 0, error: n8nBase ? 'URL non autorisée' : 'Non configuré' }),

    supabaseUrl
      ? pingUrl(`${supabaseUrl}/rest/v1/`)
      : Promise.resolve({ ok: false, latencyMs: 0, error: 'URL non configurée' }),

    pingUrl(`${coolifyUrl}/api/v1/version`),
  ])

  return NextResponse.json({
    ollama: ollamaResult,
    n8n: n8nResult,
    supabase: supabaseResult,
    coolify: coolifyResult,
  })
}
