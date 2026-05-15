'use client'
import { useEffect, useMemo, useState, Fragment } from 'react'
import { CkShell } from '@/components/CkShell'
import {
  surface, surface2, line, line2, text, muted, muted2,
  accent, accent2, emerald, amber, rose, cyan, violet, fuchsia,
} from '@/lib/ck-vars'
import { AGENTS_DATA, makeSpark, sparkPath, areaPath } from '@/lib/studio-utils'
import { createSupabaseBrowser } from '@/lib/supabase-browser'
import { useAuth } from '@/lib/auth-context'
import { toast } from 'sonner'

const VENTURES_AN = [
  { id: 'solocfo', name: 'Solo CFO',    mrr: 1840, accent: '#22d3ee' },
  { id: 'forms',   name: 'Kenomi Forms',mrr: 1240, accent: '#a78bfa' },
  { id: 'legal',   name: 'Legal Intake',mrr:  720, accent: '#34d399' },
  { id: 'hrops',   name: 'HR Ops Inbox',mrr:  320, accent: '#fbbf24' },
  { id: 'cfo2',    name: 'CFO Niche 2', mrr:  120, accent: '#e879f9' },
]

const CHANNELS_AN = [
  { id: 'seo',        label: 'SEO',        value: 38, color: emerald  },
  { id: 'linkedin',   label: 'LinkedIn',   value: 24, color: cyan     },
  { id: 'tiktok',     label: 'TikTok',     value: 16, color: fuchsia  },
  { id: 'newsletter', label: 'Newsletter', value: 12, color: violet   },
  { id: 'ads',        label: 'Paid ads',   value:  6, color: amber    },
  { id: 'referral',   label: 'Referral',   value:  4, color: rose     },
]

const FUNNEL = [
  { label: 'Visits',  n: 18420, color: cyan    },
  { label: 'Signups', n:  1342, color: violet  },
  { label: 'Trial',   n:   612, color: emerald },
  { label: 'Paid',    n:   162, color: accent  },
]

function BigKPI({ label, value, delta, color, trend }: { label: string; value: string; delta: string; color: string; trend?: boolean }) {
  const spark = useMemo(() => makeSpark(28, 40, 14, label.length * 7), [label])
  const uid = label.replace(/\W/g, '')
  return (
    <div style={{
      background: surface, border: `1px solid ${line}`, borderRadius: 12,
      padding: 12, position: 'relative', overflow: 'hidden',
    }}>
      <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, background: color, opacity: .7 }} />
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, color: muted, letterSpacing: '.14em', textTransform: 'uppercase' }}>{label}</span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, padding: '2px 6px', borderRadius: 3, background: `${color}1a`, color, letterSpacing: 1, fontWeight: 700 }}>{delta}</span>
      </div>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: 26, fontWeight: 800, letterSpacing: '-.02em', marginTop: 6, color: text }}>{value}</div>
      {trend && (
        <svg viewBox="0 0 100 24" preserveAspectRatio="none" style={{ width: '100%', height: 22, marginTop: 4, display: 'block' }}>
          <defs>
            <linearGradient id={`kpi-${uid}`} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity=".4" />
              <stop offset="100%" stopColor={color} stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={areaPath(spark, 100, 24, 1)} fill={`url(#kpi-${uid})`} />
          <path d={sparkPath(spark, 100, 24, 1)} fill="none" stroke={color} strokeWidth="1.4" />
        </svg>
      )}
    </div>
  )
}

