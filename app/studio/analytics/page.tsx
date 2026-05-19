'use client'
import { useEffect, useMemo, useState, Fragment } from 'react'
import { CkShell } from '@/components/CkShell'
import { KpiCard } from '@/components/studio/KpiCard'
import { useIsMobile } from '@/lib/studio-utils'
import {
  surface,
  surface2,
  line,
  line2,
  text,
  muted,
  muted2,
  accent,
  emerald,
  amber,
  rose,
  cyan,
  violet,
  fuchsia,
} from '@/lib/ck-vars'
import { makeSpark, sparkPath, areaPath } from '@/lib/studio-utils'
import { createSupabaseBrowser } from '@/lib/supabase-browser'
import { useAuth } from '@/lib/auth-context'
import { toast } from 'sonner'
import { aggregateLive, type LiveVentureMetrics } from '@/lib/metrics/analytics-live'

const VENTURE_ACCENTS = [
  '#22d3ee',
  '#a78bfa',
  '#34d399',
  '#fbbf24',
  '#e879f9',
  '#fb7185',
  '#f97316',
]

type VentureAN = { id: string; name: string; mrr: number; accent: string }

function BigKPI({
  label,
  value,
  delta,
  color,
  trend,
  sparkData,
}: {
  label: string
  value: string
  delta: string
  color: string
  trend?: boolean
  sparkData?: number[]
}) {
  const fallbackSpark = useMemo(() => makeSpark(28, 40, 14, label.length * 7), [label])
  const spark = sparkData && sparkData.length >= 2 ? sparkData : fallbackSpark
  const uid = label.replace(/\W/g, '')
  return (
    <div
      style={{
        background: surface,
        border: `1px solid ${line}`,
        borderRadius: 12,
        padding: 12,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          bottom: 0,
          width: 3,
          background: color,
          opacity: 0.7,
        }}
      />
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 9.5,
            color: muted,
            letterSpacing: '.14em',
            textTransform: 'uppercase',
          }}
        >
          {label}
        </span>
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 9.5,
            padding: '2px 6px',
            borderRadius: 3,
            background: `${color}1a`,
            color,
            letterSpacing: 1,
            fontWeight: 700,
          }}
        >
          {delta}
        </span>
      </div>
      <div
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: 26,
          fontWeight: 800,
          letterSpacing: '-.02em',
          marginTop: 6,
          color: text,
        }}
      >
        {value}
      </div>
      {trend && (
        <svg
          viewBox="0 0 100 24"
          preserveAspectRatio="none"
          style={{ width: '100%', height: 22, marginTop: 4, display: 'block' }}
        >
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

function StackedArea({ series }: { series: { v: VentureAN; values: number[] }[] }) {
  const W = 900,
    H = 280,
    pad = 10
  const n = series[0].values.length
  const stacked = Array.from({ length: n }, () => 0)
  const layers = series.map((s) => {
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
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      style={{ width: '100%', height: '100%' }}
    >
      {[0, 1, 2, 3, 4].map((i) => (
        <line
          key={i}
          x1={pad}
          x2={W - pad}
          y1={pad + i * ((H - pad * 2) / 4)}
          y2={pad + i * ((H - pad * 2) / 4)}
          stroke={line}
          strokeWidth="1"
          strokeDasharray={i === 4 ? undefined : '2 4'}
        />
      ))}
      {layers.map((L) => (
        <g key={L.v.id}>
          <path d={toPath(L.layer, true)} fill={L.v.accent} fillOpacity=".55" />
          <path d={toPath(L.layer, false)} fill="none" stroke={L.v.accent} strokeWidth="1.6" />
        </g>
      ))}
      {[0, 1, 2, 3, 4].map((i) => (
        <text
          key={i}
          x={W - pad + 4}
          y={pad + i * ((H - pad * 2) / 4) + 3}
          fontSize="9"
          fill={muted2}
          fontFamily="var(--font-mono)"
          letterSpacing="1"
        >
          €{Math.round(max * (1 - i / 4))}
        </text>
      ))}
    </svg>
  )
}

function AgentContributionChart() {
  return (
    <div style={{ flex: 1, display: 'grid', placeItems: 'center', marginTop: 14 }}>
      <div style={{ textAlign: 'center', color: muted2, fontSize: 12, lineHeight: 1.6 }}>
        Aucune attribution agent fiable
        <br />
        <span style={{ fontSize: 10, color: muted, letterSpacing: '.1em' }}>
          Connectez une source d&apos;attribution MRR avant d&apos;afficher une répartition
        </span>
      </div>
    </div>
  )
}

function CohortHeatmap({ data }: { data: (number | null)[][] }) {
  if (data.length === 0) {
    return (
      <div style={{ flex: 1, display: 'grid', placeItems: 'center', marginTop: 14 }}>
        <div style={{ textAlign: 'center', color: muted2, fontSize: 12, lineHeight: 1.6 }}>
          Aucune cohorte calculée
          <br />
          <span style={{ fontSize: 10, color: muted, letterSpacing: '.1em' }}>
            Les données de rétention seront affichées après instrumentation des cohortes
          </span>
        </div>
      </div>
    )
  }

  return (
    <div style={{ flex: 1, marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '70px repeat(8, 1fr)',
          gridTemplateRows: 'repeat(9, 1fr)',
          gap: 3,
          flex: 1,
        }}
      >
        <div />
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={`h-${i}`}
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 9,
              color: muted2,
              textAlign: 'center',
              letterSpacing: '.1em',
            }}
          >
            M{i}
          </div>
        ))}
        {data.map((row, ri) => (
          <Fragment key={`r-${ri}`}>
            <div
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 9.5,
                color: muted,
                letterSpacing: '.1em',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
              }}
            >
              {(() => {
                const d = new Date()
                d.setMonth(d.getMonth() - (7 - ri))
                return d.toLocaleString('fr', { month: 'short' })
              })()}
              <span style={{ color: muted2 }}>{30 + ri * 11}</span>
            </div>
            {row.map((v, ci) =>
              v === null ? (
                <div key={`c-${ri}-${ci}`} />
              ) : (
                <div
                  key={`c-${ri}-${ci}`}
                  style={{
                    background: emerald,
                    opacity: 0.08 + v * 0.7,
                    borderRadius: 3,
                    display: 'grid',
                    placeItems: 'center',
                    fontFamily: 'var(--font-mono)',
                    fontSize: 9.5,
                    fontWeight: 700,
                    color: v > 0.55 ? '#0b0d12' : '#e7eaf0',
                  }}
                >
                  {Math.round(v * 100)}
                </div>
              )
            )}
          </Fragment>
        ))}
      </div>
    </div>
  )
}

