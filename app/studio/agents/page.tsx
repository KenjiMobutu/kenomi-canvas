'use client'
import { useEffect, useState } from 'react'
import { createSupabaseBrowser } from '@/lib/supabase-browser'
import { useAuth } from '@/lib/auth-context'
import { toast } from 'sonner'
import { CkShell } from '@/components/CkShell'
import {
  bg, surface, surface2, line, line2, text, muted, muted2,
  accent, emerald, rose,
} from '@/lib/ck-vars'

interface Agent {
  id: string
  name: string
  description: string | null
  system_prompt: string
  model: string
  is_active: boolean
}

/* Maps agent names to the cockpit's static sigil/color data */
const SIGIL_MAP: Record<string, { sigil: string; color: string }> = {
  scout:      { sigil: '◬', color: '#22d3ee' },
  validation: { sigil: '◇', color: '#a78bfa' },
  builder:    { sigil: '◮', color: '#34d399' },
  payment:    { sigil: '◈', color: '#fbbf24' },
  marketing:  { sigil: '✺', color: '#e879f9' },
  analytics:  { sigil: '◐', color: '#60a5fa' },
  decision:   { sigil: '✦', color: '#ff6a3d' },
}

function agentMeta(name: string) {
  const key = name.toLowerCase()
  return SIGIL_MAP[key] || { sigil: '●', color: '#8a93a6' }
}

