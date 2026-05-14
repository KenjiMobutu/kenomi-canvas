'use client'

import Link from 'next/link'
import { Activity, BarChart3, Euro, MousePointerClick, Save } from 'lucide-react'
import { useEffect, useState } from 'react'
import { createSupabaseBrowser } from '@/lib/supabase-browser'
import { useAuth } from '@/lib/auth-context'
import { toast } from 'sonner'

type Period = '7d' | '30d' | '90d'

interface KpiSnapshot {
  id?: string
  period: Period
  revenue: string
  revenue_delta: string
  ctr: string
  ctr_delta: string
  conversion: string
  conversion_delta: string
  retention: string
  retention_delta: string
}

interface FunnelStep {
  id?: string
  position: number
  label: string
  value: string
  rate: string
}

const seedSnapshots: KpiSnapshot[] = [
  { period: '7d', revenue: '€1.1k', revenue_delta: '+6%', ctr: '3.2%', ctr_delta: '+0.2 pts', conversion: '6.8%', conversion_delta: '+0.4 pts', retention: '59%', retention_delta: '+1 pt' },
  { period: '30d', revenue: '€4.2k', revenue_delta: '+18%', ctr: '3.8%', ctr_delta: '+0.7 pts', conversion: '7.4%', conversion_delta: '+2.1 pts', retention: '62%', retention_delta: '+5 pts' },
  { period: '90d', revenue: '€11.7k', revenue_delta: '+41%', ctr: '4.1%', ctr_delta: '+1.4 pts', conversion: '8.2%', conversion_delta: '+3.0 pts', retention: '67%', retention_delta: '+9 pts' },
]

const seedFunnel: FunnelStep[] = [
  { position: 0, label: 'Visitors', value: '18,420', rate: '100%' },
  { position: 1, label: 'Waitlist signups', value: '1,364', rate: '7.4%' },
  { position: 2, label: 'Activated users', value: '328', rate: '24.0%' },
  { position: 3, label: 'Paid customers', value: '74', rate: '22.6%' },
]

