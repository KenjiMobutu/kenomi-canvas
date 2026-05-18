'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createSupabaseBrowser } from '@/lib/supabase-browser'
import { useAuth } from '@/lib/auth-context'
import { toast } from 'sonner'
import { AGENTS_DATA, useIsMobile } from '@/lib/studio-utils'
import {
  bg,
  surface,
  surface2,
  line,
  line2,
  text,
  muted,
  muted2,
  accent,
  accent2,
  rose,
} from '@/lib/ck-vars'
import { Plus, Trash2, Send, ChevronDown, Menu, X } from 'lucide-react'

interface Conv {
  id: string
  title: string
  updated_at: string
  agent_id?: string
}
interface Msg {
  id: string
  role: string
  content: string
  created_at: string
}

const QUICK_CMDS = [
  'Lance une analyse niche pour ma prochaine venture',
  'Génère une landing pour ma venture en cours',
  'Résume les métriques de la semaine',
  'Crée un workflow n8n pour scorer mes leads',
  'Quel est le CAC moyen ce mois-ci ?',
]

export default function ChatPage() {
  const router = useRouter()
  const { user } = useAuth()
  const [theme, setTheme] = useState<'dark' | 'light'>('dark')
  const [convs, setConvs] = useState<Conv[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [messages, setMessages] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [agentId, setAgentId] = useState('decision')
  const [agentOpen, setAgentOpen] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const isMobile = useIsMobile()
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    try {
      setTheme((localStorage.getItem('kenomi-ck-theme') as 'dark' | 'light') || 'dark')
    } catch {}
  }, [])

  const toggleTheme = useCallback(() => {
    setTheme((t) => {
      const next = t === 'dark' ? 'light' : 'dark'
      try {
        localStorage.setItem('kenomi-ck-theme', next)
      } catch {}
      return next
    })
  }, [])

  async function loadConvs() {
    if (!user) return
    const supabase = createSupabaseBrowser()
    const { data, error } = await supabase
      .from('conversations')
      .select('id,title,updated_at,agent_id')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false })
    if (error) {
      toast.error(error.message)
      return
    }
    setConvs(data || [])
    if (!activeId && data?.[0]) setActiveId(data[0].id)
  }

  useEffect(() => {
    if (user) loadConvs()
  }, [user]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!activeId || !user) {
      setMessages([])
      return
    }
    const supabase = createSupabaseBrowser()
    supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', activeId)
      .eq('user_id', user.id)
      .order('created_at')
      .then(({ data }) => setMessages(data || []))
  }, [activeId, user])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function newConv(): Promise<string | null> {
    if (!user) return null
    const supabase = createSupabaseBrowser()
    const { data, error } = await supabase
      .from('conversations')
      .insert({ user_id: user.id, title: 'Nouvelle conversation', agent_id: agentId })
      .select()
      .single()
    if (error) {
      toast.error(error.message)
      return null
    }
    await loadConvs()
    setActiveId(data.id)
    return data.id
  }

  async function newConvAndSend(text: string) {
    const id = await newConv()
    if (!id) return
    if (!user) return
    setSending(true)
    setInput('')
    const userMsg: Msg = {
      id: crypto.randomUUID(),
      role: 'user',
      content: text,
      created_at: new Date().toISOString(),
    }
    setMessages((prev) => [...prev, userMsg])
    try {
      const res = await fetch('/api/studio/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId: id, message: text, agentId }),
      })
      if (!res.ok || !res.body) {
        toast.error('Erreur chat')
        setSending(false)
        return
      }
      const reader = res.body.getReader()
      const dec = new TextDecoder()
      let full = ''
      const assistantId = crypto.randomUUID()
      setMessages((prev) => [
        ...prev,
        { id: assistantId, role: 'assistant', content: '', created_at: new Date().toISOString() },
      ])
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const chunk = dec.decode(value, { stream: true })
        for (const line of chunk.split('\n')) {
          const t = line.trim()
          if (!t.startsWith('data: ')) continue
          const raw = t.slice(6)
          if (raw === '[DONE]') break
          try {
            const token = JSON.parse(raw) as string
            full += token
            setMessages((prev) =>
              prev.map((m) => (m.id === assistantId ? { ...m, content: full } : m))
            )
          } catch {}
        }
      }
    } catch (e) {
      toast.error((e as Error).message)
    }
    setSending(false)
    loadConvs()
  }

  async function deleteConv(id: string) {
    if (!user) return
    const supabase = createSupabaseBrowser()
    const { error } = await supabase
      .from('conversations')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id)
    if (error) {
      toast.error(error.message)
      return
    }
    if (activeId === id) {
      setActiveId(null)
      setMessages([])
    }
    loadConvs()
  }

  async function handleSend(overrideText?: string) {
    const msgText = overrideText ?? input.trim()
    if (!msgText || !activeId || sending) return
    setInput('')
    const userMsgId = 'u-' + crypto.randomUUID()
    const asstMsgId = 'a-' + crypto.randomUUID()
    setMessages((m) => [...m, { id: userMsgId, role: 'user', content: msgText, created_at: '' }])
    setSending(true)

    try {
      const res = await fetch('/api/studio/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId: activeId, message: msgText, agentId }),
      })
      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => ({ error: res.statusText }))
        throw new Error(err.error || res.statusText)
      }

      // Insert empty assistant bubble immediately
      setMessages((m) => [...m, { id: asstMsgId, role: 'assistant', content: '', created_at: '' }])

      const reader = res.body.getReader()
      const dec = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += dec.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const payload = line.slice(6)
          if (payload === '[DONE]') break
          try {
            const token = JSON.parse(payload) as string
            setMessages((m) =>
              m.map((x) => (x.id === asstMsgId ? { ...x, content: x.content + token } : x))
            )
          } catch {
            /* skip */
          }
        }
      }

      const conv = convs.find((c) => c.id === activeId)
      if (conv?.title === 'Nouvelle conversation' && user) {
        const supabase = createSupabaseBrowser()
        await supabase
          .from('conversations')
          .update({ title: msgText.slice(0, 48) })
          .eq('id', activeId)
          .eq('user_id', user.id)
        loadConvs()
      }
    } catch (e) {
      toast.error((e as Error).message)
      setMessages((m) => m.filter((x) => x.id !== userMsgId && x.id !== asstMsgId))
    } finally {
      setSending(false)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }

  function onKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const activeAgent = AGENTS_DATA.find((a) => a.id === agentId) ?? AGENTS_DATA[0]
  const activeConv = convs.find((c) => c.id === activeId)

  const vars =
    theme === 'dark'
      ? {
          '--ck-bg': '#07090d',
          '--ck-surface': '#0e1118',
          '--ck-surface-2': '#141823',
          '--ck-line': 'rgba(255,255,255,.07)',
          '--ck-line-2': 'rgba(255,255,255,.12)',
          '--ck-text': '#e7eaf0',
          '--ck-muted': '#8a93a6',
          '--ck-muted-2': '#5b6478',
          '--ck-accent': '#ff6a3d',
          '--ck-accent-2': '#ffd166',
          '--ck-emerald': '#34d399',
          '--ck-amber': '#fbbf24',
          '--ck-rose': '#fb7185',
          '--ck-cyan': '#22d3ee',
          '--ck-violet': '#a78bfa',
          '--ck-fuchsia': '#e879f9',
        }
      : {
          '--ck-bg': '#f4f1ec',
          '--ck-surface': '#ffffff',
          '--ck-surface-2': '#f9f5ee',
          '--ck-line': 'rgba(15,18,28,.08)',
          '--ck-line-2': 'rgba(15,18,28,.14)',
          '--ck-text': '#14181f',
          '--ck-muted': '#5b6478',
          '--ck-muted-2': '#8a93a6',
          '--ck-accent': '#ff6a3d',
          '--ck-accent-2': '#ffd166',
          '--ck-emerald': '#34d399',
          '--ck-amber': '#fbbf24',
          '--ck-rose': '#fb7185',
          '--ck-cyan': '#22d3ee',
          '--ck-violet': '#a78bfa',
          '--ck-fuchsia': '#e879f9',
        }

  return (
    <div
      style={
        {
          ...vars,
          background: bg,
          color: text,
          height: '100dvh',
          display: 'flex',
          flexDirection: 'column',
          fontFamily: 'var(--font-sans)',
        } as React.CSSProperties
      }
    >
      {/* Header */}
      <header
        style={{
          height: isMobile ? 50 : 56,
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: isMobile ? '0 12px' : '0 24px',
          background: bg,
          borderBottom: `1px solid ${line}`,
          zIndex: 10,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 8 : 16 }}>
          {isMobile && (
            <button
              onClick={() => setSidebarOpen((o) => !o)}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 32,
                height: 32,
                borderRadius: 6,
                background: sidebarOpen ? surface2 : 'transparent',
                border: `1px solid ${sidebarOpen ? line2 : line}`,
                color: muted,
                cursor: 'pointer',
                flexShrink: 0,
              }}
            >
              {sidebarOpen ? <X size={14} /> : <Menu size={14} />}
            </button>
          )}
          {!isMobile && (
            <div
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 10,
                letterSpacing: '.18em',
                textTransform: 'uppercase',
                color: muted,
              }}
            >
              System · Command Chat
            </div>
          )}
          {activeConv && (
            <div
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: isMobile ? 11 : 12,
                color: text,
                fontWeight: 600,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                maxWidth: isMobile ? 140 : 'none',
              }}
            >
              {activeConv.title}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {/* Agent selector */}
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => setAgentOpen((o) => !o)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '5px 10px',
                borderRadius: 6,
                background: surface2,
                border: `1px solid ${line2}`,
                color: text,
                cursor: 'pointer',
                fontFamily: 'var(--font-mono)',
                fontSize: 11,
              }}
            >
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: activeAgent.color,
                  flexShrink: 0,
                }}
              />
              {activeAgent.code}
              <ChevronDown size={11} style={{ color: muted }} />
            </button>
            {agentOpen && (
              <div
                style={{
                  position: 'absolute',
                  top: '100%',
                  right: 0,
                  marginTop: 4,
                  background: surface,
                  border: `1px solid ${line2}`,
                  borderRadius: 10,
                  overflow: 'hidden',
                  zIndex: 50,
                  minWidth: 200,
                  boxShadow: '0 8px 32px rgba(0,0,0,.4)',
                }}
              >
                {AGENTS_DATA.map((ag) => (
                  <button
                    key={ag.id}
                    onClick={() => {
                      setAgentId(ag.id)
                      setAgentOpen(false)
                    }}
                    style={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: '9px 14px',
                      background: ag.id === agentId ? surface2 : 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                      color: text,
                      textAlign: 'left',
                    }}
                  >
                    <span
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        background: ag.color,
                        flexShrink: 0,
                      }}
                    />
                    <div>
                      <div
                        style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700 }}
                      >
                        {ag.code} · {ag.name}
                      </div>
                      <div style={{ fontSize: 10, color: muted }}>{ag.role}</div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
          <button
            onClick={newConv}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '5px 10px',
              borderRadius: 6,
              background: accent,
              color: '#0b0d12',
              border: 'none',
              cursor: 'pointer',
              fontFamily: 'var(--font-mono)',
              fontSize: 10,
              fontWeight: 800,
              letterSpacing: '.1em',
            }}
          >
            <Plus size={12} /> {!isMobile && 'Nouveau'}
          </button>
          {!isMobile && (
            <button
              onClick={() => router.push('/studio')}
              style={{
                padding: '5px 10px',
                borderRadius: 6,
                cursor: 'pointer',
                background: 'transparent',
                color: muted,
                border: `1px solid ${line}`,
                fontFamily: 'var(--font-mono)',
                fontSize: 10,
                letterSpacing: '.12em',
              }}
            >
              ← Cockpit
            </button>
          )}
          <button
            onClick={toggleTheme}
            style={{
              padding: '5px 10px',
              borderRadius: 6,
              cursor: 'pointer',
              background: 'transparent',
              color: muted,
              border: `1px solid ${line}`,
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
            }}
          >
            {theme === 'dark' ? '☀' : '☾'}
          </button>
        </div>
      </header>

      {/* Body */}
      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        {/* Sidebar */}
        <aside
          style={{
            width: isMobile ? '100%' : 260,
            flexShrink: 0,
            display: isMobile ? (sidebarOpen ? 'flex' : 'none') : 'flex',
            flexDirection: 'column',
            background: surface,
            borderRight: isMobile ? 'none' : `1px solid ${line}`,
            ...(isMobile
              ? { position: 'fixed', top: 50, left: 0, right: 0, bottom: 60, zIndex: 80 }
              : {}),
          }}
        >
          <div style={{ padding: '10px 10px 8px', borderBottom: `1px solid ${line}` }}>
            <div
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 9,
                letterSpacing: '.18em',
                textTransform: 'uppercase',
                color: muted2,
                padding: '0 4px',
                marginBottom: 6,
              }}
            >
              Conversations
            </div>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '6px 6px' }}>
            {convs.map((c) => {
              const ag = AGENTS_DATA.find((a) => a.id === c.agent_id)
              const isActive = activeId === c.id
              return (
                <div
                  key={c.id}
                  onClick={() => {
                    setActiveId(c.id)
                    if (isMobile) setSidebarOpen(false)
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '9px 10px',
                    borderRadius: 8,
                    background: isActive ? surface2 : 'transparent',
                    cursor: 'pointer',
                    transition: 'background .1s',
                    border: isActive ? `1px solid ${line2}` : '1px solid transparent',
                    marginBottom: 2,
                  }}
                >
                  {ag && (
                    <span
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        background: ag.color,
                        flexShrink: 0,
                      }}
                    />
                  )}
                  <span
                    style={{
                      flex: 1,
                      minWidth: 0,
                      fontFamily: 'var(--font-sans)',
                      fontSize: 12,
                      fontWeight: isActive ? 600 : 400,
                      color: isActive ? text : muted,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {c.title}
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      deleteConv(c.id)
                    }}
                    style={{
                      opacity: 0,
                      background: 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                      color: rose,
                      padding: 2,
                      borderRadius: 3,
                      flexShrink: 0,
                      transition: 'opacity .1s',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.opacity = '1')}
                    onMouseLeave={(e) => (e.currentTarget.style.opacity = '0')}
                  >
                    <Trash2 size={11} />
                  </button>
                </div>
              )
            })}
            {convs.length === 0 && (
              <div style={{ padding: '40px 12px', textAlign: 'center' }}>
                <div style={{ fontSize: 28, marginBottom: 10 }}>💬</div>
                <p style={{ fontSize: 11, color: muted2, lineHeight: 1.5 }}>
                  Aucune conversation.
                  <br />
                  Créez-en une pour commencer.
                </p>
              </div>
            )}
          </div>
        </aside>

        {/* Main chat area */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          {/* Messages */}
          <div style={{ flex: 1, overflowY: 'auto', padding: isMobile ? '16px 0' : '32px 0' }}>
            <div
              style={{
                maxWidth: 780,
                margin: '0 auto',
                padding: isMobile ? '0 12px' : '0 32px',
                display: 'flex',
                flexDirection: 'column',
                gap: 24,
              }}
            >
              {/* Welcome / empty state */}
              {!activeId && (
                <div style={{ paddingTop: 60, textAlign: 'center' }}>
                  <div
                    style={{
                      width: 64,
                      height: 64,
                      borderRadius: 16,
                      margin: '0 auto 20px',
                      background: `conic-gradient(from 0deg, ${activeAgent.color}, transparent 45%, ${activeAgent.color})`,
                      display: 'grid',
                      placeItems: 'center',
                      WebkitMask: 'radial-gradient(circle, transparent 55%, #000 56%)',
                      mask: 'radial-gradient(circle, transparent 55%, #000 56%)',
                    }}
                  />
                  <h2
                    style={{
                      fontFamily: 'var(--font-display)',
                      fontSize: 28,
                      fontWeight: 800,
                      color: text,
                      marginBottom: 8,
                      letterSpacing: '-.02em',
                    }}
                  >
                    Command Chat
                  </h2>
                  <p style={{ fontSize: 13, color: muted, maxWidth: 440, margin: '0 auto 32px' }}>
                    Dialoguez avec vos agents Kenomi. Donnez des instructions, analysez des données,
                    orchestrez vos ventures.
                  </p>
                  <button
                    onClick={newConv}
                    style={{
                      padding: '12px 28px',
                      borderRadius: 999,
                      background: `linear-gradient(90deg, ${activeAgent.color}, ${accent2})`,
                      color: '#0b0d12',
                      border: 'none',
                      cursor: 'pointer',
                      fontFamily: 'var(--font-display)',
                      fontWeight: 800,
                      fontSize: 13,
                      letterSpacing: '.04em',
                      boxShadow: `0 6px 24px ${activeAgent.color}44`,
                    }}
                  >
                    Démarrer une conversation
                  </button>
                  {/* Quick commands */}
                  <div style={{ marginTop: 48 }}>
                    <div
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: 9.5,
                        letterSpacing: '.18em',
                        textTransform: 'uppercase',
                        color: muted2,
                        marginBottom: 12,
                      }}
                    >
                      Commandes rapides
                    </div>
                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 6,
                        maxWidth: 500,
                        margin: '0 auto',
                      }}
                    >
                      {QUICK_CMDS.map((cmd) => (
                        <button
                          key={cmd}
                          onClick={() => newConvAndSend(cmd)}
                          style={{
                            padding: '9px 16px',
                            borderRadius: 8,
                            background: surface,
                            border: `1px solid ${line}`,
                            color: muted,
                            cursor: 'pointer',
                            textAlign: 'left',
                            fontFamily: 'var(--font-mono)',
                            fontSize: 11,
                            letterSpacing: '.04em',
                            transition: 'border-color .15s, color .15s',
                          }}
                          onMouseEnter={(e) => {
                            ;(e.currentTarget as HTMLButtonElement).style.borderColor = accent
                            ;(e.currentTarget as HTMLButtonElement).style.color = text
                          }}
                          onMouseLeave={(e) => {
                            ;(e.currentTarget as HTMLButtonElement).style.borderColor = line
                            ;(e.currentTarget as HTMLButtonElement).style.color = muted
                          }}
                        >
                          › {cmd}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Messages */}
              {messages.map((m, i) => {
                const isUser = m.role === 'user'
                return (
                  <div
                    key={m.id + i}
                    style={{
                      display: 'flex',
                      gap: 12,
                      flexDirection: isUser ? 'row-reverse' : 'row',
                      alignItems: 'flex-start',
                    }}
                  >
                    {/* Avatar */}
                    <div
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: 8,
                        flexShrink: 0,
                        background: isUser ? accent + '20' : activeAgent.color + '20',
                        border: `1px solid ${isUser ? accent + '40' : activeAgent.color + '40'}`,
                        display: 'grid',
                        placeItems: 'center',
                        fontFamily: 'var(--font-display)',
                        fontWeight: 800,
                        fontSize: 13,
                        color: isUser ? accent : activeAgent.color,
                      }}
                    >
                      {isUser ? 'U' : activeAgent.sigil}
                    </div>
                    {/* Bubble */}
                    <div
                      style={{
                        maxWidth: '72%',
                        padding: '12px 16px',
                        borderRadius: 12,
                        background: isUser ? `${accent}18` : surface,
                        border: `1px solid ${isUser ? accent + '30' : line}`,
                        fontSize: 13,
                        lineHeight: 1.6,
                        color: text,
                        fontFamily: 'var(--font-sans)',
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word',
                        boxShadow: isUser ? `0 2px 12px ${accent}18` : 'none',
                      }}
                    >
                      {m.content}
                    </div>
                  </div>
                )
              })}

              {/* Typing indicator */}
              {sending && (
                <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                  <div
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 8,
                      flexShrink: 0,
                      background: activeAgent.color + '20',
                      border: `1px solid ${activeAgent.color + '40'}`,
                      display: 'grid',
                      placeItems: 'center',
                      fontFamily: 'var(--font-display)',
                      fontWeight: 800,
                      fontSize: 13,
                      color: activeAgent.color,
                    }}
                  >
                    {activeAgent.sigil}
                  </div>
                  <div
                    style={{
                      padding: '12px 16px',
                      borderRadius: 12,
                      background: surface,
                      border: `1px solid ${line}`,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                    }}
                  >
                    {[0, 1, 2].map((i) => (
                      <span
                        key={i}
                        style={{
                          width: 6,
                          height: 6,
                          borderRadius: '50%',
                          background: muted,
                          animation: 'pulse 1.2s ease-in-out infinite',
                          animationDelay: `${i * 0.2}s`,
                        }}
                      />
                    ))}
                  </div>
                </div>
              )}

              <div ref={bottomRef} />
            </div>
          </div>

          {/* Input bar */}
          {activeId && (
            <div
              style={{
                borderTop: `1px solid ${line}`,
                padding: isMobile ? '10px 12px' : '16px 32px',
                paddingBottom: isMobile ? 'calc(10px + env(safe-area-inset-bottom))' : '16px',
                flexShrink: 0,
                background: bg,
              }}
            >
              <div style={{ maxWidth: 780, margin: '0 auto' }}>
                <div
                  style={{
                    display: 'flex',
                    gap: 10,
                    padding: '8px 12px',
                    background: surface,
                    border: `1px solid ${line2}`,
                    borderRadius: 12,
                    alignItems: 'flex-end',
                  }}
                >
                  <div
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: '50%',
                      background: activeAgent.color,
                      flexShrink: 0,
                      marginBottom: 10,
                    }}
                  />
                  <textarea
                    ref={inputRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={onKey}
                    placeholder={`Message ${activeAgent.name} Agent… (↵ envoyer, Shift+↵ saut de ligne)`}
                    rows={1}
                    disabled={sending}
                    style={{
                      flex: 1,
                      background: 'transparent',
                      border: 'none',
                      outline: 'none',
                      color: text,
                      fontSize: 13,
                      lineHeight: 1.5,
                      resize: 'none',
                      fontFamily: 'var(--font-sans)',
                      maxHeight: 160,
                      overflowY: 'auto',
                    }}
                    onInput={(e) => {
                      const el = e.currentTarget
                      el.style.height = 'auto'
                      el.style.height = Math.min(el.scrollHeight, 160) + 'px'
                    }}
                  />
                  <button
                    onClick={() => handleSend()}
                    disabled={sending || !input.trim()}
                    style={{
                      width: 34,
                      height: 34,
                      borderRadius: 8,
                      flexShrink: 0,
                      background: input.trim() ? accent : surface2,
                      border: `1px solid ${input.trim() ? accent : line}`,
                      color: input.trim() ? '#0b0d12' : muted2,
                      cursor: input.trim() ? 'pointer' : 'default',
                      display: 'grid',
                      placeItems: 'center',
                      transition: 'all .15s',
                    }}
                  >
                    <Send size={14} />
                  </button>
                </div>
                {!isMobile && (
                  <div
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: 9.5,
                      color: muted2,
                      marginTop: 6,
                      letterSpacing: '.08em',
                    }}
                  >
                    Agent: {activeAgent.name} ({activeAgent.role}) · Modèle: {activeAgent.model}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: .3; transform: scale(.8); }
          50%       { opacity: 1;  transform: scale(1); }
        }
      `}</style>
    </div>
  )
}
