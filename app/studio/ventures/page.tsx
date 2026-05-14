'use client'

import Link from 'next/link'
import { Plus, Rocket, Target, TrendingUp } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { createSupabaseBrowser } from '@/lib/supabase-browser'
import { useAuth } from '@/lib/auth-context'
import { toast } from 'sonner'

interface Venture {
  id: string
  name: string
  niche: string
  stage: string
  score: number
  mrr: string
  cac: string
  conversion: string
  next_action: string
  insight: string
}

const seedVentures = [
  { name: 'Kenomi Forms', niche: 'No-code forms for consultants', stage: 'Scale', score: 91, mrr: '€2.8k', cac: '€14', conversion: '9.8%', next_action: 'Increase paid acquisition cap', insight: 'CAC is below target and signup quality is high.' },
  { name: 'Solo CFO Copilot', niche: 'Finance assistant for solo founders', stage: 'Validation', score: 84, mrr: '€620', cac: '€21', conversion: '6.2%', next_action: 'Run pricing A/B test', insight: 'Search intent is strong but pricing confidence is not final.' },
  { name: 'Legal Intake Bot', niche: 'Client intake for small law firms', stage: 'Build', score: 68, mrr: '€310', cac: '€39', conversion: '4.1%', next_action: 'Pivot toward HR operations', insight: 'Legal CPC is high; HR ops has a cleaner wedge.' },
  { name: 'Creator CRM Lite', niche: 'Light CRM for creators', stage: 'Stop', score: 42, mrr: '€120', cac: '€52', conversion: '1.9%', next_action: 'Archive learnings', insight: 'CTR and paid conversion stayed below threshold.' },
]

const stages = ['All', 'Validation', 'Build', 'Scale', 'Stop']

