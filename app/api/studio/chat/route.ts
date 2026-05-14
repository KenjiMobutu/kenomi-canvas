import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function POST(req: NextRequest) {
  const cookieStore = await cookies()

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
        },
      },
    }
  )

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { conversationId?: string; message?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { conversationId, message } = body
  if (!conversationId || !message?.trim()) {
    return NextResponse.json({ error: 'conversationId and message are required' }, { status: 400 })
  }

  const { data: settings } = await supabase
    .from('user_settings').select('*').eq('user_id', user.id).maybeSingle()

  const baseUrl = (settings?.ollama_base_url || 'http://192.168.0.14:11434').replace(/\/$/, '')
  const model = settings?.ollama_model || 'qwen3:8b'

  const { data: history } = await supabase
    .from('messages').select('role,content')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })

  await supabase.from('messages').insert({
    conversation_id: conversationId,
    user_id: user.id,
    role: 'user',
    content: message,
  })

  const messages = [...(history || []), { role: 'user', content: message }]

  let assistantContent = ''
  try {
    const resp = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages, stream: false, think: false }),
    })
    if (!resp.ok) {
      const t = await resp.text()
      throw new Error(`Ollama ${resp.status}: ${t.slice(0, 200)}`)
    }
    const json = await resp.json() as { message?: { content?: string } }
    assistantContent = json.message?.content || '(empty response)'
  } catch (e) {
    assistantContent = `⚠️ Impossible de joindre Ollama à ${baseUrl}. Vérifie Settings et que ton serveur Ollama est accessible.\n\nErreur: ${(e as Error).message}`
  }

  await supabase.from('messages').insert({
    conversation_id: conversationId,
    user_id: user.id,
    role: 'assistant',
    content: assistantContent,
  })

  await supabase.from('conversations')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', conversationId)

  return NextResponse.json({ content: assistantContent })
}
