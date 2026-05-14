'use client'
import { useEffect, useState } from 'react'
import { createSupabaseBrowser } from '@/lib/supabase-browser'
import { useAuth } from '@/lib/auth-context'
import { Bot, Pause, Play, Plus } from 'lucide-react'
import { toast } from 'sonner'

interface Agent {
  id: string
  name: string
  description: string | null
  system_prompt: string
  model: string
  is_active: boolean
}

export default function Agents() {
  const { user } = useAuth()
  const [agents, setAgents] = useState<Agent[]>([])
  const [selected, setSelected] = useState<Agent | null>(null)
  const [form, setForm] = useState({ name: '', description: '', model: 'Claude Code' })

  async function load() {
    const supabase = createSupabaseBrowser()
    const { data } = await supabase.from('agents').select('*').order('created_at', { ascending: false })
    const list = (data as Agent[]) || []
    setAgents(list)
    setSelected((prev) => (prev ? (list.find((a) => a.id === prev.id) ?? list[0] ?? null) : (list[0] ?? null)))
  }
  useEffect(() => { if (user) load() }, [user])

  async function create(e: React.FormEvent) {
    e.preventDefault()
    if (!user || !form.name.trim()) return
    const supabase = createSupabaseBrowser()
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
    const a = agents.find((ag) => ag.id === id)
    if (!a) return
    const supabase = createSupabaseBrowser()
    await supabase.from('agents').update({ is_active: !a.is_active }).eq('id', id)
    load()
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="h-16 border-b border-border flex items-center justify-between px-8 sticky top-0 bg-background/80 backdrop-blur-md z-10">
        <h1 className="text-sm font-semibold text-muted-foreground">
          Studio / <span className="text-foreground">Agents</span>
        </h1>
      </header>

      <section className="p-8 max-w-6xl mx-auto space-y-6">
        <div>
          <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground">Agent Mesh</p>
          <h2 className="text-4xl font-extrabold tracking-tighter mt-2">Agents Venture Studio</h2>
        </div>

        <form onSubmit={create} className="grid grid-cols-1 lg:grid-cols-[1fr_1.4fr_.8fr_auto] gap-2 bg-surface ring-1 ring-border rounded-lg p-4">
          <input value={form.name} onChange={(e) => setForm((c) => ({ ...c, name: e.target.value }))}
            placeholder="Nom agent"
            className="px-3 py-2 bg-input rounded-md text-sm ring-1 ring-border outline-none focus:ring-accent" />
          <input value={form.description} onChange={(e) => setForm((c) => ({ ...c, description: e.target.value }))}
            placeholder="Mission"
            className="px-3 py-2 bg-input rounded-md text-sm ring-1 ring-border outline-none focus:ring-accent" />
          <input value={form.model} onChange={(e) => setForm((c) => ({ ...c, model: e.target.value }))}
            placeholder="Modèle"
            className="px-3 py-2 bg-input rounded-md text-sm ring-1 ring-border outline-none focus:ring-accent" />
          <button className="px-4 py-2 bg-foreground text-background text-xs font-bold rounded-md flex items-center justify-center gap-2">
            <Plus className="size-4" /> Ajouter
          </button>
        </form>

        <div className="grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {agents.map((agent) => (
              <button key={agent.id} onClick={() => setSelected(agent)}
                className={`text-left bg-surface ring-1 p-5 rounded-lg hover:ring-accent/40 ${selected?.id === agent.id ? 'ring-accent/60' : 'ring-border'}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="size-10 brand-logo rounded-md grid place-items-center mb-4">
                    <Bot className="size-5 text-white" />
                  </div>
                  <span className={`text-[10px] px-2 py-1 rounded-full ring-1 font-mono ${agent.is_active ? 'bg-emerald/10 text-emerald ring-emerald/20' : 'bg-muted text-muted-foreground ring-border'}`}>
                    {agent.is_active ? 'Live' : 'Paused'}
                  </span>
                </div>
                <p className="font-semibold text-sm">{agent.name}</p>
                <p className="text-xs text-muted-foreground mt-2 line-clamp-2">{agent.description}</p>
                <p className="text-[10px] text-muted-foreground font-mono mt-4">{agent.model}</p>
              </button>
            ))}
            {agents.length === 0 && (
              <p className="text-sm text-muted-foreground col-span-full text-center py-12">
                Aucun agent Venture Studio. Créez Scout, Validation, Builder ou Decision Agent.
              </p>
            )}
          </div>

          <aside className="bg-surface ring-1 ring-border rounded-lg p-5 h-fit">
            {selected ? (
              <>
                <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground">Agent control</p>
                <h3 className="text-2xl font-extrabold tracking-tighter mt-2">{selected.name}</h3>
                <p className="text-sm text-muted-foreground mt-2">{selected.description}</p>
                <div className="grid grid-cols-2 gap-3 mt-5">
                  <div className="rounded-lg bg-background/40 ring-1 ring-border p-3">
                    <p className="text-[10px] uppercase text-muted-foreground">Status</p>
                    <p className="text-sm font-mono mt-1">{selected.is_active ? 'Live' : 'Paused'}</p>
                  </div>
                  <div className="rounded-lg bg-background/40 ring-1 ring-border p-3">
                    <p className="text-[10px] uppercase text-muted-foreground">Model</p>
                    <p className="text-sm font-mono mt-1">{selected.model}</p>
                  </div>
                </div>
                <button onClick={() => toggleAgent(selected.id)}
                  className="mt-5 w-full px-4 py-2 bg-foreground text-background text-xs font-bold rounded-md flex items-center justify-center gap-2">
                  {selected.is_active ? <Pause className="size-4" /> : <Play className="size-4" />}
                  {selected.is_active ? 'Mettre en pause' : 'Activer'}
                </button>
              </>
            ) : (
              <div className="min-h-[200px] grid place-items-center text-center">
                <p className="text-sm text-muted-foreground">Sélectionnez un agent pour voir ses détails.</p>
              </div>
            )}
          </aside>
        </div>
      </section>
    </main>
  )
}