function ChannelBars() {
  return (
    <div style={{ flex: 1, display: 'grid', placeItems: 'center', marginTop: 14 }}>
      <p style={{ fontSize: 12, color: muted2, textAlign: 'center', lineHeight: 1.6 }}>
        Aucune donnée d&apos;attribution
        <br />
        <span style={{ fontSize: 10, color: muted, letterSpacing: '.1em' }}>
          Connectez votre source de trafic
        </span>
      </p>
    </div>
  )
}

interface KpiSnapshot {
  revenue: string
  revenue_delta: string
  ctr: string
  ctr_delta: string
  conversion: string
  conversion_delta: string
  retention: string
  retention_delta: string
  churn: string
  churn_delta: string
  runway: string
  runway_delta: string
}

interface FunnelStep {
  id: string
  position: number
  label: string
  value: string
  rate: string
}

const FUNNEL_COLORS = [cyan, violet, emerald, accent]

function ConvFunnel({ steps }: { steps: FunnelStep[] }) {
  if (steps.length === 0)
    return (
      <div style={{ flex: 1, display: 'grid', placeItems: 'center', marginTop: 14 }}>
        <p style={{ fontSize: 12, color: muted2, textAlign: 'center', lineHeight: 1.6 }}>
          Aucune étape de funnel
          <br />
          <span style={{ fontSize: 10, color: muted, letterSpacing: '.1em' }}>
            Ajoutez des étapes via la base
          </span>
        </p>
      </div>
    )
  const list = steps
  const maxVal = Math.max(...list.map((s) => parseFloat(s.value.replace(/[^0-9.]/g, '')) || 0))
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10, marginTop: 14 }}>
      {list.map((it, i) => {
        const n = parseFloat(it.value.replace(/[^0-9.]/g, '')) || 0
        const w = maxVal > 0 ? (n / maxVal) * 100 : 0
        const color = FUNNEL_COLORS[i % FUNNEL_COLORS.length]
        return (
          <div key={it.id} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontFamily: 'var(--font-mono)',
                fontSize: 10,
                letterSpacing: '.14em',
                textTransform: 'uppercase',
                color: muted,
              }}
            >
              <span>{it.label}</span>
              <span style={{ color }}>{it.value}</span>
            </div>
            <div
              style={{ height: 28, position: 'relative', display: 'flex', alignItems: 'center' }}
            >
              <div
                style={{
                  width: `${w}%`,
                  height: '100%',
                  background: `linear-gradient(90deg, ${color}, ${color}55)`,
                  clipPath: 'polygon(0 0, 100% 10%, 100% 90%, 0 100%)',
                  display: 'flex',
                  alignItems: 'center',
                  paddingLeft: 12,
                }}
              >
                <span
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontSize: 14,
                    fontWeight: 800,
                    color: '#0b0d12',
                  }}
                >
                  {it.value}
                </span>
              </div>
              {i > 0 && (
                <span
                  style={{
                    marginLeft: 10,
                    fontFamily: 'var(--font-mono)',
                    fontSize: 10,
                    color: emerald,
                    letterSpacing: '.14em',
                    fontWeight: 700,
                  }}
                >
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

function KpiEditPanel({
  kpi,
  onSave,
  onClose,
}: {
  kpi: KpiSnapshot
  onSave: (k: KpiSnapshot) => void
  onClose: () => void
}) {
  const [form, setForm] = useState<KpiSnapshot>({ ...kpi })
  const p = (field: keyof KpiSnapshot) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((prev) => ({ ...prev, [field]: e.target.value }))

  const FIELDS: { label: string; key: keyof KpiSnapshot; delta: keyof KpiSnapshot }[] = [
    { label: 'Revenue', key: 'revenue', delta: 'revenue_delta' },
    { label: 'CTR', key: 'ctr', delta: 'ctr_delta' },
    { label: 'Conversion', key: 'conversion', delta: 'conversion_delta' },
    { label: 'Retention', key: 'retention', delta: 'retention_delta' },
    { label: 'Churn', key: 'churn', delta: 'churn_delta' },
    { label: 'Runway', key: 'runway', delta: 'runway_delta' },
  ]

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0,0,0,.6)',
        backdropFilter: 'blur(4px)',
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: surface,
          border: `1px solid ${line2}`,
          borderRadius: 16,
          padding: 28,
          width: 480,
          display: 'flex',
          flexDirection: 'column',
          gap: 18,
          boxShadow: `0 0 60px ${accent}20`,
        }}
      >
        <div>
          <div
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 16,
              fontWeight: 800,
              color: text,
            }}
          >
            Éditer les KPIs
          </div>
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 10,
              color: muted,
              letterSpacing: '.14em',
              marginTop: 2,
            }}
          >
            period · current
          </div>
        </div>
        {FIELDS.map((f) => (
          <div key={f.key} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <div
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 9.5,
                  color: muted,
                  letterSpacing: '.14em',
                  textTransform: 'uppercase',
                  marginBottom: 4,
                }}
              >
                {f.label}
              </div>
              <input
                value={form[f.key]}
                onChange={p(f.key)}
                className="ck-input"
                style={{ width: '100%' }}
              />
            </div>
            <div>
              <div
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 9.5,
                  color: muted,
                  letterSpacing: '.14em',
                  textTransform: 'uppercase',
                  marginBottom: 4,
                }}
              >
                Δ {f.label}
              </div>
              <input
                value={form[f.delta]}
                onChange={p(f.delta)}
                className="ck-input"
                style={{ width: '100%' }}
              />
            </div>
          </div>
        ))}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            style={{
              padding: '9px 18px',
              borderRadius: 8,
              background: 'transparent',
              border: `1px solid ${line}`,
              color: muted,
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              cursor: 'pointer',
            }}
          >
            Annuler
          </button>
          <button
            onClick={() => onSave(form)}
            style={{
              padding: '9px 18px',
              borderRadius: 8,
              background: accent,
              color: '#0b0d12',
              border: 'none',
              fontFamily: 'var(--font-display)',
              fontWeight: 800,
              fontSize: 12,
              cursor: 'pointer',
            }}
          >
            Sauvegarder
          </button>
        </div>
      </div>
    </div>
  )
}

