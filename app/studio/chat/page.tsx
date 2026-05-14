'use client'
import { useEffect, useRef, useState } from 'react'
import { createSupabaseBrowser } from '@/lib/supabase-browser'
import { useAuth } from '@/lib/auth-context'
import { Plus, Send, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

interface Conv { id: string; title: string; updated_at: string }
interface Msg { id: string; role: string; content: string; created_at: string }

export default function Chat() {
  const { user } = useAuth()
  const [convs, setConvs] = useState<Conv[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [messages, setMessages] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  async function loadConvs() {
    const supabase = createSupabaseBrowser()
    const { data } = await supabase.from('conversations').select('id,title,updated_at')
      .order('updated_at', { ascending: false })
    setConvs(data || [])
    if (!activeId && data?.[0]) setActiveId(data[0].id)
  }

  useEffect(() => { if (user) loadConvs() }, [user])

  useEffect(() => {
    if (!activeId) { setMessages([]); return }
    const supabase = createSupabaseBrowser()
    supabase.from('messages').select('*').eq('conversation_id', activeId)
      .order('created_at').then(({ data }) => setMessages(data || []))
  }, [activeId])

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  async function newConv() {
    if (!user) return
    const supabase = createSupabaseBrowser()
    const { data, error } = await supabase.from('conversations')
      .insert({ user_id: user.id, title: 'Nouvelle conversation' }).select().single()
    if (error) return toast.error(error.message)
    await loadConvs()
    setActiveId(data.id)
  }

  async function deleteConv(id: string) {
    const supabase = createSupabaseBrowser()
    await supabase.from('conversations').delete().eq('id', id)
    if (activeId === id) setActiveId(null)
    loadConvs()
  }

  async function handleSend() {
    if (!input.trim() || !activeId || sending) return
    const text = input.trim()
    setInput('')
    setMessages((m) => [...m, { id: 'tmp-u', role: 'user', content: text, created_at: '' }])
    setSending(true)
    try {
      const res = await fetch('/api/studio/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId: activeId, message: text }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }))
        throw new Error(err.error || res.statusText)
      }
      const json = await res.json()
      setMessages((m) => [
        ...m.filter((x) => x.id !== 'tmp-u'),
        { id: 'u-' + Date.now(), role: 'user', content: text, created_at: '' },
        { id: 'a-' + Date.now(), role: 'assistant', content: json.content, created_at: '' },
      ])
      const conv = convs.find((c) => c.id === activeId)
      if (conv && conv.title === 'Nouvelle conversation') {
        const supabase = createSupabaseBrowser()
        await supabase.from('conversations').update({ title: text.slice(0, 40) }).eq('id', activeId)
        loadConvs()
      }
    } catch (e) {
      toast.error((e as Error).message)
      setMessages((m) => m.filter((x) => x.id !== 'tmp-u'))
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="flex h-[calc(100vh-0px)]">
      <aside className="w-72 border-r border-border bg-surface flex flex-col shrink-0">
        <div className="p-4 border-b border-border">
          <button onClick={newConv}
            className="w-full flex items-center justify-center gap-2 py-2 bg-foreground text-background text-xs font-bold rounded-md">
            <Plus className="size-4" /> Nouvelle conversation
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {convs.map((c) => (
            <div key={c.id}
              className={`group flex items-center gap-2 px-3 py-2 rounded-md text-sm cursor-pointer ${activeId === c.id ? 'bg-white/5 text-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-white/5'}`}
              onClick={() => setActiveId(c.id)}>
              <span className="flex-1 truncate">{c.title}</span>
              <button onClick={(e) => { e.stopPropagation(); deleteConv(c.id) }}
                className="opacity-0 group-hover:opacity-100 hover:text-destructive">
                <Trash2 className="size-3" />
              </button>
            </div>
          ))}
          {convs.length === 0 && (
            <p className="text-xs text-muted-foreground p-4 text-center">Aucune conversation. Créez-en une pour commencer.</p>
          )}
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 border-b border-border flex items-center px-8 shrink-0">
          <h1 className="text-sm font-semibold">
            {convs.find((c) => c.id === activeId)?.title || 'Sélectionnez une conversation'}
          </h1>
        </header>

        <div className="flex-1 overflow-y-auto p-8">
          <div className="max-w-3xl mx-auto space-y-6">
            {messages.map((m, i) => (
              <div key={m.id + i} className={`flex gap-4 ${m.role === 'user' ? 'flex-row-reverse' : ''}`}>
                <div className={`size-8 shrink-0 rounded-full grid place-items-center text-xs font-bold ${m.role === 'user' ? 'bg-secondary' : 'brand-logo'}`}>
                  {m.role === 'user' ? 'U' : 'K'}
                </div>
                <div className={`px-4 py-3 rounded-2xl text-sm leading-relaxed max-w-xl whitespace-pre-wrap ${m.role === 'user' ? 'bg-accent text-accent-foreground rounded-tr-none' : 'bg-surface ring-1 ring-border rounded-tl-none'}`}>
                  {m.content}
                </div>
              </div>
            ))}
            {sending && <p className="text-xs text-muted-foreground font-mono">Kenomi réfléchit...</p>}
            <div ref={bottomRef} />
            {!activeId && (
              <div className="text-center text-muted-foreground py-20">
                <p>Démarrez une nouvelle conversation pour discuter avec votre IA.</p>
              </div>
            )}
          </div>
        </div>

        {activeId && (
          <div className="border-t border-border p-4 shrink-0">
            <div className="max-w-3xl mx-auto flex gap-2 p-2 bg-surface ring-1 ring-border rounded-lg">
              <input
                value={input} onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
                placeholder="Posez une question à Kenomi..."
                className="flex-1 bg-transparent outline-none text-sm px-2"
                disabled={sending}
              />
              <button onClick={handleSend} disabled={sending || !input.trim()}
                className="size-8 grid place-items-center brand-logo rounded text-white disabled:opacity-30">
                <Send className="size-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
