'use client'
import { useEffect, useState } from 'react'
import { createSupabaseBrowser } from '@/lib/supabase-browser'
import { useAuth } from '@/lib/auth-context'
import { toast } from 'sonner'
import { CkShell } from '@/components/CkShell'
import {
  surface, surface2, line, line2, text, muted, muted2,
  accent, emerald, amber, rose,
} from '@/lib/ck-vars'

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
  { period: '7d',  revenue: '€1.1k', revenue_delta: '+6%',  ctr: '3.2%', ctr_delta: '+0.2 pts', conversion: '6.8%',  conversion_delta: '+0.4 pts', retention: '59%', retention_delta: '+1 pt'  },
  { period: '30d', revenue: '€4.2k', revenue_delta: '+18%', ctr: '3.8%', ctr_delta: '+0.7 pts', conversion: '7.4%',  conversion_delta: '+2.1 pts', retention: '62%', retention_delta: '+5 pts' },
  { period: '90d', revenue: '€11.7k',revenue_delta: '+41%', ctr: '4.1%', ctr_delta: '+1.4 pts', conversion: '8.2%',  conversion_delta: '+3.0 pts', retention: '67%', retention_delta: '+9 pts' },
]

const seedFunnel: FunnelStep[] = [
  { position: 0, label: 'Visitors',         value: '18 420', rate: '100%'  },
  { position: 1, label: 'Waitlist signups',  value: '1 364',  rate: '7.4%'  },
  { position: 2, label: 'Activated users',   value: '328',    rate: '24.0%' },
  { position: 3, label: 'Paid customers',    value: '74',     rate: '22.6%' },
]

