'use client'
import { useEffect, useState } from 'react'
import { createSupabaseBrowser } from '@/lib/supabase-browser'
import { useAuth } from '@/lib/auth-context'
import { Workflow, Plus, Trash2, Power } from 'lucide-react'
import { toast } from 'sonner'

interface Auto {
  id: string
  name: string
  trigger_type: string
  webhook_url: string | null
  is_enabled: boolean
  run_count: number
  last_run_at: string | null
}

export default function Automations() {
  const { user } = useAuth()
  const [items, setItems] = useState<Auto[]>([])
  const [name, setName] = useState('')
  const [webhook, setWebhook] = useState('')
  const [trigger, setTrigger] = useState('manual')

  async function load() {
    const supabase = createSupabaseBrowser()
    const { data } = await supabase.from('automations').select('*').order('created_at', { ascending: false })
    setItems((data as Auto[]) || [])
  }
  useEffect(() => { if (user) load() }, [user])

  async function create() {
    if (!user || !name) return
    const supabase = createSupabaseBrowser()
    const { error } = await supabase.from('automations').insert({
      user_id: user.id, name, webhook_url: webhook || null, trigger_type: trigger,
    })
    if (error) return toast.error(error.message)
    setName(''); setWebhook('')
    load()
  }

  async function toggle(a: Auto) {
    const supabase = createSupabaseBrowser()
    await supabase.from('automations').update({ is_enabled: !a.is_enabled }).eq('id', a.id)
    load()
  }

  async function del(id: string) {
    const supabase = createSupabaseBrowser()
    await supabase.from('automations').delete().eq('id', id)
    load()
  }

  async function run(a: Auto) {
    if (!a.webhook_url) return toast.error('Pas de webhook configuré')
    const supabase = createSupabaseBrowser()
    try {
      await fetch(a.webhook_url, {
        method: 'POST',
        mode: 'no-cors',
        body: JSON.stringify({ triggered_at: new Date().toISOString() }),
      })
      await supabase.from('automations').update({
        last_run_at: new Date().toISOString(), run_count: a.run_count + 1,
      }).eq('id', a.id)
      toast.success('Webhook déclenché')
      load()
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  return (
    <div>
      <header className="h-16 border-b border-border flex items-center justify-between px-8 sticky top-0 bg-background/80 backdrop-blur-md z-10">
        <h1 className="text-sm font-semibold text-muted-foreground">
          Studio / <span className="text-foreground">Automation Center</span>
        </h1>
      </header>

      <div className="p-8 max-w-5xl mx-auto space-y-6">
        <div className="bg-surface ring-1 ring-border rounded-xl p-5">
          <h3 className="font-semibold mb-3">Nouveau workflow Venture Studio</h3>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
            <input placeholder="Nom" value={name} onChange={(e) => setName(e.target.value)}
              className="px-3 py-2 bg-input rounded-md text-sm ring-1 ring-border outline-none focus:ring-accent" />
            <select value={trigger} onChange={(e) => setTrigger(e.target.value)}
              className="px-3 py-2 bg-input rounded-md text-sm ring-1 ring-border outline-none focus:ring-accent">
              <option value="manual">Manuel</option>
              <option value="schedule">Planifié</option>
              <option value="webhook">Webhook</option>
            </select>
            <input placeholder="Webhook n8n, MCP ou infra..." value={webhook} onChange={(e) => setWebhook(e.target.value)}
              className="px-3 py-2 bg-input rounded-md text-sm ring-1 ring-border outline-none focus:ring-accent" />
            <button onClick={create}
              className="px-4 py-2 bg-foreground text-background text-xs font-bold rounded-md flex items-center justify-center gap-2">
              <Plus className="size-3" /> Créer
            </button>
          </div>
        </div>

        <div className="space-y-2">
          {items.map((a) => (
            <div key={a.id} className="flex items-center gap-4 p-4 bg-surface ring-1 ring-border rounded-lg group">
              <div className="size-10 brand-logo rounded-md grid place-items-center">
                <Workflow className="size-5 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm">{a.name}</p>
                <p className="text-xs text-muted-foreground font-mono truncate">{a.trigger_type} · {a.run_count} runs</p>
              </div>
              <span className={`text-[10px] px-2 py-1 rounded-full font-mono ${a.is_enabled ? 'bg-emerald/10 text-emerald ring-1 ring-emerald/20' : 'bg-muted text-muted-foreground'}`}>
                {a.is_enabled ? 'Active' : 'Pause'}
              </span>
              <button onClick={() => run(a)} className="text-xs px-3 py-1 ring-1 ring-border rounded hover:bg-white/5">Run</button>
              <button onClick={() => toggle(a)} className="text-muted-foreground hover:text-foreground">
                <Power className="size-4" />
              </button>
              <button onClick={() => del(a.id)} className="text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100">
                <Trash2 className="size-4" />
              </button>
            </div>
          ))}
          {items.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-12">
              Aucun workflow. Connectez n8n, MCP ou un trigger de validation.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