export default function VenturesPage() {
  const { user } = useAuth()
  const [ventures, setVentures] = useState<Venture[]>([])
  const [stage, setStage] = useState('All')
  const [selected, setSelected] = useState<Venture | null>(null)
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState({ name: '', niche: '', stage: 'Validation', score: '', mrr: '' })

  async function load() {
    const supabase = createSupabaseBrowser()
    const { data } = await supabase.from('ventures').select('*').order('score', { ascending: false })
    const list = (data as Venture[]) || []
    if (list.length === 0 && user) {
      await supabase.from('ventures').insert(seedVentures.map((v) => ({ ...v, user_id: user.id })))
      return load()
    }
    setVentures(list)
    setSelected((prev) => (prev ? (list.find((v) => v.id === prev.id) ?? list[0] ?? null) : (list[0] ?? null)))
  }
  useEffect(() => { if (user) load() }, [user])

  async function create(e: React.FormEvent) {
    e.preventDefault()
    if (!user || !form.name.trim()) return
    const supabase = createSupabaseBrowser()
    const { error } = await supabase.from('ventures').insert({
      user_id: user.id,
      name: form.name.trim(),
      niche: form.niche.trim(),
      stage: form.stage,
      score: parseInt(form.score) || 0,
      mrr: form.mrr.trim() || '€0',
      cac: '€0', conversion: '0%', next_action: '', insight: '',
    })
    if (error) return toast.error(error.message)
    setForm({ name: '', niche: '', stage: 'Validation', score: '', mrr: '' })
    setAdding(false)
    load()
  }

  const filtered = useMemo(
    () => ventures.filter((v) => stage === 'All' || v.stage === stage),
    [ventures, stage],
  )

  const totalMrrK = ventures.reduce((sum, v) => {
    const raw = parseFloat(v.mrr.replace(/[^0-9.]/g, '')) || 0
    return sum + (v.mrr.toLowerCase().includes('k') ? raw * 1000 : raw)
  }, 0)
  const avgScore = ventures.length
    ? Math.round(ventures.reduce((s, v) => s + v.score, 0) / ventures.length)
    : 0
  const activeCount = ventures.filter((v) => v.stage !== 'Stop').length

  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="h-16 border-b border-border flex items-center justify-between px-8 sticky top-0 bg-background/80 backdrop-blur-md z-10">
        <h1 className="text-sm font-semibold text-muted-foreground">
          Studio / <span className="text-foreground">Ventures</span>
        </h1>
        <div className="flex items-center gap-3">
          <Link href="/studio" className="text-sm text-muted-foreground hover:text-foreground">Retour cockpit</Link>
          <button onClick={() => setAdding((v) => !v)}
            className="px-4 py-1.5 bg-foreground text-background text-xs font-bold rounded-full flex items-center gap-2">
            <Plus className="size-3" /> Nouvelle venture
          </button>
        </div>
      </header>

      <section className="p-8 max-w-7xl mx-auto space-y-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground">Venture Pipeline</p>
            <h2 className="text-4xl font-extrabold tracking-tighter mt-2">Idées, validations et lancements</h2>
          </div>
          <div className="flex flex-wrap gap-2">
            {stages.map((s) => (
              <button key={s} onClick={() => setStage(s)}
                className={`px-3 py-2 rounded-full text-xs font-mono ring-1 ${stage === s ? 'bg-foreground text-background ring-foreground' : 'bg-surface text-muted-foreground ring-border hover:text-foreground'}`}>
                {s}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {([
            ['Avg. score', `${avgScore}%`, Target],
            ['Ventures actives', String(activeCount), Rocket],
            ['Portfolio MRR', `€${(totalMrrK / 1000).toFixed(1)}k`, TrendingUp],
          ] as [string, string, React.ElementType][]).map(([label, value, Icon]) => (
            <div key={label} className="bg-surface ring-1 ring-border rounded-lg p-5">
              <Icon className="size-5 text-accent mb-4" />
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{label}</p>
              <p className="text-4xl font-extrabold tracking-tighter mt-2">{value}</p>
            </div>
          ))}
        </div>

        {adding && (
          <form onSubmit={create} className="grid grid-cols-1 lg:grid-cols-[1fr_1fr_.6fr_.4fr_.4fr_auto] gap-2 bg-surface ring-1 ring-border rounded-lg p-4">
            <input value={form.name} onChange={(e) => setForm((c) => ({ ...c, name: e.target.value }))} placeholder="Nom"
              className="px-3 py-2 bg-input rounded-md text-sm ring-1 ring-border outline-none focus:ring-accent" />
            <input value={form.niche} onChange={(e) => setForm((c) => ({ ...c, niche: e.target.value }))} placeholder="Niche"
              className="px-3 py-2 bg-input rounded-md text-sm ring-1 ring-border outline-none focus:ring-accent" />
            <select value={form.stage} onChange={(e) => setForm((c) => ({ ...c, stage: e.target.value }))}
              className="px-3 py-2 bg-input rounded-md text-sm ring-1 ring-border outline-none focus:ring-accent">
              {['Validation', 'Build', 'Scale', 'Stop'].map((s) => <option key={s}>{s}</option>)}
            </select>
            <input value={form.score} onChange={(e) => setForm((c) => ({ ...c, score: e.target.value }))} placeholder="Score" type="number" min="0" max="100"
              className="px-3 py-2 bg-input rounded-md text-sm ring-1 ring-border outline-none focus:ring-accent" />
            <input value={form.mrr} onChange={(e) => setForm((c) => ({ ...c, mrr: e.target.value }))} placeholder="MRR"
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
          <div className="bg-surface ring-1 ring-border rounded-lg overflow-hidden">
            <table className="w-full text-sm min-w-[760px]">
              <thead className="text-xs uppercase tracking-wider text-muted-foreground">
                <tr className="border-b border-border">
                  {['Venture', 'Niche', 'Stage', 'Score', 'MRR', 'Next action'].map((h) => (
                    <th key={h} className="text-left font-medium px-5 py-3">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((v) => (
                  <tr key={v.id} onClick={() => setSelected(v)}
                    className={`border-b border-border/70 last:border-0 cursor-pointer hover:bg-white/[0.03] ${selected?.id === v.id ? 'bg-white/[0.04]' : ''}`}>
                    <td className="px-5 py-4 font-semibold">{v.name}</td>
                    <td className="px-5 py-4 text-muted-foreground">{v.niche}</td>
                    <td className="px-5 py-4 font-mono">{v.stage}</td>
                    <td className="px-5 py-4 font-mono">{v.score}</td>
                    <td className="px-5 py-4 font-mono">{v.mrr}</td>
                    <td className="px-5 py-4 text-muted-foreground">{v.next_action}</td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-5 py-12 text-center text-sm text-muted-foreground">
                      Aucune venture dans ce stage.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <aside className="bg-surface ring-1 ring-border rounded-lg p-5 h-fit">
            {selected ? (
              <>
                <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground">Selected venture</p>
                <h3 className="text-2xl font-extrabold tracking-tighter mt-2">{selected.name}</h3>
                <p className="text-sm text-muted-foreground mt-2">{selected.insight}</p>
                <div className="grid grid-cols-2 gap-3 mt-5">
                  <div className="rounded-lg bg-background/40 ring-1 ring-border p-3">
                    <p className="text-[10px] uppercase text-muted-foreground">Stage</p>
                    <p className="text-sm font-mono mt-1">{selected.stage}</p>
                  </div>
                  <div className="rounded-lg bg-background/40 ring-1 ring-border p-3">
                    <p className="text-[10px] uppercase text-muted-foreground">Score</p>
                    <p className="text-sm font-mono mt-1">{selected.score}</p>
                  </div>
                  <div className="rounded-lg bg-background/40 ring-1 ring-border p-3">
                    <p className="text-[10px] uppercase text-muted-foreground">MRR</p>
                    <p className="text-sm font-mono mt-1">{selected.mrr}</p>
                  </div>
                  <div className="rounded-lg bg-background/40 ring-1 ring-border p-3">
                    <p className="text-[10px] uppercase text-muted-foreground">CAC</p>
                    <p className="text-sm font-mono mt-1">{selected.cac}</p>
                  </div>
                </div>
                <button className="mt-5 w-full px-4 py-2 bg-foreground text-background text-xs font-bold rounded-md">
                  Préparer décision
                </button>
              </>
            ) : (
              <div className="min-h-[200px] grid place-items-center">
                <p className="text-sm text-muted-foreground">Sélectionnez une venture.</p>
              </div>
            )}
          </aside>
        </div>
      </section>
    </main>
  )
}