const DEFAULT_KPI: KpiSnapshot = {
  revenue: '€0',
  revenue_delta: '+0%',
  ctr: '0%',
  ctr_delta: '+0 pts',
  conversion: '0%',
  conversion_delta: '+0 pts',
  retention: '0%',
  retention_delta: '+0 pts',
  churn: '—',
  churn_delta: '—',
  runway: '—',
  runway_delta: '—',
}

export default function AnalyticsPage() {
  const { user } = useAuth()
  const isMobile = useIsMobile()
  const [range, setRange] = useState('30j')
  const [kpi, setKpi] = useState<KpiSnapshot | null>(null)
  const [funnel, setFunnel] = useState<FunnelStep[]>([])
  const [ventures, setVentures] = useState<VentureAN[]>([])
  const [editOpen, setEditOpen] = useState(false)
  const [mrrSparkSeries, setMrrSparkSeries] = useState<number[]>([])
  const [liveSnapshots, setLiveSnapshots] = useState<LiveVentureMetrics[]>([])
  const [liveLoading, setLiveLoading] = useState(true)
  const [llmCost, setLlmCost] = useState<{
    totalUsd: number
    totalTokens: number
    runCount: number
  } | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch('/api/studio/analytics/ventures')
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return
        if (data?.ok && Array.isArray(data.ventures)) {
          setLiveSnapshots(data.ventures as LiveVentureMetrics[])
        }
      })
      .catch(() => {
        /* silencieux: la page reste utilisable avec les KPI manuels */
      })
      .finally(() => {
        if (!cancelled) setLiveLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    fetch('/api/studio/analytics/llm-cost')
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return
        if (data?.ok) {
          setLlmCost({
            totalUsd: Number(data.totalUsd) || 0,
            totalTokens: Number(data.totalTokens) || 0,
            runCount: Number(data.runCount) || 0,
          })
        }
      })
      .catch(() => {
        /* silencieux */
      })
    return () => {
      cancelled = true
    }
  }, [])

  const live_metrics = useMemo(() => aggregateLive(liveSnapshots), [liveSnapshots])

  useEffect(() => {
    if (!user) return
    const supabase = createSupabaseBrowser()
    supabase
      .from('kpi_snapshots')
      .select('mrr, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: true })
      .limit(30)
      .then(({ data }) => {
        if (data && data.length > 0) {
          setMrrSparkSeries(
            data.map((d) =>
              typeof d.mrr === 'number' ? d.mrr : parseFloat(String(d.mrr ?? '0')) || 0
            )
          )
        }
      })
  }, [user])

  useEffect(() => {
    if (!user) return
    const supabase = createSupabaseBrowser()
    supabase
      .from('kpi_snapshots')
      .select('*')
      .eq('user_id', user.id)
      .eq('period', 'current')
      .maybeSingle()
      .then(({ data }) => setKpi(data as KpiSnapshot | null))
    supabase
      .from('funnel_steps')
      .select('*')
      .eq('user_id', user.id)
      .order('position')
      .then(({ data }) => setFunnel((data as FunnelStep[]) || []))
    supabase
      .from('ventures')
      .select('id,name,mrr')
      .eq('user_id', user.id)
      .order('score', { ascending: false })
      .then(({ data }) => {
        const list = (data || []) as { id: string; name: string; mrr: string }[]
        setVentures(
          list.map((v, i) => ({
            id: v.id,
            name: v.name,
            mrr: parseFloat(String(v.mrr || '0').replace(/[^0-9.]/g, '')) || 0,
            accent: VENTURE_ACCENTS[i % VENTURE_ACCENTS.length],
          }))
        )
      })
  }, [user])

  async function saveKpi(updated: KpiSnapshot) {
    if (!user) return
    const supabase = createSupabaseBrowser()
    const { error } = await supabase.from('kpi_snapshots').upsert(
      {
        user_id: user.id,
        period: 'current',
        ...updated,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,period' }
    )
    if (error) return toast.error(error.message)
    setKpi(updated)
    setEditOpen(false)
    toast.success('KPIs mis à jour')
  }

  const live = kpi ?? DEFAULT_KPI
  const KPI_LIST = [
    {
      label: 'Studio MRR',
      value: live.revenue,
      delta: live.revenue_delta,
      color: emerald,
      trend: true,
      sparkData: mrrSparkSeries,
    },
    { label: 'CTR', value: live.ctr, delta: live.ctr_delta, color: cyan, trend: true },
    {
      label: 'Conversion',
      value: live.conversion,
      delta: live.conversion_delta,
      color: violet,
      trend: true,
    },
    {
      label: 'Retention',
      value: live.retention,
      delta: live.retention_delta,
      color: amber,
      trend: true,
    },
    { label: 'Churn', value: live.churn, delta: live.churn_delta, color: fuchsia, trend: true },
    { label: 'Runway', value: live.runway, delta: live.runway_delta, color: rose, trend: false },
  ]

  const mrrSeries = useMemo(
    () =>
      ventures.map((v, i) => {
        const base = v.mrr / 10
        const vol = 6 + i * 1.5
        return {
          v,
          values: makeSpark(60, base + 5, vol, (i + 1) * 13 + 5).map((x, j) =>
            Math.max(0, x * (base / 30) + (j / 60) * (v.mrr / 30))
          ),
        }
      }),
    [ventures]
  )

  const cohort = useMemo<(number | null)[][]>(() => [], [])

  const headerActions = (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      <button
        onClick={() => setEditOpen(true)}
        style={{
          padding: '6px 14px',
          borderRadius: 999,
          background: accent,
          color: '#0b0d12',
          border: 'none',
          cursor: 'pointer',
          fontFamily: 'var(--font-display)',
          fontWeight: 800,
          fontSize: 12,
          letterSpacing: '.04em',
        }}
      >
        Éditer KPIs
      </button>
      <div
        style={{
          display: 'flex',
          gap: 0,
          background: surface,
          border: `1px solid ${line}`,
          borderRadius: 8,
          padding: 3,
        }}
      >
        {['7j', '30j', '90j', 'ALL'].map((r) => (
          <button
            key={r}
            onClick={() => setRange(r)}
            style={{
              padding: '6px 12px',
              borderRadius: 6,
              border: 'none',
              background: range === r ? accent : 'transparent',
              color: range === r ? '#0b0d12' : muted,
              fontFamily: 'var(--font-mono)',
              fontSize: 10,
              letterSpacing: '.14em',
              textTransform: 'uppercase',
              fontWeight: 700,
              cursor: 'pointer',
              transition: 'background .15s',
            }}
          >
            {r}
          </button>
        ))}
      </div>
      {[
        { label: `${ventures.length} venture${ventures.length !== 1 ? 's' : ''}`, color: muted },
        { label: live.revenue, color: emerald },
        { label: 'conv ' + live.conversion, color: cyan },
        { label: 'rétention ' + live.retention, color: muted },
      ].map(({ label, color }) => (
        <span
          key={label}
          style={{
            padding: '4px 10px',
            borderRadius: 5,
            background: `${color}18`,
            color,
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
            letterSpacing: '.1em',
            fontWeight: 700,
            border: `1px solid ${color}30`,
          }}
        >
          {label}
        </span>
      ))}
    </div>
  )

  return (
    <CkShell
      breadcrumb="Studio / Analytics"
      title="Telemetry"
      subtitle="MRR · CAC · LTV · Cohorts · Funnel"
      actions={headerActions}
    >
      {editOpen && <KpiEditPanel kpi={live} onSave={saveKpi} onClose={() => setEditOpen(false)} />}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* Live KPIs depuis venture_events (source de vérité) */}
        <div
          style={{
            background: surface,
            border: `1px solid ${line2}`,
            borderRadius: 14,
            padding: 16,
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: 8,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: live_metrics.hasData ? emerald : muted2,
                  boxShadow: live_metrics.hasData ? `0 0 8px ${emerald}` : 'none',
                }}
              />
              <span
                style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: 14,
                  fontWeight: 800,
                  color: text,
                  letterSpacing: '-.01em',
                }}
              >
                Live KPIs · venture_events
              </span>
              <span
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 9.5,
                  color: muted2,
                  letterSpacing: '.12em',
                  textTransform: 'uppercase',
                }}
              >
                {liveLoading
                  ? 'chargement…'
                  : `${live_metrics.ventureCount} venture${live_metrics.ventureCount !== 1 ? 's' : ''}`}
              </span>
            </div>
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 9.5,
                color: muted2,
                letterSpacing: '.1em',
              }}
            >
              page_view · waitlist_signup · payment_succeeded · campaign_spend
            </span>
          </div>

          {!live_metrics.hasData && !liveLoading ? (
            <div
              style={{
                padding: '14px 16px',
                borderRadius: 10,
                background: surface2,
                border: `1px dashed ${line2}`,
                fontFamily: 'var(--font-mono)',
                fontSize: 11,
                color: muted,
                lineHeight: 1.6,
              }}
            >
              Aucun événement capturé pour l&apos;instant. Lancez l&apos;agent Marketing ou publiez
              une landing pour commencer à collecter des{' '}
              <span style={{ color: cyan }}>page_view</span> et{' '}
              <span style={{ color: emerald }}>payment_succeeded</span>.
            </div>
          ) : (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(8, 1fr)',
                gap: 10,
              }}
            >
              {[
                {
                  label: 'Visites',
                  value: live_metrics.totalVisits.toLocaleString('fr-FR'),
                  color: cyan,
                },
                {
                  label: 'Signups',
                  value: live_metrics.totalSignups.toLocaleString('fr-FR'),
                  color: violet,
                },
                {
                  label: 'Taux signup',
                  value: `${(live_metrics.signupRate * 100).toFixed(1)}%`,
                  color: violet,
                },
                {
                  label: 'Revenu',
                  value: `€${live_metrics.revenueEur.toFixed(2)}`,
                  color: emerald,
                },
                { label: 'Spend', value: `€${live_metrics.spendEur.toFixed(2)}`, color: amber },
                {
                  label: 'Profit',
                  value: `€${live_metrics.profitEur.toFixed(2)}`,
                  color: live_metrics.profitEur >= 0 ? emerald : rose,
                },
                {
                  label: 'ROI',
                  value:
                    live_metrics.spendEur > 0 ? `${(live_metrics.roi * 100).toFixed(0)}%` : '—',
                  color: live_metrics.roi >= 0 ? emerald : rose,
                },
                {
                  label: 'Coût LLM',
                  value: llmCost ? `$${llmCost.totalUsd.toFixed(2)}` : '—',
                  color: fuchsia,
                },
              ].map((kpi) => (
                <KpiCard
                  key={kpi.label}
                  compact
                  label={kpi.label}
                  value={kpi.value}
                  color={kpi.color}
                />
              ))}
            </div>
          )}
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 9.5,
              color: muted2,
              letterSpacing: '.1em',
              textTransform: 'uppercase',
            }}
          >
            source venture_events · page_view, waitlist_signup, payment_succeeded, campaign_spend
          </div>
        </div>

        {/* KPI strip (snapshots manuels - legacy, à supprimer une fois live_metrics complètes) */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(6, 1fr)',
            gap: 10,
          }}
        >
          {KPI_LIST.map((k) => (
            <BigKPI key={k.label} {...k} />
          ))}
        </div>

        {/* MRR chart + donut */}
        <div
          style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 320px', gap: 14 }}
        >
          {/* Stacked area */}
          <div
            style={{
              background: surface,
              border: `1px solid ${line}`,
              borderRadius: 14,
              padding: 16,
              display: 'flex',
              flexDirection: 'column',
              minHeight: 320,
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'baseline',
                justifyContent: 'space-between',
                marginBottom: 12,
              }}
            >
              <div>
                <div
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontSize: 14,
                    fontWeight: 700,
                    letterSpacing: '-.01em',
                    color: text,
                  }}
                >
                  Studio MRR · 60 jours
                </div>
                <div
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 9.5,
                    color: muted2,
                    letterSpacing: '.14em',
                    textTransform: 'uppercase',
                    marginTop: 2,
                  }}
                >
                  contribution par venture · stacked
                </div>
              </div>
              {ventures.length > 0 && (
                <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                  {ventures.map((v) => (
                    <div key={v.id} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <span
                        style={{ width: 8, height: 8, borderRadius: 2, background: v.accent }}
                      />
                      <span
                        style={{
                          fontFamily: 'var(--font-mono)',
                          fontSize: 9.5,
                          color: muted,
                          letterSpacing: '.1em',
                        }}
                      >
                        {v.name}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div style={{ flex: 1, minHeight: 240 }}>
              {mrrSeries.length === 0 ? (
                <div style={{ height: '100%', display: 'grid', placeItems: 'center' }}>
                  <p style={{ fontSize: 12, color: muted2, textAlign: 'center' }}>
                    Aucune venture · créez-en une dans Ventures
                  </p>
                </div>
              ) : (
                <StackedArea series={mrrSeries} />
              )}
            </div>
          </div>

          {/* Agent contribution donut */}
          <div
            style={{
              background: surface,
              border: `1px solid ${line}`,
              borderRadius: 14,
              padding: 16,
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <div
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 14,
                fontWeight: 700,
                letterSpacing: '-.01em',
                color: text,
              }}
            >
              Agent contribution
            </div>
            <div
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 9.5,
                color: muted2,
                letterSpacing: '.14em',
                textTransform: 'uppercase',
                marginTop: 2,
              }}
            >
              attribution MRR · source réelle
            </div>
            <AgentContributionChart />
          </div>
        </div>

        {/* Cohort + Channel + Funnel */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: isMobile ? '1fr' : '1.2fr 1fr 1fr',
            gap: 14,
          }}
        >
          {/* Cohort heatmap */}
          <div
            style={{
              background: surface,
              border: `1px solid ${line}`,
              borderRadius: 14,
              padding: 16,
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <div
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}
            >
              <div>
                <div
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontSize: 14,
                    fontWeight: 700,
                    letterSpacing: '-.01em',
                    color: text,
                  }}
                >
                  Cohort retention
                </div>
                <div
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 9.5,
                    color: muted2,
                    letterSpacing: '.14em',
                    textTransform: 'uppercase',
                    marginTop: 2,
                  }}
                >
                  source cohortes · rétention
                </div>
              </div>
              <span
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 9.5,
                  color: emerald,
                  letterSpacing: '.14em',
                }}
              >
                —
              </span>
            </div>
            <CohortHeatmap data={cohort} />
          </div>

          {/* Channel bars */}
          <div
            style={{
              background: surface,
              border: `1px solid ${line}`,
              borderRadius: 14,
              padding: 16,
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <div
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 14,
                fontWeight: 700,
                letterSpacing: '-.01em',
                color: text,
              }}
            >
              Channels · last 30d
            </div>
            <div
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 9.5,
                color: muted2,
                letterSpacing: '.14em',
                textTransform: 'uppercase',
                marginTop: 2,
              }}
            >
              signup attribution
            </div>
            <ChannelBars />
          </div>

          {/* Funnel */}
          <div
            style={{
              background: surface,
              border: `1px solid ${line}`,
              borderRadius: 14,
              padding: 16,
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <div
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 14,
                fontWeight: 700,
                letterSpacing: '-.01em',
                color: text,
              }}
            >
              Funnel · all ventures
            </div>
            <div
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 9.5,
                color: muted2,
                letterSpacing: '.14em',
                textTransform: 'uppercase',
                marginTop: 2,
              }}
            >
              visit → paid
            </div>
            <ConvFunnel steps={funnel} />
          </div>
        </div>
      </div>
    </CkShell>
  )
}
