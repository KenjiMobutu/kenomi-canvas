'use client'

import Link from 'next/link'
import { Megaphone, Plus, Search, Send, Video } from 'lucide-react'
import { useEffect, useState } from 'react'
import { createSupabaseBrowser } from '@/lib/supabase-browser'
import { useAuth } from '@/lib/auth-context'
import { toast } from 'sonner'

interface Campaign {
  id: string
  name: string
  draft_count: number
  description: string
}

const seedCampaigns = [
  { name: 'LinkedIn founder posts', draft_count: 12, description: 'Solo CFO, Kenomi Forms, validation threads' },
  { name: 'TikTok test scripts', draft_count: 8, description: 'Pain-point hooks for micro-SaaS niches' },
  { name: 'SEO briefs', draft_count: 21, description: 'Comparison pages, alternatives, job-to-be-done pages' },
  { name: 'Newsletter queue', draft_count: 4, description: 'Build-in-public and market validation digest' },
]

export default function MarketingPage() {
  const { user } = useAuth()
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [selected, setSelected] = useState<Campaign | null>(null)
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState({ name: '', description: '' })

  async function load() {
    const supabase = createSupabaseBrowser()
    const { data } = await supabase.from('campaigns').select('*').order('created_at', { ascending: true })
    const list = (data as Campaign[]) || []
    if (list.length === 0 && user) {
      await supabase.from('campaigns').insert(seedCampaigns.map((c) => ({ ...c, user_id: user.id })))
      return load()
    }
    setCampaigns(list)
    setSelected((prev) => (prev ? (list.find((c) => c.id === prev.id) ?? list[0] ?? null) : (list[0] ?? null)))
  }
  useEffect(() => { if (user) load() }, [user])

  async function create(e: React.FormEvent) {
    e.preventDefault()
    if (!user || !form.name.trim()) return
    const supabase = createSupabaseBrowser()
    const { error } = await supabase.from('campaigns').insert({
      user_id: user.id, name: form.name.trim(),
      draft_count: 0, description: form.description.trim(),
    })
    if (error) return toast.error(error.message)
    setForm({ name: '', description: '' })
    setAdding(false)
    load()
  }

  async function generateDraft() {
    if (!selected) return
    const supabase = createSupabaseBrowser()
    await supabase.from('campaigns').update({ draft_count: selected.draft_count + 1 }).eq('id', selected.id)
    load()
  }

  const totalDrafts = campaigns.reduce((s, c) => s + c.draft_count, 0)

  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="h-16 border-b border-border flex items-center justify-between px-8 sticky top-0 bg-background/80 backdrop-blur-md z-10">
        <h1 className="text-sm font-semibold text-muted-foreground">
          Studio / <span className="text-foreground">Marketing</span>
        </h1>
        <div className="flex items-center gap-3">
          <Link href="/studio" className="text-sm text-muted-foreground hover:text-foreground">Retour cockpit</Link>
          <button onClick={() => setAdding((v) => !v)}
            className="px-4 py-1.5 bg-foreground text-background text-xs font-bold rounded-full flex items-center gap-2">
            <Plus className="size-3" /> Nouvelle campagne
          </button>
        </div>
      </header>

      <section className="p-8 max-w-6xl mx-auto space-y-6">
        <div>
          <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground">Posts · Ads · SEO · Newsletter</p>
          <h2 className="text-4xl font-extrabold tracking-tighter mt-2">Marketing Lab</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {([
            ['CTR target', '3.8%', Megaphone],
            ['SEO pages', '42', Search],
            ['Social drafts', String(totalDrafts), Video],
            ['Campagnes', String(campaigns.length), Send],
          ] as [string, string, React.ElementType][]).map(([label, value, Icon]) => (
            <div key={label} className="bg-surface ring-1 ring-border rounded-lg p-5">
              <Icon className="size-5 text-accent mb-4" />
              <p className="text-xs text-muted-foreground uppercase tracking-wider">{label}</p>
              <p className="text-3xl font-extrabold tracking-tighter mt-2">{value}</p>
            </div>
          ))}
        </div>

        {adding && (
          <form onSubmit={create} className="grid grid-cols-1 lg:grid-cols-[1fr_2fr_auto] gap-2 bg-surface ring-1 ring-border rounded-lg p-4">
            <input value={form.name} onChange={(e) => setForm((c) => ({ ...c, name: e.target.value }))} placeholder="Nom campagne"
              className="px-3 py-2 bg-input rounded-md text-sm ring-1 ring-border outline-none focus:ring-accent" />
            <input value={form.description} onChange={(e) => setForm((c) => ({ ...c, description: e.target.value }))} placeholder="Description"
              className="px-3 py-2 bg-input rounded-md text-sm ring-1 ring-border outline-none focus:ring-accent" />
            <div className="flex gap-2">
              <button className="px-4 py-2 bg-foreground text-background text-xs font-bold rounded-md flex items-center gap-2">
                <Plus className="size-4" /> Ajouter
              </button>
              <button type="button" onClick={() => setAdding(false)} className="px-4 py-2 ring-1 ring-border rounded-md text-xs">✕</button>
            </div>
          </form>
        )}

        <div className="grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-4">
          <div className="space-y-3">
            {campaigns.map((campaign) => (
              <button key={campaign.id} onClick={() => setSelected(campaign)}
                className={`w-full text-left bg-surface ring-1 rounded-lg p-5 flex items-center gap-4 hover:ring-accent/40 ${selected?.id === campaign.id ? 'ring-accent/60' : 'ring-border'}`}>
                <div className="size-10 brand-logo rounded-md grid place-items-center">
                  <Megaphone className="size-5 text-white" />
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-sm">{campaign.name}</p>
                  <p className="text-xs text-muted-foreground mt-1">{campaign.description}</p>
                </div>
                <span className="text-[10px] px-2 py-1 rounded-full bg-fuchsia/10 text-fuchsia ring-1 ring-fuchsia/20 font-mono">{campaign.draft_count} drafts</span>
              </button>
            ))}
            {campaigns.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-12">Aucune campagne. Créez votre première.</p>
            )}
          </div>

          <aside className="bg-surface ring-1 ring-border rounded-lg p-5 h-fit">
            {selected ? (
              <>
                <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground">Campaign brief</p>
                <h3 className="text-2xl font-extrabold tracking-tighter mt-2">{selected.name}</h3>
                <p className="text-sm text-muted-foreground mt-2">{selected.description}</p>
                <div className="rounded-lg bg-background/40 ring-1 ring-border p-3 mt-5">
                  <p className="text-[10px] uppercase text-muted-foreground">Drafts générés</p>
                  <p className="text-2xl font-extrabold tracking-tighter mt-1">{selected.draft_count}</p>
                </div>
                <button onClick={generateDraft} className="mt-5 w-full px-4 py-2 bg-foreground text-background text-xs font-bold rounded-md">
                  Générer un draft
                </button>
              </>
            ) : (
              <div className="min-h-[200px] grid place-items-center">
                <p className="text-sm text-muted-foreground">Sélectionnez une campagne.</p>
              </div>
            )}
          </aside>
        </div>
      </section>
    </main>
  )
}