function StackedArea({ series }: { series: { v: typeof VENTURES_AN[0]; values: number[] }[] }) {
  const W = 900, H = 280, pad = 10
  const n = series[0].values.length
  const stacked = Array.from({ length: n }, () => 0)
  const layers = series.map(s => {
    const layer = s.values.map((v, i) => {
      const bottom = stacked[i]
      stacked[i] += v
      return { bottom, top: stacked[i] }
    })
    return { v: s.v, layer }
  })
  const max = Math.max(...stacked) * 1.05

  const toPath = (layer: { bottom: number; top: number }[], isArea: boolean) => {
    const stepX = (W - pad * 2) / (n - 1)
    let d = ''
    for (let i = 0; i < n; i++) {
      const x = pad + i * stepX
      const yTop = pad + (H - pad * 2) * (1 - layer[i].top / max)
      d += `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${yTop.toFixed(1)}`
    }
    if (isArea) {
      for (let i = n - 1; i >= 0; i--) {
        const x = pad + i * stepX
        const yBot = pad + (H - pad * 2) * (1 - layer[i].bottom / max)
        d += `L${x.toFixed(1)},${yBot.toFixed(1)}`
      }
      d += 'Z'
    }
    return d
  }

  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: '100%', height: '100%' }}>
      {[0, 1, 2, 3, 4].map(i => (
        <line key={i} x1={pad} x2={W - pad}
          y1={pad + i * ((H - pad * 2) / 4)} y2={pad + i * ((H - pad * 2) / 4)}
          stroke={line} strokeWidth="1" strokeDasharray={i === 4 ? undefined : '2 4'} />
      ))}
      {layers.map(L => (
        <g key={L.v.id}>
          <path d={toPath(L.layer, true)} fill={L.v.accent} fillOpacity=".55" />
          <path d={toPath(L.layer, false)} fill="none" stroke={L.v.accent} strokeWidth="1.6" />
        </g>
      ))}
      {[0, 1, 2, 3, 4].map(i => (
        <text key={i} x={W - pad + 4} y={pad + i * ((H - pad * 2) / 4) + 3}
          fontSize="9" fill={muted2} fontFamily="var(--font-mono)" letterSpacing="1">
          €{Math.round(max * (1 - i / 4))}
        </text>
      ))}
    </svg>
  )
}

function AgentContributionChart() {
  const contrib = AGENTS_DATA.map((a, i) => ({ agent: a, pct: [16, 14, 18, 11, 17, 13, 11][i] ?? 10 }))
  const total = contrib.reduce((s, i) => s + i.pct, 0)
  const r = 60, c = 2 * Math.PI * r
  let acc = 0
  const maxPct = Math.max(...contrib.map(x => x.pct))
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 10, flex: 1 }}>
      <div style={{ display: 'grid', placeItems: 'center', position: 'relative', height: 160 }}>
        <svg width="160" height="160" viewBox="0 0 160 160">
          {contrib.map(it => {
            const off = (acc / total) * c
            const len = (it.pct / total) * c
            acc += it.pct
            return (
              <circle key={it.agent.id}
                cx="80" cy="80" r={r}
                fill="none" stroke={it.agent.color} strokeWidth="14"
                strokeDasharray={`${len - 2} ${c - len + 2}`}
                strokeDashoffset={-off}
                transform="rotate(-90 80 80)" />
            )
          })}
          <circle cx="80" cy="80" r={r - 14} fill={surface} />
        </svg>
        <div style={{ position: 'absolute', textAlign: 'center' }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 800, color: text }}>€4.2k</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: muted2, letterSpacing: '.14em' }}>MRR / 30j</div>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        {contrib.map(it => (
          <div key={it.agent.id} style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: 8, alignItems: 'center' }}>
            <span style={{
              width: 18, height: 18, borderRadius: 4, border: `1px solid ${it.agent.color}`,
              background: `${it.agent.color}10`,
              display: 'grid', placeItems: 'center',
              fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 10, color: it.agent.color,
            }}>{it.agent.sigil}</span>
            <div>
              <div style={{ fontSize: 11.5, fontWeight: 600, color: text }}>{it.agent.name}</div>
              <div style={{ height: 3, borderRadius: 2, background: surface2, marginTop: 2, overflow: 'hidden' }}>
                <div style={{ width: `${(it.pct / maxPct) * 100}%`, height: '100%', background: it.agent.color }} />
              </div>
            </div>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: it.agent.color, fontWeight: 700 }}>{it.pct}%</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function CohortHeatmap({ data }: { data: (number | null)[][] }) {
  return (
    <div style={{ flex: 1, marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{
        display: 'grid', gridTemplateColumns: '70px repeat(8, 1fr)', gridTemplateRows: 'repeat(9, 1fr)',
        gap: 3, flex: 1,
      }}>
        <div />
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={`h-${i}`} style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: muted2, textAlign: 'center', letterSpacing: '.1em' }}>M{i}</div>
        ))}
        {data.map((row, ri) => (
          <Fragment key={`r-${ri}`}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, color: muted, letterSpacing: '.1em', display: 'flex', alignItems: 'center', gap: 4 }}>
              {(() => { const d = new Date(); d.setMonth(d.getMonth() - (7 - ri)); return d.toLocaleString('fr', { month: 'short' }) })()}
              <span style={{ color: muted2 }}>{30 + ri * 11}</span>
            </div>
            {row.map((v, ci) => v === null ? (
              <div key={`c-${ri}-${ci}`} />
            ) : (
              <div key={`c-${ri}-${ci}`} style={{
                background: emerald,
                opacity: 0.08 + v * 0.7,
                borderRadius: 3,
                display: 'grid', placeItems: 'center',
                fontFamily: 'var(--font-mono)', fontSize: 9.5, fontWeight: 700,
                color: v > 0.55 ? '#0b0d12' : '#e7eaf0',
              }}>
                {Math.round(v * 100)}
              </div>
            ))}
          </Fragment>
        ))}
      </div>
    </div>
  )
}

