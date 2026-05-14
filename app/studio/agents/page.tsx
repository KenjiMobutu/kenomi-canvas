'use client'
import { useEffect, useState } from 'react'
import { createSupabaseBrowser } from '@/lib/supabase-browser'
import { useAuth } from '@/lib/auth-context'
import { Bot, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

interface Agent {
  id: string
  name: string
  description: string | null
  system_prompt: string
  model: string
  is_active: boolean
}

const defaultSystemPrompt =
  'You are a specialized Kenomi Venture Studio agent. Focus on venture creation, validation, launch decisions, and measurable business outcomes.'

export default function Agents() {
  const { user } = useAuth()
  const [agents, setAgents] = useState<Agent[]>([])
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState({ name: '', description: '', system_prompt: defaultSystemPrompt, model: 'qwen3:8b' })

  async function load() {
    const supabase = createSupabaseBrowser()
    const { data } = await supabase.from('agents').select('*').order('created_at', { ascending: false })
    setAgents((data as Agent[]) || [])
  }
  useEffect(() => { if (user) load() }, [user])

  async function create() {
    if (!user || !form.name) return
    const supabase = createSupabaseBrowser()
    const { error } = await supabase.from('agents').insert({ ...form, user_id: user.id })
    if (error) return toast.error(error.message)
    toast.success('Agent créé')
    setCreating(false)
    setForm({ name: '', description: '', system_prompt: defaultSystemPrompt, model: 'qwen3:8b' })
    load()
  }

  async function del(id: string) {
    const supabase = createSupabaseBrowser()
    await supabase.from('agents').delete().eq('id', id)
    load()
  }

  return (
    <div>
      <header className="h-16 border-b border-border flex items-center justify-between px-8 sticky top-0 bg-background/80 backdrop-blur-md z-10">
        <h1 className="text-sm font-semibold text-muted-foreground">
          Studio / <span className="text-foreground">Agents</span>
        </h1>
        <button onClick={() => setCreating(true)}
          className="px-4 py-1.5 bg-foreground text-background text-xs font-bold rounded-full flex items-center gap-2">
          <Plus className="size-3" /> Nouvel agent
        </button>
      </header>

      <div className="p-8 max-w-6xl mx-auto space-y-6">
        {creating && (
          <div className="gradient-border rounded-xl p-6 space-y-3 relative overflow-hidden">
            <div className="accent-glow absolute inset-0" />
            <div className="relative space-y-3">
              <h3 className="font-bold">Créer un agent Venture Studio</h3>
              <input placeholder="Nom" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full px-3 py-2 bg-input rounded-md text-sm ring-1 ring-border outline-none focus:ring-accent" />
              <input placeholder="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
                className="w-full px-3 py-2 bg-input rounded-md text-sm ring-1 ring-border outline-none focus:ring-accent" />
              <textarea placeholder="System prompt" rows={4} value={form.system_prompt}
                onChange={(e) => setForm({ ...form, system_prompt: e.target.value })}
                className="w-full px-3 py-2 bg-input rounded-md text-sm ring-1 ring-border outline-none focus:ring-accent font-mono" />
              <input placeholder="Modèle (ex: qwen3:8b)" value={form.model}
                onChange={(e) => setForm({ ...form, model: e.target.value })}
                className="w-full px-3 py-2 bg-input rounded-md text-sm ring-1 ring-border outline-none focus:ring-accent" />
              <div className="flex gap-2">
                <button onClick={create} className="px-4 py-2 bg-foreground text-background text-xs font-bold rounded-md">Créer</button>
                <button onClick={() => setCreating(false)} className="px-4 py-2 ring-1 ring-border rounded-md text-xs">Annuler</button>
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {agents.map((a) => (
            <div key={a.id} className="bg-surface ring-1 ring-border p-5 rounded-xl group hover:ring-accent/40 transition-all">
              <div className="flex items-start justify-between mb-3">
                <div className="size-10 brand-logo rounded-md grid place-items-center">
                  <Bot className="size-5 text-white" />
                </div>
                <button onClick={() => del(a.id)} className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive">
                  <Trash2 className="size-4" />
                </button>
              </div>
              <p className="font-semibold text-sm">{a.name}</p>
              <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{a.description || a.system_prompt}</p>
              <p className="text-[10px] text-muted-foreground font-mono mt-3">{a.model}</p>
            </div>
          ))}
          {agents.length === 0 && !creating && (
            <p className="text-sm text-muted-foreground col-span-full text-center py-12">
              Aucun agent Venture Studio. Créez Scout, Validation, Builder ou Decision Agent.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