export default function AgentsPage() {
  const { user } = useAuth()
  const [agents, setAgents] = useState<Agent[]>([])
  const [selected, setSelected] = useState<Agent | null>(null)
  const [form, setForm] = useState({ name: '', description: '', model: 'Claude Code' })

  const supabase = createSupabaseBrowser()

  async function load() {
    const { data } = await supabase.from('agents').select('*').order('created_at', { ascending: false })
    const list = (data as Agent[]) || []
    setAgents(list)
    setSelected(prev => prev ? (list.find(a => a.id === prev.id) ?? list[0] ?? null) : (list[0] ?? null))
  }
  useEffect(() => { if (user) load() }, [user]) // eslint-disable-line react-hooks/exhaustive-deps

  async function create(e: React.FormEvent) {
    e.preventDefault()
    if (!user || !form.name.trim()) return
    const { error } = await supabase.from('agents').insert({
      user_id: user.id,
      name: form.name.trim(),
      description: form.description.trim() || null,
      system_prompt: 'You are a specialized Kenomi Venture Studio agent. Focus on venture creation, validation, launch decisions, and measurable business outcomes.',
      model: form.model.trim() || 'Claude Code',
      is_active: true,
    })
    if (error) return toast.error(error.message)
    setForm({ name: '', description: '', model: 'Claude Code' })
    load()
  }

  async function toggleAgent(id: string) {
    const a = agents.find(ag => ag.id === id)
    if (!a) return
    await supabase.from('agents').update({ is_active: !a.is_active }).eq('id', id)
    load()
  }

  const headerActions = (
    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: muted, letterSpacing: '.1em' }}>
      {agents.filter(a => a.is_active).length} / {agents.length} actifs
    </span>
  )

  return (
    <CkShell breadcrumb="Studio / Agents" title="Agent Mesh" subtitle="Scout · Validation · Builder · Decision" actions={headerActions}>

      {/* Add form */}
      <form onSubmit={create} style={{
        display: 'grid', gridTemplateColumns: '1fr 1.4fr .8fr auto',
        gap: 8, marginBottom: 24,
        background: surface, border: `1px solid ${line}`, borderRadius: 12, padding: 16,
      }}>
        <input className="ck-input" placeholder="Nom agent" value={form.name} onChange={e => setForm(c => ({ ...c, name: e.target.value }))} />
        <input className="ck-input" placeholder="Mission" value={form.description} onChange={e => setForm(c => ({ ...c, description: e.target.value }))} />
        <input className="ck-input" placeholder="Modèle" value={form.model} onChange={e => setForm(c => ({ ...c, model: e.target.value }))} />
        <button style={{
          padding: '8px 20px', borderRadius: 8,
          background: accent, color: '#0b0d12', border: 'none', cursor: 'pointer',
          fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 12,
          whiteSpace: 'nowrap',
        }}>+ Ajouter</button>
      </form>

      {/* Master-detail */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 16 }}>
        {/* Agent grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
          {agents.map(agent => {
            const meta = agentMeta(agent.name)
            const isSelected = selected?.id === agent.id
            return (
              <button key={agent.id} onClick={() => setSelected(agent)} style={{
                textAlign: 'left', padding: 20, borderRadius: 12, cursor: 'pointer',
                background: surface,
                border: `1px solid ${isSelected ? meta.color : line}`,
                transition: 'border-color .15s',
                position: 'relative', overflow: 'hidden',
              }}>
                {/* Top accent line */}
                <div style={{ position: 'absolute', left: 0, top: 0, right: 0, height: 2, background: meta.color, opacity: isSelected ? 1 : 0.35 }} />

                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14 }}>
                  {/* Sigil */}
                  <div style={{
                    width: 40, height: 40, borderRadius: 10,
                    background: meta.color + '18',
                    border: `1px solid ${meta.color}40`,
                    display: 'grid', placeItems: 'center',
                    fontFamily: 'var(--font-display)', fontSize: 18, color: meta.color, fontWeight: 800,
                  }}>{meta.sigil}</div>
                  {/* Status badge */}
                  <span style={{
                    padding: '3px 8px', borderRadius: 999,
                    background: agent.is_active ? emerald + '18' : muted2 + '18',
                    color: agent.is_active ? emerald : muted2,
                    fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '.14em', fontWeight: 700,
                    border: `1px solid ${agent.is_active ? emerald + '40' : muted2 + '40'}`,
                  }}>{agent.is_active ? '● Live' : '○ Paused'}</span>
                </div>

                <div style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 700, color: text, marginBottom: 6 }}>{agent.name}</div>
                <div style={{ fontSize: 12, color: muted, lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const, overflow: 'hidden' }}>
                  {agent.description || 'Aucune description.'}
                </div>
                <div style={{ marginTop: 12, fontFamily: 'var(--font-mono)', fontSize: 10, color: muted2, letterSpacing: '.1em' }}>{agent.model}</div>
              </button>
            )
          })}
          {agents.length === 0 && (
            <p style={{ gridColumn: '1/-1', textAlign: 'center', padding: '48px 0', color: muted2, fontSize: 13 }}>
              Aucun agent. Créez Scout, Validation, Builder ou Decision Agent.
            </p>
          )}
        </div>

        {/* Aside */}
        <aside style={{ background: surface, border: `1px solid ${line}`, borderRadius: 12, padding: 20, height: 'fit-content' }}>
          {selected ? (() => {
            const meta = agentMeta(selected.name)
            return (
              <>
                <div style={{ position: 'relative', paddingLeft: 12, marginBottom: 16 }}>
                  <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, borderRadius: 2, background: meta.color }} />
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '.18em', textTransform: 'uppercase', color: muted }}>Agent control</div>
                  <h3 style={{ margin: '6px 0 0', fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 800, letterSpacing: '-.02em', color: text }}>
                    {selected.name}
                  </h3>
                </div>

                <p style={{ fontSize: 13, color: muted, lineHeight: 1.55, marginBottom: 16 }}>{selected.description || 'Aucune description.'}</p>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 }}>
                  <div style={{ padding: '10px 12px', borderRadius: 8, background: surface2, border: `1px solid ${line}` }}>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '.14em', textTransform: 'uppercase', color: muted }}>Status</div>
                    <div style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 800, color: selected.is_active ? emerald : rose, marginTop: 4 }}>
                      {selected.is_active ? 'Live' : 'Paused'}
                    </div>
                  </div>
                  <div style={{ padding: '10px 12px', borderRadius: 8, background: surface2, border: `1px solid ${line}` }}>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '.14em', textTransform: 'uppercase', color: muted }}>Model</div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: text, marginTop: 4, fontWeight: 600 }}>{selected.model}</div>
                  </div>
                </div>

                <button onClick={() => toggleAgent(selected.id)} style={{
                  width: '100%', padding: '10px 16px', borderRadius: 8,
                  background: selected.is_active ? rose + '18' : emerald + '18',
                  color: selected.is_active ? rose : emerald,
                  border: `1px solid ${selected.is_active ? rose + '40' : emerald + '40'}`,
                  cursor: 'pointer',
                  fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 13,
                }}>
                  {selected.is_active ? '⏸ Mettre en pause' : '▶ Activer'}
                </button>
              </>
            )
          })() : (
            <div style={{ minHeight: 200, display: 'grid', placeItems: 'center' }}>
              <p style={{ fontSize: 13, color: muted2, textAlign: 'center' }}>Sélectionnez un agent.</p>
            </div>
          )}
        </aside>
      </div>
    </CkShell>
  )
}
