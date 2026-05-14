'use client'
import { useEffect, useState } from 'react'
import { createSupabaseBrowser } from '@/lib/supabase-browser'
import { useAuth } from '@/lib/auth-context'
import { Power, Plus, RotateCw, Workflow } from 'lucide-react'
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
  const [selected, setSelected] = useState<Auto | null>(null)
  const [lastRunMsg, setLastRunMsg] = useState('No run in this session')
  const [name, setName] = useState('')
  const [webhook, setWebhook] = useState('')
  const [trigger, setTrigger] = useState('manual')

  async function load() {
    const supabase = createSupabaseBrowser()
    const { data } = await supabase.from('automations').select('*').order('created_at', { ascending: false })
    const list = (data as Auto[]) || []
    setItems(list)
    setSelected((prev) => (prev ? (list.find((a) => a.id === prev.id) ?? list[0] ?? null) : (list[0] ?? null)))
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

  async function run(a: Auto) {
    if (!a.webhook_url) return toast.error('Pas de webhook configuré')
    const supabase = createSupabaseBrowser()
    try {
      await fetch(a.webhook_url, {
        method: 'POST', mode: 'no-cors',
        body: JSON.stringify({ triggered_at: new Date().toISOString() }),
      })
      await supabase.from('automations').update({
        last_run_at: new Date().toISOString(), run_count: a.run_count + 1,
      }).eq('id', a.id)
      setLastRunMsg(`${a.name} triggered just now`)
      toast.success('Webhook déclenché')
      load()
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="h-16 border-b border-border flex items-center justify-between px-8 sticky top-0 bg-background/80 backdrop-blur-md z-10">
        <h1 className="text-sm font-semibold text-muted-foreground">
          Studio / <span className="text-foreground">Automation Center</span>
        </h1>
      </header>

      <section className="p-8 max-w-6xl mx-auto space-y-6">
        <div>
          <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground">n8n · MCP · Supabase · Stripe</p>
          <h2 className="text-4xl font-extrabold tracking-tighter mt-2">Automation Center</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-2 bg-surface ring-1 ring-border rounded-lg p-4">
          <input placeholder="Nom" value={name} onChange={(e) => setName(e.target.value)}
            className="px-3 py-2 bg-input rounded-md text-sm ring-1 ring-border outline-none focus:ring-accent" />
          <select value={trigger} onChange={(e) => setTrigger(e.target.value)}
            className="px-3 py-2 bg-input rounded-md text-sm ring-1 ring-border outline-none focus:ring-accent">
            <option value="manual">Manuel</option>
            <option value="schedule">Schedule</option>
            <option value="webhook">Webhook</option>
          </select>
          <input placeholder="Webhook n8n, MCP..." value={webhook} onChange={(e) => setWebhook(e.target.value)}
            className="px-3 py-2 bg-input rounded-md text-sm ring-1 ring-border outline-none focus:ring-accent" />
          <button onClick={create}
            className="px-4 py-2 bg-foreground text-background text-xs font-bold rounded-md flex items-center justify-center gap-2">
            <Plus className="size-4" /> Créer
          </button>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-4">
          <div className="space-y-3">
            {items.map((a) => (
              <button key={a.id} onClick={() => setSelected(a)}
                className={`w-full text-left flex items-center gap-4 p-4 bg-surface ring-1 rounded-lg hover:ring-accent/40 ${selected?.id === a.id ? 'ring-accent/60' : 'ring-border'}`}>
                <div className="size-10 brand-logo rounded-md grid place-items-center">
                  <Workflow className="size-5 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm">{a.name}</p>
                  <p className="text-xs text-muted-foreground truncate">{a.trigger_type} · {a.run_count} runs</p>
                </div>
                <span className="text-[10px] px-2 py-1 rounded-full bg-cyan/10 text-cyan ring-1 ring-cyan/20 font-mono">
                  {a.trigger_type}
                </span>
              </button>
            ))}
            {items.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-12">
                Aucun workflow. Connectez n8n, MCP ou un trigger de validation.
              </p>
            )}
          </div>

          <aside className="bg-surface ring-1 ring-border rounded-lg p-5 h-fit">
            {selected ? (
              <>
                <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground">Workflow control</p>
                <h3 className="text-2xl font-extrabold tracking-tighter mt-2">{selected.name}</h3>
                <p className="text-sm text-muted-foreground mt-2">{selected.trigger_type}</p>
                <p className="text-xs text-muted-foreground font-mono mt-4">{lastRunMsg}</p>
                <div className="grid grid-cols-2 gap-2 mt-5">
                  <button onClick={() => run(selected)}
                    className="px-4 py-2 bg-foreground text-background text-xs font-bold rounded-md flex items-center justify-center gap-2">
                    <RotateCw className="size-4" /> Run
                  </button>
                  <button onClick={() => toggle(selected)}
                    className="px-4 py-2 ring-1 ring-border text-xs font-bold rounded-md flex items-center justify-center gap-2">
                    <Power className="size-4" />
                    {selected.is_enabled ? 'Pause' : 'Enable'}
                  </button>
                </div>
              </>
            ) : (
              <div className="min-h-[200px] grid place-items-center text-center">
                <p className="text-sm text-muted-foreground">Sélectionnez un workflow.</p>
              </div>
            )}
          </aside>
        </div>
      </section>
    </main>
  )
}