function ChannelBars() {
  const max = Math.max(...CHANNELS_AN.map(i => i.value))
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10, marginTop: 14 }}>
      {CHANNELS_AN.map(it => (
        <div key={it.id} style={{ display: 'grid', gridTemplateColumns: '90px 1fr 40px', alignItems: 'center', gap: 10 }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, color: muted, letterSpacing: '.1em', textTransform: 'uppercase', fontWeight: 600 }}>{it.label}</span>
          <div style={{ height: 18, borderRadius: 4, background: surface2, border: `1px solid ${line}`, overflow: 'hidden', position: 'relative' }}>
            <div style={{ width: `${(it.value / max) * 100}%`, height: '100%', background: `linear-gradient(90deg, ${it.color}, ${it.color}80)` }} />
            <div style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(90deg, rgba(255,255,255,.08) 1px, transparent 1px)', backgroundSize: '16px 100%' }} />
          </div>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11.5, color: it.color, fontWeight: 700, textAlign: 'right' }}>{it.value}%</span>
        </div>
      ))}
    </div>
  )
}

interface KpiSnapshot {
  revenue: string; revenue_delta: string
  ctr: string; ctr_delta: string
  conversion: string; conversion_delta: string
  retention: string; retention_delta: string
}

interface FunnelStep {
  id: string; position: number; label: string; value: string; rate: string
}

const FUNNEL_COLORS = [cyan, violet, emerald, accent]

function ConvFunnel({ steps }: { steps: FunnelStep[] }) {
  const list = steps.length > 0 ? steps : FUNNEL.map((f, i) => ({ id: String(i), position: i, label: f.label, value: String(f.n), rate: i === 0 ? '100%' : `${Math.round((f.n / FUNNEL[i - 1].n) * 100)}%` }))
  const maxVal = Math.max(...list.map(s => parseFloat(s.value.replace(/[^0-9.]/g, '')) || 0))
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10, marginTop: 14 }}>
      {list.map((it, i) => {
        const n = parseFloat(it.value.replace(/[^0-9.]/g, '')) || 0
        const w = maxVal > 0 ? (n / maxVal) * 100 : 0
        const color = FUNNEL_COLORS[i % FUNNEL_COLORS.length]
        return (
          <div key={it.id} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '.14em', textTransform: 'uppercase', color: muted }}>
              <span>{it.label}</span>
              <span style={{ color }}>{it.value}</span>
            </div>
            <div style={{ height: 28, position: 'relative', display: 'flex', alignItems: 'center' }}>
              <div style={{
                width: `${w}%`, height: '100%',
                background: `linear-gradient(90deg, ${color}, ${color}55)`,
                clipPath: 'polygon(0 0, 100% 10%, 100% 90%, 0 100%)',
                display: 'flex', alignItems: 'center', paddingLeft: 12,
              }}>
                <span style={{ fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 800, color: '#0b0d12' }}>{it.value}</span>
              </div>
              {i > 0 && (
                <span style={{ marginLeft: 10, fontFamily: 'var(--font-mono)', fontSize: 10, color: emerald, letterSpacing: '.14em', fontWeight: 700 }}>
                  ↓ {it.rate}
                </span>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function KpiEditPanel({ kpi, onSave, onClose }: {
  kpi: KpiSnapshot; onSave: (k: KpiSnapshot) => void; onClose: () => void
}) {
  const [form, setForm] = useState<KpiSnapshot>({ ...kpi })
  const p = (field: keyof KpiSnapshot) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(prev => ({ ...prev, [field]: e.target.value }))

  const FIELDS: { label: string; key: keyof KpiSnapshot; delta: keyof KpiSnapshot }[] = [
    { label: 'Revenue',    key: 'revenue',    delta: 'revenue_delta'    },
    { label: 'CTR',        key: 'ctr',        delta: 'ctr_delta'        },
    { label: 'Conversion', key: 'conversion', delta: 'conversion_delta' },
    { label: 'Retention',  key: 'retention',  delta: 'retention_delta'  },
  ]

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(0,0,0,.6)', backdropFilter: 'blur(4px)',
    }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        background: surface, border: `1px solid ${line2}`, borderRadius: 16,
        padding: 28, width: 480, display: 'flex', flexDirection: 'column', gap: 18,
        boxShadow: `0 0 60px ${accent}20`,
      }}>
        <div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 800, color: text }}>Éditer les KPIs</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: muted, letterSpacing: '.14em', marginTop: 2 }}>period · current</div>
        </div>
        {FIELDS.map(f => (
          <div key={f.key} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, color: muted, letterSpacing: '.14em', textTransform: 'uppercase', marginBottom: 4 }}>{f.label}</div>
              <input value={form[f.key]} onChange={p(f.key)} className="ck-input" style={{ width: '100%' }} />
            </div>
            <div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, color: muted, letterSpacing: '.14em', textTransform: 'uppercase', marginBottom: 4 }}>Δ {f.label}</div>
              <input value={form[f.delta]} onChange={p(f.delta)} className="ck-input" style={{ width: '100%' }} />
            </div>
          </div>
        ))}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '9px 18px', borderRadius: 8, background: 'transparent', border: `1px solid ${line}`, color: muted, fontFamily: 'var(--font-mono)', fontSize: 11, cursor: 'pointer' }}>Annuler</button>
          <button onClick={() => onSave(form)} style={{ padding: '9px 18px', borderRadius: 8, background: accent, color: '#0b0d12', border: 'none', fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 12, cursor: 'pointer' }}>Sauvegarder</button>
        </div>
      </div>
    </div>
  )
}

