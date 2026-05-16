import { NextRequest } from 'next/server'
import { cookies } from 'next/headers'
import { requireAllowedUser } from '@/lib/auth-server'
import { isAllowedOllamaUrl } from '@/lib/security'
import { isRateLimited } from '@/lib/rate-limit'
import { apiError } from '@/lib/api-response'

export async function POST(req: NextRequest) {
  const cookieStore = await cookies()
  const { user, supabase, response } = await requireAllowedUser(cookieStore)
  if (response) return response

  if (isRateLimited(`chat:${user!.id}`, { limit: 20, windowMs: 60_000 })) {
    return apiError('Trop de messages. Réessayez dans une minute.', 429)
  }

  const userId = user!.id

  let body: { conversationId?: string; message?: string; agentId?: string }
  try {
    body = await req.json()
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 })
  }

  const { conversationId, message, agentId } = body
  if (!conversationId || !message?.trim()) {
    return new Response(JSON.stringify({ error: 'conversationId and message are required' }), { status: 400 })
  }

  if (message.length > 8000) {
    return new Response(JSON.stringify({ error: 'Message trop long (max 8000 caractères)' }), { status: 400 })
  }

  // Vérifier ownership AVANT tout autre accès DB
  const { data: conv, error: convError } = await supabase
    .from('conversations')
    .select('id')
    .eq('id', conversationId)
    .eq('user_id', userId)
    .single()

  if (convError || !conv) {
    return new Response(JSON.stringify({ error: 'Conversation not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const { data: settings } = await supabase
    .from('user_settings').select('*').eq('user_id', userId).maybeSingle()

  const baseUrl = (settings?.ollama_base_url || 'http://192.168.0.14:11434').replace(/\/$/, '')
  if (!isAllowedOllamaUrl(baseUrl)) {
    return new Response(JSON.stringify({ error: 'URL Ollama invalide' }), { status: 400 })
  }

  const model = settings?.ollama_model || 'qwen3:8b'

  const { data: history } = await supabase
    .from('messages').select('role,content')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })

  await supabase.from('messages').insert({
    conversation_id: conversationId,
    user_id: userId,
    role: 'user',
    content: message,
  })

  const messages = [...(history || []), { role: 'user', content: message }]

  const encoder = new TextEncoder()
  let fullContent = ''

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const resp = await fetch(`${baseUrl}/api/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model, messages, stream: true, think: false }),
          signal: AbortSignal.timeout(30_000),
        })

        if (!resp.ok || !resp.body) {
          const errText = await resp.text().catch(() => '')
          const errMsg = `⚠️ Ollama ${resp.status}: ${errText.slice(0, 200)}`
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(errMsg)}\n\n`))
          controller.enqueue(encoder.encode('data: [DONE]\n\n'))
          fullContent = errMsg
          controller.close()
          return
        }

        const reader = resp.body.getReader()
        const dec = new TextDecoder()

        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          const chunk = dec.decode(value, { stream: true })
          for (const line of chunk.split('\n')) {
            const trimmed = line.trim()
            if (!trimmed) continue
            try {
              const json = JSON.parse(trimmed) as { message?: { content?: string }; done?: boolean }
              const token = json.message?.content ?? ''
              if (token) {
                fullContent += token
                controller.enqueue(encoder.encode(`data: ${JSON.stringify(token)}\n\n`))
              }
            } catch {
              // non-JSON line — skip
            }
          }
        }
      } catch (e) {
        const errMsg = `⚠️ Impossible de joindre Ollama à ${baseUrl}. Erreur: ${(e as Error).message}`
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(errMsg)}\n\n`))
        fullContent = errMsg
      }

      controller.enqueue(encoder.encode('data: [DONE]\n\n'))
      controller.close()

      // Persist assistant message after stream ends
      await supabase.from('messages').insert({
        conversation_id: conversationId,
        user_id: userId,
        role: 'assistant',
        content: fullContent,
      })
      await supabase.from('conversations')
        .update({ updated_at: new Date().toISOString(), ...(agentId ? { agent_id: agentId } : {}) })
        .eq('id', conversationId)
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  })
}