export default function AnalyticsPage() {
  const { user } = useAuth()
  const [range, setRange] = useState<Period>('30d')
  const [snapshots, setSnapshots] = useState<Record<Period, KpiSnapshot>>(
    Object.fromEntries(seedSnapshots.map((s) => [s.period, s])) as Record<Period, KpiSnapshot>,
  )
  const [funnel, setFunnel] = useState<FunnelStep[]>(seedFunnel)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<KpiSnapshot>(snapshots[range])

  async function load() {
    const supabase = createSupabaseBrowser()
    const [{ data: kpiData }, { data: funnelData }] = await Promise.all([
      supabase.from('kpi_snapshots').select('*'),
      supabase.from('funnel_steps').select('*').order('position'),
    ])

    if ((!kpiData || kpiData.length === 0) && user) {
      await supabase.from('kpi_snapshots').insert(seedSnapshots.map((s) => ({ ...s, user_id: user.id })))
      await supabase.from('funnel_steps').insert(seedFunnel.map((s) => ({ ...s, user_id: user.id })))
      return load()
    }

    if (kpiData && kpiData.length > 0) {
      const map = Object.fromEntries(kpiData.map((r) => [r.period, r])) as Record<Period, KpiSnapshot>
      setSnapshots(map)
      setDraft(map[range])
    }
    if (funnelData && funnelData.length > 0) {
      setFunnel(funnelData as FunnelStep[])
    }
  }
  useEffect(() => { if (user) load() }, [user])
  useEffect(() => { setDraft(snapshots[range]) }, [range, snapshots])

  async function save() {
    if (!user) return
    const supabase = createSupabaseBrowser()
    const { error } = await supabase.from('kpi_snapshots').upsert(
      { ...draft, period: range, user_id: user.id, updated_at: new Date().toISOString() },
      { onConflict: 'user_id,period' },
    )
    if (error) return toast.error(error.message)
    toast.success('KPIs mis à jour')
    setEditing(false)
    load()
  }

  const current = snapshots[range]

  const metrics = current
    ? [
        ['Revenue', current.revenue, current.revenue_delta, Euro],
        ['CTR', current.ctr, current.ctr_delta, MousePointerClick],
        ['Conversion', current.conversion, current.conversion_delta, BarChart3],
        ['Retention', current.retention, current.retention_delta, Activity],
      ]
    : []

  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="h-16 border-b border-border flex items-center justify-between px-8 sticky top-0 bg-background/80 backdrop-blur-md z-10">
        <h1 className="text-sm font-semibold text-muted-foreground">
          Studio / <span className="text-foreground">Analytics</span>
        </h1>
        <Link href="/studio" className="text-sm text-muted-foreground hover:text-foreground">Retour cockpit</Link>
      </header>

      <section className="p-8 max-w-6xl mx-auto space-y-6">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground">
              Revenus · CTR · Conversions · CAC
            </p>
            <h2 className="text-4xl font-extrabold tracking-tighter mt-2">Analytics Studio</h2>
          </div>
          <div className="flex gap-2">
            {(['7d', '30d', '90d'] as Period[]).map((item) => (
              <button key={item} onClick={() => setRange(item)}
                className={`px-3 py-2 rounded-full text-xs font-mono ring-1 ${range === item ? 'bg-foreground text-background ring-foreground' : 'bg-surface text-muted-foreground ring-border'}`}>
                {item}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {metrics.map(([label, value, delta, Icon]) => {
            const I = Icon as React.ElementType
            return (
              <div key={label as string} className="bg-surface ring-1 ring-border rounded-lg p-5">
                <I className="size-5 text-emerald mb-4" />
                <p className="text-xs text-muted-foreground uppercase tracking-wider">{label as string}</p>
                <p className="text-3xl font-extrabold tracking-tighter mt-2">{value as string}</p>
                <p className="text-[10px] text-emerald font-mono mt-2">{delta as string}</p>
              </div>
            )
          })}
        </div>

        <div className="bg-surface ring-1 ring-border rounded-lg p-5">
          <div className="flex items-center justify-between mb-4">
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Portfolio funnel · {range}
            </p>
            <button onClick={() => setEditing((v) => !v)}
              className="text-xs text-muted-foreground hover:text-foreground font-mono px-3 py-1 ring-1 ring-border rounded-full">
              {editing ? 'Annuler' : 'Modifier KPIs'}
            </button>
          </div>
          <div className="space-y-3">
            {funnel.map(({ label, value, rate }) => (
              <div key={label} className="grid grid-cols-[1fr_auto_auto] gap-4 items-center">
                <span className="text-sm font-semibold">{label}</span>
                <span className="text-sm font-mono">{value}</span>
                <span className="text-[10px] px-2 py-1 rounded-full bg-cyan/10 text-cyan ring-1 ring-cyan/20 font-mono">{rate}</span>
              </div>
            ))}
          </div>
        </div>

        {editing && (
          <div className="bg-surface ring-1 ring-border rounded-lg p-5 space-y-4">
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Modifier KPIs · {range}</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {([
                ['revenue', 'Revenue'],
                ['revenue_delta', 'Revenue delta'],
                ['ctr', 'CTR'],
                ['ctr_delta', 'CTR delta'],
                ['conversion', 'Conversion'],
                ['conversion_delta', 'Conversion delta'],
                ['retention', 'Retention'],
                ['retention_delta', 'Retention delta'],
              ] as [keyof KpiSnapshot, string][]).map(([field, label]) => (
                <div key={field}>
                  <label className="text-[10px] uppercase text-muted-foreground">{label}</label>
                  <input value={(draft as unknown as Record<string, string>)[field] ?? ''} onChange={(e) => setDraft((d) => ({ ...d, [field]: e.target.value }))}
                    className="w-full mt-1 px-3 py-2 bg-input rounded-md text-sm ring-1 ring-border outline-none focus:ring-accent" />
                </div>
              ))}
            </div>
            <button onClick={save}
              className="px-4 py-2 bg-foreground text-background text-xs font-bold rounded-md flex items-center gap-2">
              <Save className="size-4" /> Enregistrer
            </button>
          </div>
        )}
      </section>
    </main>
  )
}