export default function AnalyticsPage() {
  const { user } = useAuth()
  const [range, setRange] = useState<Period>('30d')
  const [snapshots, setSnapshots] = useState<Record<Period, KpiSnapshot>>(
    Object.fromEntries(seedSnapshots.map(s => [s.period, s])) as Record<Period, KpiSnapshot>,
  )
  const [funnel, setFunnel] = useState<FunnelStep[]>(seedFunnel)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<KpiSnapshot>(snapshots[range])

  const supabase = createSupabaseBrowser()

  async function load() {
    const [{ data: kpiData }, { data: funnelData }] = await Promise.all([
      supabase.from('kpi_snapshots').select('*'),
      supabase.from('funnel_steps').select('*').order('position'),
    ])
    if ((!kpiData || kpiData.length === 0) && user) {
      await supabase.from('kpi_snapshots').insert(seedSnapshots.map(s => ({ ...s, user_id: user.id })))
      await supabase.from('funnel_steps').insert(seedFunnel.map(s => ({ ...s, user_id: user.id })))
      return load()
    }
    if (kpiData && kpiData.length > 0) {
      const map = Object.fromEntries(kpiData.map(r => [r.period, r])) as Record<Period, KpiSnapshot>
      setSnapshots(map)
      setDraft(map[range])
    }
    if (funnelData && funnelData.length > 0) setFunnel(funnelData as FunnelStep[])
  }
  useEffect(() => { if (user) load() }, [user]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setDraft(snapshots[range]) }, [range, snapshots])

  async function save() {
    if (!user) return
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

  const kpis = current ? [
    { label: 'Revenue',    value: current.revenue,    delta: current.revenue_delta,    icon: '€' },
    { label: 'CTR',        value: current.ctr,        delta: current.ctr_delta,        icon: '↗' },
    { label: 'Conversion', value: current.conversion, delta: current.conversion_delta, icon: '%' },
    { label: 'Rétention',  value: current.retention,  delta: current.retention_delta,  icon: '↻' },
  ] : []

  const maxFunnelVal = funnel.length
    ? parseFloat(funnel[0].value.replace(/\s/g, '').replace(',', '.')) || 1
    : 1

  const periodActions = (
    <div style={{ display: 'flex', gap: 6 }}>
      {(['7d', '30d', '90d'] as Period[]).map(p => (
        <button key={p} onClick={() => setRange(p)} style={{
          padding: '5px 12px', borderRadius: 6, cursor: 'pointer',
          background: range === p ? text : 'transparent',
          color: range === p ? 'var(--ck-bg)' : muted,
          border: `1px solid ${range === p ? text : line2}`,
          fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '.1em',
        }}>{p}</button>
      ))}
    </div>
  )

  return (
    <CkShell breadcrumb="Studio / Analytics" title="Analytics Studio" subtitle="Revenus · CTR · Conversions · Rétention" actions={periodActions}>

      {/* KPI cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
        {kpis.map(k => (
          <div key={k.label} style={{ background: surface, border: `1px solid ${line}`, borderRadius: 12, padding: '16px 20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '.14em', textTransform: 'uppercase', color: muted }}>{k.label}</div>
              <span style={{ fontFamily: 'var(--font-display)', fontSize: 16, color: emerald }}>{k.icon}</span>
            </div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 800, letterSpacing: '-.02em', color: text, lineHeight: 1 }}>{k.value}</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: emerald, marginTop: 6, letterSpacing: '.06em' }}>{k.delta}</div>
          </div>
        ))}
      </div>

      {/* Funnel + edit */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
        {/* Funnel */}
        <div style={{ background: surface, border: `1px solid ${line}`, borderRadius: 12, padding: '20px 24px' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 20 }}>
            <h3 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 700, color: text }}>
              Portfolio funnel · {range}
            </h3>
            <button onClick={() => setEditing(v => !v)} style={{
              padding: '4px 10px', borderRadius: 5, cursor: 'pointer',
              background: 'transparent', color: muted,
              border: `1px solid ${line2}`,
              fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '.12em',
            }}>{editing ? 'Annuler' : 'Modifier KPIs'}</button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {funnel.map(step => {
              const val = parseFloat(step.value.replace(/\s/g, '').replace(',', '.')) || 0
              const pct = Math.max(8, (val / maxFunnelVal) * 100)
              return (
                <div key={step.label}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: text }}>{step.label}</span>
                    <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: text }}>{step.value}</span>
                      <span style={{
                        padding: '2px 8px', borderRadius: 4,
                        background: '#22d3ee18', color: '#22d3ee',
                        fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '.14em', fontWeight: 700,
                      }}>{step.rate}</span>
                    </div>
                  </div>
                  <div style={{ height: 5, borderRadius: 3, background: surface2, overflow: 'hidden' }}>
                    <div style={{ width: `${pct}%`, height: '100%', background: emerald, borderRadius: 3, transition: 'width .4s ease' }} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Sparklines placeholder */}
        <div style={{ background: surface, border: `1px solid ${line}`, borderRadius: 12, padding: '20px 24px' }}>
          <h3 style={{ margin: '0 0 20px', fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 700, color: text }}>
            Tendances · {range}
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {(['MRR', 'CAC', 'Conv.', 'Rétention'] as const).map((label, i) => {
              const heights = [60, 40, 75, 50, 65, 80, 70, 85, 60, 90, 75, 95]
              return (
                <div key={label} style={{ padding: '10px 12px', borderRadius: 8, background: surface2, border: `1px solid ${line}` }}>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '.14em', textTransform: 'uppercase', color: muted, marginBottom: 8 }}>{label}</div>
                  <svg viewBox="0 0 100 28" preserveAspectRatio="none" style={{ width: '100%', height: 28 }}>
                    <polyline
                      points={heights.map((h, j) => `${(j / (heights.length - 1)) * 100},${28 - (h / 100) * 24}`).join(' ')}
                      fill="none" stroke={[emerald, rose, accent, '#22d3ee'][i % 4]} strokeWidth="1.5"
                    />
                  </svg>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Edit form */}
      {editing && (
        <div style={{ background: surface, border: `1px solid ${line}`, borderRadius: 12, padding: '20px 24px' }}>
          <h3 style={{ margin: '0 0 16px', fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 700, color: text }}>
            Modifier KPIs · {range}
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
            {([
              ['revenue', 'Revenue'],
              ['revenue_delta', 'Revenue delta'],
              ['ctr', 'CTR'],
              ['ctr_delta', 'CTR delta'],
              ['conversion', 'Conversion'],
              ['conversion_delta', 'Conversion delta'],
              ['retention', 'Rétention'],
              ['retention_delta', 'Rétention delta'],
            ] as [keyof KpiSnapshot, string][]).map(([field, label]) => (
              <div key={field}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '.14em', textTransform: 'uppercase', color: muted, marginBottom: 4 }}>{label}</div>
                <input
                  className="ck-input"
                  value={(draft as unknown as Record<string, string>)[field] ?? ''}
                  onChange={e => setDraft(d => ({ ...d, [field]: e.target.value }))}
                />
              </div>
            ))}
          </div>
          <button onClick={save} style={{
            padding: '10px 20px', borderRadius: 8,
            background: accent, color: '#0b0d12', border: 'none', cursor: 'pointer',
            fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 13,
            display: 'inline-flex', alignItems: 'center', gap: 8,
          }}>💾 Enregistrer</button>
        </div>
      )}
    </CkShell>
  )
}