const DEFAULT_KPI: KpiSnapshot = { revenue: '€0', revenue_delta: '+0%', ctr: '0%', ctr_delta: '+0 pts', conversion: '0%', conversion_delta: '+0 pts', retention: '0%', retention_delta: '+0 pts' }

export default function AnalyticsPage() {
  const { user } = useAuth()
  const [range, setRange] = useState('30j')
  const [kpi, setKpi] = useState<KpiSnapshot | null>(null)
  const [funnel, setFunnel] = useState<FunnelStep[]>([])
  const [editOpen, setEditOpen] = useState(false)

  useEffect(() => {
    if (!user) return
    const supabase = createSupabaseBrowser()
    supabase.from('kpi_snapshots').select('*').eq('user_id', user.id).eq('period', 'current').maybeSingle()
      .then(({ data }) => setKpi(data as KpiSnapshot | null))
    supabase.from('funnel_steps').select('*').eq('user_id', user.id).order('position')
      .then(({ data }) => setFunnel((data as FunnelStep[]) || []))
  }, [user])

  async function saveKpi(updated: KpiSnapshot) {
    if (!user) return
    const supabase = createSupabaseBrowser()
    const { error } = await supabase.from('kpi_snapshots').upsert({
      user_id: user.id, period: 'current', ...updated, updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,period' })
    if (error) return toast.error(error.message)
    setKpi(updated)
    setEditOpen(false)
    toast.success('KPIs mis à jour')
  }

  const live = kpi ?? DEFAULT_KPI
  const KPI_LIST = [
    { label: 'Studio MRR',  value: live.revenue,    delta: live.revenue_delta,    color: emerald,  trend: true  },
    { label: 'CTR',         value: live.ctr,         delta: live.ctr_delta,         color: cyan,     trend: true  },
    { label: 'Conversion',  value: live.conversion,  delta: live.conversion_delta,  color: violet,   trend: true  },
    { label: 'Retention',   value: live.retention,   delta: live.retention_delta,   color: amber,    trend: true  },
    { label: 'Churn',       value: '3.1%',           delta: '-0.4pt',               color: fuchsia,  trend: true  },
    { label: 'Runway',      value: '14m',            delta: 'stable',               color: rose,     trend: false },
  ]

  const mrrSeries = useMemo(() => VENTURES_AN.map((v, i) => {
    const base = v.mrr / 10
    const vol = 6 + i * 1.5
    return { v, values: makeSpark(60, base + 5, vol, (i + 1) * 13 + 5).map((x, j) => Math.max(0, x * (base / 30) + (j / 60) * (v.mrr / 30))) }
  }), [])

  const cohort = useMemo(() => Array.from({ length: 8 }).map((_, row) =>
    Array.from({ length: 8 }).map((_, col) => {
      if (col > 7 - row) return null
      const decay = Math.exp(-col * 0.18)
      const r = (0.8 + Math.sin(row * 0.7 + col * 0.4) * 0.18) * decay
      return r
    })
  ), [])

  const headerActions = (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      <button onClick={() => setEditOpen(true)} style={{
        padding: '6px 14px', borderRadius: 999,
        background: accent, color: '#0b0d12', border: 'none', cursor: 'pointer',
        fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 12, letterSpacing: '.04em',
      }}>Éditer KPIs</button>
      <div style={{ display: 'flex', gap: 0, background: surface, border: `1px solid ${line}`, borderRadius: 8, padding: 3 }}>
        {['7j', '30j', '90j', 'ALL'].map(r => (
          <button key={r} onClick={() => setRange(r)} style={{
            padding: '6px 12px', borderRadius: 6, border: 'none',
            background: range === r ? accent : 'transparent',
            color: range === r ? '#0b0d12' : muted,
            fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '.14em', textTransform: 'uppercase',
            fontWeight: 700, cursor: 'pointer', transition: 'background .15s',
          }}>{r}</button>
        ))}
      </div>
      {[
        { label: '5 ventures', color: muted },
        { label: live.revenue, color: emerald },
        { label: 'conv ' + live.conversion, color: cyan },
        { label: 'rétention ' + live.retention, color: muted },
      ].map(({ label, color }) => (
        <span key={label} style={{
          padding: '4px 10px', borderRadius: 5,
          background: `${color}18`, color,
          fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '.1em', fontWeight: 700,
          border: `1px solid ${color}30`,
        }}>{label}</span>
      ))}
    </div>
  )

  return (
    <CkShell breadcrumb="Studio / Analytics" title="Telemetry" subtitle="MRR · CAC · LTV · Cohorts · Funnel" actions={headerActions}>
      {editOpen && <KpiEditPanel kpi={live} onSave={saveKpi} onClose={() => setEditOpen(false)} />}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

        {/* KPI strip */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 10 }}>
          {KPI_LIST.map(k => <BigKPI key={k.label} {...k} />)}
        </div>

        {/* MRR chart + donut */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 14 }}>

          {/* Stacked area */}
          <div style={{
            background: surface, border: `1px solid ${line}`, borderRadius: 14,
            padding: 16, display: 'flex', flexDirection: 'column', minHeight: 320,
          }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12 }}>
              <div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 700, letterSpacing: '-.01em', color: text }}>Studio MRR · 60 jours</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, color: muted2, letterSpacing: '.14em', textTransform: 'uppercase', marginTop: 2 }}>contribution par venture · stacked</div>
              </div>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                {VENTURES_AN.map(v => (
                  <div key={v.id} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ width: 8, height: 8, borderRadius: 2, background: v.accent }} />
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, color: muted, letterSpacing: '.1em' }}>{v.name}</span>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ flex: 1, minHeight: 240 }}>
              <StackedArea series={mrrSeries} />
            </div>
          </div>

          {/* Agent contribution donut */}
          <div style={{
            background: surface, border: `1px solid ${line}`, borderRadius: 14,
            padding: 16, display: 'flex', flexDirection: 'column',
          }}>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 700, letterSpacing: '-.01em', color: text }}>Agent contribution</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, color: muted2, letterSpacing: '.14em', textTransform: 'uppercase', marginTop: 2 }}>attribution MRR · 30j</div>
            <AgentContributionChart />
          </div>
        </div>

        {/* Cohort + Channel + Funnel */}
        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr', gap: 14 }}>

          {/* Cohort heatmap */}
          <div style={{
            background: surface, border: `1px solid ${line}`, borderRadius: 14,
            padding: 16, display: 'flex', flexDirection: 'column',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 700, letterSpacing: '-.01em', color: text }}>Cohort retention</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, color: muted2, letterSpacing: '.14em', textTransform: 'uppercase', marginTop: 2 }}>8 cohortes · 8 mois</div>
              </div>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, color: emerald, letterSpacing: '.14em' }}>M3 avg 38%</span>
            </div>
            <CohortHeatmap data={cohort} />
          </div>

          {/* Channel bars */}
          <div style={{
            background: surface, border: `1px solid ${line}`, borderRadius: 14,
            padding: 16, display: 'flex', flexDirection: 'column',
          }}>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 700, letterSpacing: '-.01em', color: text }}>Channels · last 30d</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, color: muted2, letterSpacing: '.14em', textTransform: 'uppercase', marginTop: 2 }}>signup attribution</div>
            <ChannelBars />
          </div>

          {/* Funnel */}
          <div style={{
            background: surface, border: `1px solid ${line}`, borderRadius: 14,
            padding: 16, display: 'flex', flexDirection: 'column',
          }}>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 700, letterSpacing: '-.01em', color: text }}>Funnel · all ventures</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, color: muted2, letterSpacing: '.14em', textTransform: 'uppercase', marginTop: 2 }}>visit → paid</div>
            <ConvFunnel steps={funnel} />
          </div>
        </div>
      </div>
    </CkShell>
  )
}
