import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { requireAllowedUser } from '@/lib/auth-server'
import { isRateLimited } from '@/lib/rate-limit'
import { isAllowedOllamaUrl } from '@/lib/security'
import { apiError } from '@/lib/api-response'

export async function POST(req: NextRequest) {
  const cookieStore = await cookies()
  const { user, supabase, response } = await requireAllowedUser(cookieStore)
  if (response) return response

  if (isRateLimited(`agent-run:${user!.id}`, { limit: 10, windowMs: 60_000 })) {
    return apiError('Trop de runs. Réessayez dans une minute.', 429)
  }

  let agentId: string, prompt: string
  try {
    const body = await req.json()
    agentId = body.agentId ?? ''
    prompt = body.prompt ?? ''
  } catch {
    return apiError('JSON invalide', 400)
  }
  if (!agentId) return apiError('agentId requis', 400)

  const { data: cfg } = await supabase
    .from('agent_configs')
    .select('model, system_prompt, temperature, max_tokens, paused')
    .eq('user_id', user!.id)
    .eq('agent_id', agentId)
    .maybeSingle()

  if (cfg?.paused) return apiError('Agent en pause', 409)

  const { data: settings } = await supabase
    .from('user_settings')
    .select('ollama_base_url')
    .eq('user_id', user!.id)
    .maybeSingle()

  const baseUrl = (settings?.ollama_base_url ?? 'http://192.168.0.14:11434').replace(/\/$/, '')
  if (!isAllowedOllamaUrl(baseUrl)) return apiError('URL Ollama non autorisée', 400)

  const model = cfg?.model ?? 'qwen3:8b'
  const systemPrompt = cfg?.system_prompt ?? `Tu es l'agent ${agentId}. Tu es opérationnel et prêt à exécuter des missions.`
  const userPrompt = prompt || 'Confirme que tu es opérationnel et décris ta mission en 1 phrase.'

  const startMs = Date.now()

  try {
    const resp = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        stream: false,
        think: false,
        options: {
          temperature: cfg?.temperature ?? 0.7,
          num_predict: cfg?.max_tokens ?? 512,
        },
      }),
      signal: AbortSignal.timeout(30_000),
    })

    if (!resp.ok) {
      return apiError(`Ollama ${resp.status}`, 502)
    }

    const json = await resp.json() as { message?: { content?: string } }
    const content = json.message?.content ?? ''
    const durationMs = Date.now() - startMs

    await supabase.from('messages').insert({
      user_id: user!.id,
      role: 'assistant',
      content,
      agent_id: agentId,
    })

    const { data: currentCfg } = await supabase
      .from('agent_configs')
      .select('run_count')
      .eq('user_id', user!.id)
      .eq('agent_id', agentId)
      .maybeSingle()

    await supabase.from('agent_configs').upsert({
      user_id: user!.id,
      agent_id: agentId,
      run_count: (currentCfg?.run_count ?? 0) + 1,
      last_run_at: new Date().toISOString(),
    }, { onConflict: 'user_id,agent_id' })

    return NextResponse.json({ ok: true, content, durationMs, model })
  } catch (e) {
    const isTimeout = e instanceof Error && e.name === 'TimeoutError'
    return apiError(isTimeout ? 'Ollama timeout (30s)' : 'Ollama injoignable', 502)
  }
}
