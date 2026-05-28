'use client'
import { useEffect, useRef, useState, useMemo, useCallback } from 'react'
import { createSupabaseBrowser } from '@/lib/supabase-browser'
import { useAuth } from '@/lib/auth-context'
import { useRouter } from 'next/navigation'
import { useIsMobile } from '@/lib/studio-utils'
import { toast } from 'sonner'
import { buildCashActions, type CashAction, type ProspectCashRow } from '@/lib/studio/cash-queue'
import {
  buildProspectHref,
  buildRateDrilldownHref,
  buildSegmentPushHref,
  buildSourceFocusHref,
} from '@/lib/studio/prospect-filters'
import { buildRevenueHref } from '@/lib/studio/revenue-links'

/* ─── Types ─────────────────────────────────────────────────── */
interface Venture {
  id: string
  name: string
  stage: string
  score: number
  mrr: string
  cac: string
  conversion: string
  next_action: string
  insight: string
}

interface KpiRow {
  period: string
  revenue: string
  revenue_delta: string
  ctr: string
  ctr_delta: string
  conversion: string
  conversion_delta: string
  retention: string
  retention_delta: string
}

type OpsSummaryCard = {
  label: string
  value: string
  tone: 'ok' | 'warn' | 'muted'
  source: {
    source: string
    checkedAt: string | null
    freshness: 'fresh' | 'stale' | 'missing'
    repairHref: string
    emptyLabel: string
  }
}

type OpsSummaryAction = {
  id: string
  label: string
  detail: string
  href: string
  tone: 'ok' | 'warn' | 'muted'
  intent?: {
    id: string
    method: 'GET' | 'POST'
    endpoint: string
    payload: Record<string, unknown> | null
    requiresConfirmation: boolean
    risk: 'low' | 'medium' | 'high'
  }
}

type OpsSummaryPayload = {
  mode: 'calm' | 'attention'
  primaryRepairHref: string
  cards: OpsSummaryCard[]
  actions: OpsSummaryAction[]
}

type OpsHealthSignal = {
  id: 'jobs_failed_24h' | 'approvals_pending' | 'last_deploy' | 'disk_root' | 'revenue_today'
  label: string
  value: string
  tone: 'ok' | 'warn' | 'crit' | 'muted'
  href: string
  detail?: string
}

type OpsHealthSummaryPayload = {
  mode: 'calm' | 'attention'
  signalsFresh: boolean
  signals: OpsHealthSignal[]
}

type RevenueRecommendedAction = {
  type: string
  ventureName: string
  reason: string
  priorityScore: number
  blockedRevenueEur: number
}

type RevenueLoopSnapshotPayload = {
  summary: {
    activeLoops: number
    readyCheckouts: number
    pendingApprovals: number
    revenueEur: number
    blockedRevenueEur: number
    recommendedAction: RevenueRecommendedAction | null
  }
}

type CashOutcomeWindow = {
  replies: number
  deals: number
  cashEur: number
}

type CashOutcomeSnapshot = {
  last7d: CashOutcomeWindow
  previous7d: CashOutcomeWindow
  last30d: CashOutcomeWindow
  previous30d: CashOutcomeWindow
  delta7d: CashOutcomeWindow
  delta30d: CashOutcomeWindow
  rates: {
    replyRate7d: number
    winRate7d: number
    replyRate30d: number
    winRate30d: number
  }
  sourceBreakdown: Array<{
    source: string
    active: number
    replied: number
    won: number
    replyRate: number
    winRate: number
    qualityScore: number
    playbookHint: string
  }>
  sourceBandBreakdown: Array<{
    key: string
    source: string
    band: string
    active: number
    replied: number
    won: number
    replyRate: number
    winRate: number
    qualityScore: number
    playbookHint: string
  }>
  topSegment: {
    key: string
    source: string
    band: string
    qualityScore: number
    playbookHint: string
  } | null
  blockers: Array<{
    key: 'awaiting_approval' | 'draft_created' | 'follow_up_due'
    label: string
    count: number
  }>
  blockerActions: Array<{
    key: 'awaiting_approval' | 'draft_created' | 'follow_up_due'
    label: string
    count: number
    source: string
    ctaLabel: string
    href: string
  }>
}

type ProspectCashPayload = {
  ok: boolean
  prospects: ProspectCashRow[]
  summary: {
    total: number
    awaitingApproval: number
    approvedToSend: number
    draftCreated: number
    sent: number
    followUpDue: number
    won: number
  }
}

/* ─── Static design data ─────────────────────────────────────── */
const AGENTS_STATIC = [
  {
    id: 'scout',
    name: 'Scout',
    code: 'SCT',
    role: 'Discovery',
    model: 'Claude Code',
    color: '#22d3ee',
    sigil: '◬',
  },
  {
    id: 'prospect',
    name: 'Prospect',
    code: 'PRS',
    role: 'Acquisition',
    model: 'Hermes',
    color: '#f59e0b',
    sigil: '◉',
  },
  {
    id: 'validation',
    name: 'Validation',
    code: 'VAL',
    role: 'Scoring',
    model: 'Ollama',
    color: '#a78bfa',
    sigil: '◇',
  },
  {
    id: 'builder',
    name: 'Builder',
    code: 'BLD',
    role: 'Production',
    model: 'Claude Code',
    color: '#34d399',
    sigil: '◮',
  },
  {
    id: 'payment',
    name: 'Payment',
    code: 'PAY',
    role: 'Monetization',
    model: 'Stripe API',
    color: '#fbbf24',
    sigil: '◈',
  },
  {
    id: 'marketing',
    name: 'Marketing',
    code: 'MKT',
    role: 'Distribution',
    model: 'Ollama',
    color: '#e879f9',
    sigil: '✺',
  },
  {
    id: 'analytics',
    name: 'Analytics',
    code: 'ANA',
    role: 'Telemetry',
    model: 'Supabase',
    color: '#60a5fa',
    sigil: '◐',
  },
  {
    id: 'decision',
    name: 'Decision',
    code: 'DEC',
    role: 'Command',
    model: 'Claude Code',
    color: '#ff6a3d',
    sigil: '✦',
  },
]

const RHYTHM = [
  { hour: '06:00', label: 'Scout sweep', agent: 'scout' },
  { hour: '09:00', label: 'Validation', agent: 'validation' },
  { hour: '12:00', label: 'Builder push', agent: 'builder' },
  { hour: '15:00', label: 'Decision review', agent: 'decision' },
  { hour: '17:00', label: 'Marketing batch', agent: 'marketing' },
  { hour: '20:00', label: 'Analytics digest', agent: 'analytics' },
]

function rhythmStatus(hour: string): 'done' | 'now' | 'soon' {
  const now = new Date()
  const nowMin = now.getHours() * 60 + now.getMinutes()
  const [h, m] = hour.split(':').map(Number)
  const rMin = h * 60 + m
  if (rMin <= nowMin - 60) return 'done'
  if (Math.abs(rMin - nowMin) <= 60) return 'now'
  return 'soon'
}

/* ─── Spark chart utilities ──────────────────────────────────── */
function sparkPath(values: number[], w: number, h: number, pad = 2) {
  if (!values.length) return ''
  const min = Math.min(...values),
    max = Math.max(...values)
  const span = max - min || 1
  const step = (w - pad * 2) / (values.length - 1)
  return values
    .map((v, i) => {
      const x = pad + i * step
      const y = pad + (h - pad * 2) * (1 - (v - min) / span)
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')
}

function areaPath(values: number[], w: number, h: number, pad = 2) {
  const line = sparkPath(values, w, h, pad)
  return `${line} L${w - pad},${h - pad} L${pad},${h - pad} Z`
}

/* ─── CSS vars (scoped to cockpit wrapper) ───────────────────── */
const CK_DARK: React.CSSProperties = {
  '--ck-bg': '#07090d',
  '--ck-surface': '#0e1118',
  '--ck-surface-2': '#141823',
  '--ck-line': 'rgba(255,255,255,.07)',
  '--ck-line-2': 'rgba(255,255,255,.12)',
  '--ck-text': '#e7eaf0',
  '--ck-muted': '#8a93a6',
  '--ck-muted-2': '#5b6478',
  '--ck-accent': '#ff6a3d',
  '--ck-accent-2': '#ffd166',
  '--ck-emerald': '#34d399',
  '--ck-amber': '#fbbf24',
  '--ck-rose': '#fb7185',
  '--ck-cyan': '#22d3ee',
} as React.CSSProperties

const CK_LIGHT: React.CSSProperties = {
  ...CK_DARK,
  '--ck-bg': '#f4f1ec',
  '--ck-surface': '#ffffff',
  '--ck-surface-2': '#f9f5ee',
  '--ck-line': 'rgba(15,18,28,.08)',
  '--ck-line-2': 'rgba(15,18,28,.14)',
  '--ck-text': '#14181f',
  '--ck-muted': '#5b6478',
  '--ck-muted-2': '#8a93a6',
} as React.CSSProperties

/* ─── CSS aliases mapping --ck-* → CSS var names ────────────── */
// These let component inline styles reference the scoped vars
const bg = 'var(--ck-bg)'
const surface = 'var(--ck-surface)'
const surface2 = 'var(--ck-surface-2)'
const line = 'var(--ck-line)'
const line2 = 'var(--ck-line-2)'
const text = 'var(--ck-text)'
const muted = 'var(--ck-muted)'
const muted2 = 'var(--ck-muted-2)'
const accent = 'var(--ck-accent)'
const emerald = 'var(--ck-emerald)'
const amber = 'var(--ck-amber)'
const rose = 'var(--ck-rose)'

/* ─── Helpers ────────────────────────────────────────────────── */
const agentById = (id: string) => AGENTS_STATIC.find((a) => a.id === id) ?? AGENTS_STATIC[0]

function actionTokens(action: string) {
  switch (action) {
    case 'Scale':
      return { color: accent, glyph: '↑', label: 'SCALE', desc: 'amplifier ce qui marche' }
    case 'Continue':
      return { color: emerald, glyph: '→', label: 'CONTINUE', desc: 'tenir le cap' }
    case 'Pivot':
      return { color: amber, glyph: '↺', label: 'PIVOT', desc: 'réorienter' }
    case 'Stop':
      return { color: rose, glyph: '×', label: 'STOP', desc: 'archiver, apprendre' }
    default:
      return { color: muted, glyph: '·', label: action, desc: '' }
  }
}

function ventureToDecision(v: Venture) {
  const action =
    v.stage === 'Scale'
      ? 'Scale'
      : v.stage === 'Stop'
        ? 'Stop'
        : v.score >= 75
          ? 'Continue'
          : 'Pivot'
  const mrrNum = parseFloat(v.mrr?.replace(/[^0-9.]/g, '') || '0')
  return {
    id: v.id,
    action,
    venture: v.name,
    stage: v.stage,
    conf: Math.min(99, Math.max(50, v.score)),
    summary: v.insight || `Score ${v.score}, stage ${v.stage}.`,
    primary_metric: 'MRR',
    primary_value: v.mrr || '€0',
    primary_delta: v.conversion ? `conv ${v.conversion}` : '—',
    receipts: [
      {
        label: 'MRR · 28j',
        value: v.mrr || '—',
        delta: v.conversion || '—',
        tone: mrrNum > 500 ? 'good' : 'bad',
      },
      { label: 'CAC', value: v.cac || '—', delta: '—', tone: 'muted' },
      { label: 'Conv.', value: v.conversion || '—', delta: '—', tone: 'muted' },
      {
        label: 'Score',
        value: String(v.score),
        delta: v.stage,
        tone: v.score >= 75 ? 'good' : v.score >= 50 ? 'muted' : 'bad',
      },
    ],
    squad: (action === 'Scale'
      ? ['analytics', 'marketing', 'payment', 'decision']
      : action === 'Continue'
        ? ['validation', 'marketing', 'analytics']
        : action === 'Pivot'
          ? ['validation', 'builder', 'payment', 'marketing']
          : ['marketing', 'analytics']) as string[],
    next: v.next_action || 'Aucune action définie.',
    side_effects: [v.next_action || '—'],
  }
}

/* ─── Sub-components ─────────────────────────────────────────── */

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd
      style={{
        display: 'inline-block',
        minWidth: 18,
        padding: '1px 5px',
        borderRadius: 3,
        background: surface2,
        color: text,
        border: `1px solid ${line2}`,
        borderBottom: `2px solid ${line2}`,
        fontFamily: 'var(--font-mono)',
        fontSize: 10,
        fontWeight: 600,
        textAlign: 'center',
        verticalAlign: 'middle',
      }}
    >
      {children}
    </kbd>
  )
}

function MoonIcon() {
  return (
    <svg width={12} height={12} viewBox="0 0 16 16" fill="none">
      <path
        d="M13.5 9.5A6 6 0 016.5 2.5a6 6 0 107 7z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function SunIcon() {
  return (
    <svg width={12} height={12} viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="3" stroke="currentColor" strokeWidth="1.4" />
      <g stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
        <line x1="8" y1="1.5" x2="8" y2="3" />
        <line x1="8" y1="13" x2="8" y2="14.5" />
        <line x1="1.5" y1="8" x2="3" y2="8" />
        <line x1="13" y1="8" x2="14.5" y2="8" />
        <line x1="3.2" y1="3.2" x2="4.2" y2="4.2" />
        <line x1="11.8" y1="11.8" x2="12.8" y2="12.8" />
        <line x1="3.2" y1="12.8" x2="4.2" y2="11.8" />
        <line x1="11.8" y1="4.2" x2="12.8" y2="3.2" />
      </g>
    </svg>
  )
}

/* Header */
function CkHeader({
  theme,
  onToggleTheme,
  onOpenCmdk,
}: {
  theme: string
  onToggleTheme: () => void
  onOpenCmdk: () => void
}) {
  const router = useRouter()
  const isMobile = useIsMobile()
  const navItems = [
    { label: 'Cockpit', href: '/studio' },
    { label: 'Prospects', href: '/studio/prospects' },
    { label: 'Revenue', href: '/studio/revenue' },
    { label: 'Automations', href: '/studio/automations' },
    { label: 'Infrastructure', href: '/studio/infrastructure' },
    { label: 'Ventures', href: '/studio/ventures' },
    { label: 'Agents', href: '/studio/agents' },
  ]
  return (
    <header
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 10,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: isMobile ? '10px 14px' : '14px 24px',
        background: bg,
        borderBottom: `1px solid ${line}`,
        overflow: 'hidden',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 10 : 14, minWidth: 0 }}>
        {/* Logo mark */}
        <div
          style={{
            width: isMobile ? 28 : 36,
            height: isMobile ? 28 : 36,
            borderRadius: 8,
            background: accent,
            display: 'grid',
            placeItems: 'center',
            flexShrink: 0,
          }}
        >
          <div
            style={{
              width: isMobile ? 16 : 20,
              height: isMobile ? 16 : 20,
              borderRadius: 4,
              background: theme === 'light' ? '#fff' : bg,
              display: 'grid',
              placeItems: 'center',
              fontFamily: 'var(--font-display)',
              fontWeight: 800,
              fontSize: isMobile ? 10 : 13,
              color: text,
            }}
          >
            K
          </div>
        </div>
        <div style={{ minWidth: 0 }}>
          {!isMobile && (
            <div
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 10,
                letterSpacing: '.18em',
                color: muted,
                textTransform: 'uppercase',
              }}
            >
              Kenomi · revenue OS
            </div>
          )}
          <div
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: isMobile ? 16 : 20,
              fontWeight: 700,
              letterSpacing: '-.02em',
              color: text,
              lineHeight: 1.1,
              whiteSpace: 'nowrap',
            }}
          >
            {isMobile ? 'Revenue' : 'Cash actions today'}
          </div>
        </div>
        {!isMobile && (
          <nav style={{ marginLeft: 20, display: 'flex', gap: 4 }}>
            {navItems.map((item, i) => (
              <button
                key={item.label}
                onClick={() => router.push(item.href)}
                style={{
                  padding: '6px 12px',
                  borderRadius: 6,
                  background: i === 0 ? surface : 'transparent',
                  color: i === 0 ? text : muted,
                  border: i === 0 ? `1px solid ${line2}` : '1px solid transparent',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                  letterSpacing: '-.005em',
                  fontFamily: 'var(--font-sans)',
                }}
              >
                {item.label}
              </button>
            ))}
          </nav>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
        {!isMobile && (
          <button
            onClick={onOpenCmdk}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '7px 12px 7px 14px',
              borderRadius: 999,
              background: surface,
              color: muted,
              border: `1px solid ${line2}`,
              cursor: 'pointer',
              fontSize: 12,
              fontFamily: 'var(--font-mono)',
              letterSpacing: '.06em',
            }}
          >
            <span>Search · jump · run</span>
            <Kbd>⌘K</Kbd>
          </button>
        )}
        <button
          onClick={onToggleTheme}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: isMobile ? '6px 10px' : '7px 12px',
            borderRadius: 999,
            background: surface,
            color: text,
            border: `1px solid ${line2}`,
            cursor: 'pointer',
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            letterSpacing: '.14em',
            textTransform: 'uppercase',
          }}
        >
          {theme === 'dark' ? <MoonIcon /> : <SunIcon />}
          {!isMobile && (
            <>
              <span>{theme === 'dark' ? 'Night' : 'Day'}</span>
              <Kbd>T</Kbd>
            </>
          )}
        </button>
      </div>
    </header>
  )
}

/* Confidence ring */
function ConfidenceRing({ value, color }: { value: number; color: string }) {
  const r = 42,
    c = 2 * Math.PI * r
  const pct = Math.max(0, Math.min(100, value))
  return (
    <div
      style={{ position: 'relative', width: 110, height: 110, flexShrink: 0 }}
      role="meter"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={`Confiance ${pct}%`}
    >
      <svg width="110" height="110" viewBox="0 0 110 110" aria-hidden="true">
        <circle cx="55" cy="55" r={r} fill="none" stroke={line2} strokeWidth="6" />
        <circle
          cx="55"
          cy="55"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="6"
          strokeDasharray={`${(pct / 100) * c} ${c}`}
          strokeLinecap="round"
          transform="rotate(-90 55 55)"
        />
      </svg>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'grid',
          placeItems: 'center',
          textAlign: 'center',
        }}
      >
        <div>
          <div
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 28,
              fontWeight: 800,
              color: text,
              lineHeight: 1,
            }}
          >
            {pct}
            <span style={{ fontSize: 14, color: muted2 }}>%</span>
          </div>
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 10,
              letterSpacing: '.18em',
              color: muted,
              marginTop: 4,
            }}
          >
            CONF
          </div>
        </div>
      </div>
    </div>
  )
}

/* Receipt tile */
function Receipt({ r }: { r: { label: string; value: string; delta: string; tone: string } }) {
  const toneColor = r.tone === 'good' ? emerald : r.tone === 'bad' ? rose : muted2
  return (
    <div
      style={{
        padding: '10px 12px',
        borderRadius: 8,
        background: surface2,
        border: `1px solid ${line}`,
      }}
    >
      <div
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 11,
          letterSpacing: '.14em',
          textTransform: 'uppercase',
          color: muted,
        }}
      >
        {r.label}
      </div>
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: 8,
          marginTop: 4,
        }}
      >
        <span
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 18,
            fontWeight: 800,
            color: text,
            letterSpacing: '-.02em',
          }}
        >
          {r.value}
        </span>
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            color: toneColor,
            letterSpacing: '.06em',
          }}
        >
          {r.delta}
        </span>
      </div>
    </div>
  )
}

/* Agent chip */
function AgentChip({ id }: { id: string }) {
  const a = agentById(id)
  if (!a) return null
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '5px 9px',
        borderRadius: 6,
        background: surface2,
        border: `1px solid ${line}`,
      }}
    >
      <span
        style={{
          width: 18,
          height: 18,
          borderRadius: 4,
          background: surface,
          border: `1px solid ${line2}`,
          display: 'grid',
          placeItems: 'center',
          fontFamily: 'var(--font-display)',
          fontWeight: 800,
          fontSize: 11,
          color: text,
        }}
      >
        {a.sigil}
      </span>
      <span style={{ fontSize: 12, color: text, fontWeight: 600 }}>{a.name}</span>
      <span
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 10,
          color: muted2,
          letterSpacing: '.1em',
        }}
      >
        {a.code}
      </span>
    </span>
  )
}

/* Chart with hover tooltip */
function ChartWithTooltip({
  title,
  subtitle,
  series,
  tone,
}: {
  title: string
  subtitle: string
  series: number[]
  tone: string
}) {
  const [hover, setHover] = useState<{ idx: number; x: number } | null>(null)
  const ref = useRef<HTMLDivElement>(null)
  const W = 100,
    H = 100
  const hasSeries = series.length > 1
  const min = hasSeries ? Math.min(...series) : 0
  const max = hasSeries ? Math.max(...series) : 0
  const span = max - min || 1
  const gradId = `df-grad-${title.replace(/\W/g, '')}`

  function onMove(clientX: number) {
    if (!hasSeries) return
    if (!ref.current) return
    const rect = ref.current.getBoundingClientRect()
    const xN = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
    const idx = Math.round(xN * (series.length - 1))
    setHover({ idx, x: rect.width * (idx / (series.length - 1)) })
  }

  return (
    <div
      style={{
        padding: 14,
        borderRadius: 10,
        background: surface2,
        border: `1px solid ${line}`,
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
        position: 'relative',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
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
            {title}
          </div>
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              color: muted,
              letterSpacing: '.06em',
              marginTop: 2,
            }}
          >
            {subtitle}
          </div>
        </div>
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
            padding: '3px 7px',
            borderRadius: 3,
            background: tone + '1c',
            color: tone,
            letterSpacing: '.14em',
            fontWeight: 700,
          }}
        >
          28j
        </span>
      </div>
      <div
        ref={ref}
        onMouseMove={(e) => onMove(e.clientX)}
        onMouseLeave={() => setHover(null)}
        style={{ flex: 1, minHeight: 80, marginTop: 10, position: 'relative' }}
      >
        <svg
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          style={{ width: '100%', height: '100%' }}
        >
          {!hasSeries && (
            <g>
              <line x1="8" x2="92" y1={H / 2} y2={H / 2} stroke={line} strokeDasharray="2 4" />
              <text
                x={W / 2}
                y={H / 2 + 6}
                textAnchor="middle"
                fontSize="8"
                fill={muted}
                fontFamily="var(--font-mono)"
                letterSpacing="0.08em"
              >
                Tendance indisponible
              </text>
            </g>
          )}
          {hasSeries && (
            <>
              <defs>
                <linearGradient id={gradId} x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor={tone} stopOpacity=".4" />
                  <stop offset="100%" stopColor={tone} stopOpacity="0" />
                </linearGradient>
              </defs>
              {[0, 0.5, 1].map((y, i) => (
                <line
                  key={i}
                  x1="0"
                  x2={W}
                  y1={y * H}
                  y2={y * H}
                  stroke={line}
                  strokeWidth="0.4"
                  strokeDasharray={i === 1 ? '1 2' : 'none'}
                />
              ))}
              <path d={areaPath(series, W, H, 1)} fill={`url(#${gradId})`} />
              <path d={sparkPath(series, W, H, 1)} fill="none" stroke={tone} strokeWidth="1.4" />
            </>
          )}
          {hover &&
            (() => {
              if (!series.length) return null
              const x = (hover.idx / (series.length - 1)) * W
              const v = series[hover.idx]
              const y = (1 - (v - min) / span) * H
              return (
                <g>
                  <line
                    x1={x}
                    y1="0"
                    x2={x}
                    y2={H}
                    stroke={accent}
                    strokeWidth="0.6"
                    strokeDasharray="2 2"
                  />
                  <circle cx={x} cy={y} r="2" fill={accent} />
                </g>
              )
            })()}
        </svg>
        {hover && hasSeries && (
          <div
            style={{
              position: 'absolute',
              left: hover.x,
              top: 4,
              transform: 'translateX(-50%)',
              padding: '5px 9px',
              borderRadius: 6,
              background: bg,
              border: `1px solid ${tone}`,
              fontFamily: 'var(--font-mono)',
              fontSize: 10.5,
              color: text,
              whiteSpace: 'nowrap',
              pointerEvents: 'none',
              boxShadow: '0 4px 12px rgba(0,0,0,.4)',
              letterSpacing: '.06em',
            }}
          >
            <span style={{ color: muted }}>J-{series.length - 1 - hover.idx}</span>
            <span style={{ margin: '0 6px', color: muted2 }}>·</span>
            <span style={{ color: tone, fontWeight: 700 }}>
              €{(series[hover.idx] * 60).toFixed(0)}
            </span>
          </div>
        )}
        {hover && !hasSeries && (
          <div
            style={{
              position: 'absolute',
              left: 8,
              top: 8,
              padding: '3px 8px',
              borderRadius: 4,
              background: bg,
              border: `1px solid ${line}`,
              fontFamily: 'var(--font-mono)',
              fontSize: 9,
              color: muted,
              letterSpacing: '.08em',
            }}
          >
            Données insuffisantes
          </div>
        )}
      </div>
    </div>
  )
}

/* Decision hero */
interface DecisionItem {
  id: string
  action: string
  venture: string
  stage: string
  conf: number
  summary: string
  primary_metric: string
  primary_value: string
  primary_delta: string
  receipts: { label: string; value: string; delta: string; tone: string }[]
  squad: string[]
  next: string
  side_effects: string[]
}

function DecisionHero({
  d,
  idx,
  total,
  confirmed,
  onConfirm,
}: {
  d: DecisionItem
  idx: number
  total: number
  confirmed: boolean
  onConfirm: () => void
}) {
  const t = actionTokens(d.action)
  const series: number[] = []
  const isMobile = useIsMobile()

  return (
    <article
      style={{
        background: surface,
        border: `1px solid ${line}`,
        borderRadius: 16,
        padding: 24,
        position: 'relative',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
        minHeight: 0,
      }}
    >
      <div
        style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, background: t.color }}
      />

      {/* Top row */}
      <header style={{ display: 'flex', alignItems: 'flex-start', gap: 24 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 11,
                letterSpacing: '.24em',
                textTransform: 'uppercase',
                color: muted,
                fontWeight: 600,
              }}
            >
              Decision {idx + 1} / {total} · {d.stage}
            </span>
            <span
              style={{
                padding: '2px 8px',
                borderRadius: 999,
                background: confirmed ? emerald + '22' : accent + '22',
                color: confirmed ? emerald : accent,
                fontFamily: 'var(--font-mono)',
                fontSize: 10,
                letterSpacing: '.14em',
                fontWeight: 800,
              }}
            >
              ● {confirmed ? 'CONFIRMED' : 'ACTION NEEDED'}
            </span>
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'baseline',
              gap: 16,
              marginTop: 12,
              flexWrap: 'wrap',
            }}
          >
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 10,
                padding: '8px 16px',
                borderRadius: 8,
                background: t.color,
                color: '#0b0d12',
              }}
            >
              <span style={{ fontSize: 20, fontWeight: 800, lineHeight: 1 }}>{t.glyph}</span>
              <span
                style={{
                  fontFamily: 'var(--font-display)',
                  fontWeight: 800,
                  fontSize: 16,
                  letterSpacing: '.06em',
                }}
              >
                {t.label}
              </span>
            </span>
            <h2
              style={{
                margin: 0,
                fontFamily: 'var(--font-display)',
                fontSize: 38,
                fontWeight: 800,
                letterSpacing: '-.03em',
                lineHeight: 1.05,
                color: text,
              }}
            >
              {d.venture}
            </h2>
          </div>
          <p style={{ marginTop: 12, fontSize: 14, color: muted, lineHeight: 1.55, maxWidth: 640 }}>
            {d.summary}
          </p>
        </div>
        <ConfidenceRing value={d.conf} color={t.color} />
      </header>

      {/* Receipts */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)',
          gap: 8,
        }}
      >
        {d.receipts.map((r, i) => (
          <Receipt key={i} r={r} />
        ))}
      </div>

      {/* Chart + side effects */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? '1fr' : '1.4fr 1fr',
          gap: 16,
          flex: 1,
          minHeight: 0,
        }}
      >
        <ChartWithTooltip
          title={`${d.primary_metric} · 28 jours`}
          subtitle={`${d.primary_value} · ${d.primary_delta}`}
          series={series}
          tone={t.color}
        />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minHeight: 0 }}>
          <div>
            <h3
              style={{
                margin: 0,
                fontFamily: 'var(--font-mono)',
                fontSize: 11,
                letterSpacing: '.18em',
                textTransform: 'uppercase',
                color: muted,
                fontWeight: 600,
              }}
            >
              Squad · {d.squad.length} agents
            </h3>
            <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
              {d.squad.map((id) => (
                <AgentChip key={id} id={id} />
              ))}
            </div>
          </div>
          <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
            <h3
              style={{
                margin: 0,
                fontFamily: 'var(--font-mono)',
                fontSize: 11,
                letterSpacing: '.18em',
                textTransform: 'uppercase',
                color: muted,
                fontWeight: 600,
              }}
            >
              Si tu confirmes
            </h3>
            <ul
              style={{
                margin: '6px 0 0',
                padding: 0,
                listStyle: 'none',
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
              }}
            >
              {d.side_effects.map((s, i) => (
                <li
                  key={i}
                  style={{
                    display: 'flex',
                    gap: 8,
                    padding: '6px 10px',
                    borderRadius: 6,
                    background: surface2,
                    border: `1px solid ${line}`,
                    fontSize: 12.5,
                    color: text,
                  }}
                >
                  <span style={{ color: t.color, flexShrink: 0 }}>→</span>
                  <span>{s}</span>
                </li>
              ))}
            </ul>
          </div>
          <p style={{ margin: 0, fontSize: 12, color: muted2, lineHeight: 1.45 }}>
            <strong style={{ color: text }}>Next:</strong> {d.next}
          </p>
        </div>
      </div>

      {/* Actions */}
      <footer style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button
          disabled={confirmed}
          onClick={onConfirm}
          style={{
            flex: 1,
            padding: '12px 16px',
            borderRadius: 10,
            background: confirmed ? surface2 : t.color,
            color: confirmed ? muted : '#0b0d12',
            border: 'none',
            cursor: confirmed ? 'default' : 'pointer',
            fontFamily: 'var(--font-display)',
            fontWeight: 800,
            fontSize: 14,
            letterSpacing: '.02em',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 10,
          }}
        >
          <span>{confirmed ? '✓' : t.glyph}</span>
          {confirmed ? 'Confirmed' : `Confirm · ${t.label}`}
          {!confirmed && <Kbd>↵</Kbd>}
        </button>
        <button
          style={{
            padding: '12px 16px',
            borderRadius: 10,
            background: surface2,
            color: text,
            border: `1px solid ${line2}`,
            cursor: 'pointer',
            fontFamily: 'var(--font-mono)',
            fontWeight: 600,
            fontSize: 12,
            letterSpacing: '.14em',
            textTransform: 'uppercase',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          Override <Kbd>S</Kbd>
          <Kbd>P</Kbd>
          <Kbd>C</Kbd>
          <Kbd>X</Kbd>
        </button>
        <button
          style={{
            padding: '12px 16px',
            borderRadius: 10,
            background: 'transparent',
            color: muted,
            border: `1px solid ${line2}`,
            cursor: 'pointer',
            fontFamily: 'var(--font-mono)',
            fontWeight: 600,
            fontSize: 12,
            letterSpacing: '.14em',
            textTransform: 'uppercase',
          }}
        >
          Defer 24h
        </button>
      </footer>
    </article>
  )
}

/* Up-next queue */
function UpNext({
  queue,
  selectedIdx,
  onSelect,
  confirmedIds,
}: {
  queue: DecisionItem[]
  selectedIdx: number
  onSelect: (i: number) => void
  confirmedIds: string[]
}) {
  const isMobile = useIsMobile()
  if (!queue.length) return null
  return (
    <section
      style={{
        background: surface,
        border: `1px solid ${line}`,
        borderRadius: 16,
        padding: 16,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        minHeight: 0,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <h3
          style={{
            margin: 0,
            fontFamily: 'var(--font-display)',
            fontSize: 14,
            fontWeight: 700,
            letterSpacing: '-.01em',
            color: text,
          }}
        >
          Up next · {Math.max(0, queue.length - 1)} décisions en attente
        </h3>
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 10.5,
            color: muted2,
            letterSpacing: '.14em',
            textTransform: 'uppercase',
          }}
        >
          <Kbd>J</Kbd> <Kbd>K</Kbd> pour naviguer
        </span>
      </div>
      <div
        style={{
          flex: 1,
          display: 'grid',
          gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)',
          gap: 10,
          minHeight: 0,
        }}
      >
        {queue.slice(1, 4).map((d, i) => {
          const actualIdx = i + 1
          const t = actionTokens(d.action)
          const spark: number[] = []
          const confirmed = confirmedIds.includes(d.id)
          const active = selectedIdx === actualIdx
          return (
            <button
              key={d.id}
              onClick={() => onSelect(actualIdx)}
              style={{
                textAlign: 'left',
                padding: 12,
                borderRadius: 10,
                background: active ? surface2 : bg,
                border: active ? `1.5px solid ${t.color}` : `1px solid ${line}`,
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
                position: 'relative',
                overflow: 'hidden',
                minWidth: 0,
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  left: 0,
                  top: 0,
                  bottom: 0,
                  width: 3,
                  background: t.color,
                }}
              />
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 8,
                }}
              >
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 5,
                    padding: '3px 8px',
                    borderRadius: 4,
                    background: t.color + '1f',
                    color: t.color,
                    fontFamily: 'var(--font-mono)',
                    fontSize: 10,
                    letterSpacing: '.18em',
                    fontWeight: 800,
                  }}
                >
                  <span>{t.glyph}</span> {t.label}
                </span>
                <span
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 11,
                    color: text,
                    fontWeight: 700,
                  }}
                >
                  {d.conf}%
                </span>
              </div>
              <div
                style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: 15,
                  fontWeight: 700,
                  letterSpacing: '-.01em',
                  color: text,
                }}
              >
                {d.venture}
              </div>
              <p
                style={{
                  margin: 0,
                  fontSize: 12,
                  color: muted,
                  lineHeight: 1.45,
                  overflow: 'hidden',
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical' as const,
                }}
              >
                {d.summary}
              </p>
              <svg
                viewBox="0 0 100 24"
                preserveAspectRatio="none"
                style={{ width: '100%', height: 22, marginTop: 'auto' }}
              >
                {spark.length > 0 ? (
                  <path
                    d={sparkPath(spark, 100, 24, 1)}
                    fill="none"
                    stroke={t.color}
                    strokeWidth="1.2"
                    opacity={confirmed ? 0.4 : 1}
                  />
                ) : (
                  <text
                    x="4"
                    y="16"
                    fill={muted}
                    fontSize="7"
                    fontFamily="var(--font-mono)"
                    letterSpacing="0.08em"
                  >
                    Tendance indisponible
                  </text>
                )}
              </svg>
              {confirmed && (
                <span
                  style={{
                    position: 'absolute',
                    right: 10,
                    top: 10,
                    fontFamily: 'var(--font-mono)',
                    fontSize: 9.5,
                    padding: '2px 6px',
                    borderRadius: 3,
                    background: emerald + '22',
                    color: emerald,
                    letterSpacing: '.14em',
                    fontWeight: 700,
                  }}
                >
                  ✓ DONE
                </span>
              )}
            </button>
          )
        })}
      </div>
    </section>
  )
}

/* Today's rhythm */
function TodayRhythm() {
  return (
    <section
      style={{
        background: surface,
        border: `1px solid ${line}`,
        borderRadius: 14,
        padding: 14,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <h3
          style={{
            margin: 0,
            fontFamily: 'var(--font-display)',
            fontSize: 13,
            fontWeight: 700,
            letterSpacing: '-.01em',
            color: text,
          }}
        >
          Today&apos;s rhythm
        </h3>
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
            color: muted2,
            letterSpacing: '.14em',
            textTransform: 'uppercase',
          }}
        >
          {new Date().toLocaleDateString('fr-FR', {
            weekday: 'short',
            day: 'numeric',
            month: 'short',
          })}
        </span>
      </div>
      <ol style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', gap: 4 }}>
        {RHYTHM.map((r) => {
          const a = agentById(r.agent)
          const status = rhythmStatus(r.hour)
          const isNow = status === 'now'
          const isDone = status === 'done'
          return (
            <li
              key={r.hour}
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                gap: 5,
                alignItems: 'stretch',
              }}
            >
              <div
                style={{
                  height: 6,
                  borderRadius: 3,
                  background: isDone ? text : isNow ? accent : surface2,
                  border: `1px solid ${isNow ? accent : line}`,
                }}
              />
              <div
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 9.5,
                  color: isNow ? accent : isDone ? text : muted2,
                  letterSpacing: '.1em',
                  textAlign: 'center',
                  fontWeight: isNow ? 700 : 500,
                }}
              >
                {r.hour}
              </div>
              <div
                style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: 11,
                  fontWeight: isNow ? 700 : 500,
                  color: isNow ? text : muted,
                  textAlign: 'center',
                  lineHeight: 1.25,
                }}
              >
                {a?.name}
              </div>
              {isNow && (
                <div
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 9,
                    color: accent,
                    letterSpacing: '.14em',
                    textTransform: 'uppercase',
                    textAlign: 'center',
                    fontWeight: 700,
                  }}
                >
                  ● now
                </div>
              )}
            </li>
          )
        })}
      </ol>
    </section>
  )
}

/* KPI grid */
function KpiGrid({ kpi }: { kpi: KpiRow | null }) {
  const kpis = [
    {
      label: 'Studio MRR',
      value: kpi ? kpi.revenue : '—',
      delta: kpi ? kpi.revenue_delta : 'loading…',
      tone: 'good',
    },
    {
      label: 'Conv. rate',
      value: kpi ? kpi.conversion : '—',
      delta: kpi ? kpi.conversion_delta : '—',
      tone: 'good',
    },
    { label: 'CTR', value: kpi ? kpi.ctr : '—', delta: kpi ? kpi.ctr_delta : '—', tone: 'good' },
    {
      label: 'Rétention',
      value: kpi ? kpi.retention : '—',
      delta: kpi ? kpi.retention_delta : '—',
      tone: 'muted',
    },
  ]
  return (
    <section
      style={{ background: surface, border: `1px solid ${line}`, borderRadius: 14, padding: 14 }}
    >
      <div style={{ marginBottom: 10 }}>
        <h3
          style={{
            margin: 0,
            fontFamily: 'var(--font-display)',
            fontSize: 13,
            fontWeight: 700,
            letterSpacing: '-.01em',
            color: text,
          }}
        >
          KPIs · 30j
        </h3>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        {kpis.map((k) => (
          <div
            key={k.label}
            style={{
              padding: '10px 12px',
              borderRadius: 8,
              background: surface2,
              border: `1px solid ${line}`,
            }}
          >
            <div
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 10,
                letterSpacing: '.14em',
                textTransform: 'uppercase',
                color: muted,
              }}
            >
              {k.label}
            </div>
            <div
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 22,
                fontWeight: 800,
                letterSpacing: '-.02em',
                color: text,
                marginTop: 4,
              }}
            >
              {k.value}
            </div>
            <div
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 11,
                color: k.tone === 'good' ? emerald : muted2,
                letterSpacing: '.06em',
              }}
            >
              {k.delta}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

function formatEuro(value: number) {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: value % 1 === 0 ? 0 : 2,
  }).format(value)
}

function RevenueFirstStrip({ snapshot }: { snapshot: RevenueLoopSnapshotPayload | null }) {
  const summary = snapshot?.summary
  const action = summary?.recommendedAction
  return (
    <section
      style={{
        background: surface,
        border: `1px solid ${summary?.blockedRevenueEur ? `${accent}66` : line}`,
        borderRadius: 14,
        padding: 14,
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          gap: 10,
        }}
      >
        <h3
          style={{
            margin: 0,
            fontFamily: 'var(--font-display)',
            fontSize: 13,
            color: text,
          }}
        >
          Revenue first
        </h3>
        <a
          href="/studio/revenue"
          style={{
            color: accent,
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
            letterSpacing: '.12em',
            textTransform: 'uppercase',
            textDecoration: 'none',
          }}
        >
          Ouvrir
        </a>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 10 }}>
        <div
          style={{
            padding: 10,
            borderRadius: 8,
            border: `1px solid ${line}`,
            background: surface2,
          }}
        >
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 9.5,
              color: muted,
              textTransform: 'uppercase',
            }}
          >
            Revenu prouvé
          </div>
          <div
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 22,
              fontWeight: 800,
              color: emerald,
              marginTop: 4,
            }}
          >
            {formatEuro(summary?.revenueEur ?? 0)}
          </div>
        </div>
        <div
          style={{
            padding: 10,
            borderRadius: 8,
            border: `1px solid ${line}`,
            background: surface2,
          }}
        >
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 9.5,
              color: muted,
              textTransform: 'uppercase',
            }}
          >
            Argent bloqué
          </div>
          <div
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 22,
              fontWeight: 800,
              color: summary?.blockedRevenueEur ? amber : emerald,
              marginTop: 4,
            }}
          >
            {formatEuro(summary?.blockedRevenueEur ?? 0)}
          </div>
        </div>
      </div>
      <a
        href="/studio/revenue"
        style={{
          display: 'block',
          marginTop: 10,
          textDecoration: 'none',
          padding: '9px 10px',
          borderRadius: 8,
          border: `1px solid ${action ? `${accent}44` : line}`,
          background: action ? `${accent}12` : surface2,
          color: text,
        }}
      >
        <div
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 9.5,
            color: action ? accent : muted2,
            letterSpacing: '.12em',
            textTransform: 'uppercase',
            fontWeight: 800,
          }}
        >
          {action ? `Priorité score ${action.priorityScore}` : 'Aucune priorité'}
        </div>
        <div style={{ marginTop: 4, fontSize: 11.5, color: muted, lineHeight: 1.45 }}>
          {action
            ? `${action.ventureName} · ${action.reason}`
            : 'Aucune boucle revenue active à débloquer.'}
        </div>
      </a>
    </section>
  )
}

function CashFocusPanel({ snapshot }: { snapshot: RevenueLoopSnapshotPayload | null }) {
  const summary = snapshot?.summary
  const action = summary?.recommendedAction
  const cards = [
    {
      label: 'Leads à traiter',
      value: String(summary?.pendingApprovals ?? 0),
      tone: (summary?.pendingApprovals ?? 0) > 0 ? amber : muted2,
      href: '/studio/prospects',
    },
    {
      label: 'Checkouts prêts',
      value: String(summary?.readyCheckouts ?? 0),
      tone: (summary?.readyCheckouts ?? 0) > 0 ? emerald : muted2,
      href: '/studio/revenue',
    },
    {
      label: 'Boucles actives',
      value: String(summary?.activeLoops ?? 0),
      tone: (summary?.activeLoops ?? 0) > 0 ? accent : muted2,
      href: '/studio/revenue',
    },
  ]

  return (
    <section
      style={{
        background: surface,
        border: `1px solid ${line}`,
        borderRadius: 14,
        padding: 16,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          gap: 12,
        }}
      >
        <div>
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 10,
              letterSpacing: '.18em',
              color: muted,
              textTransform: 'uppercase',
            }}
          >
            Revenue focus
          </div>
          <h3
            style={{
              margin: '6px 0 0',
              fontFamily: 'var(--font-display)',
              fontSize: 18,
              fontWeight: 800,
              letterSpacing: '-.02em',
              color: text,
            }}
          >
            Ce qui rapproche du cash maintenant
          </h3>
        </div>
        <a
          href="/studio/revenue"
          style={{
            color: accent,
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
            letterSpacing: '.14em',
            textTransform: 'uppercase',
            textDecoration: 'none',
            whiteSpace: 'nowrap',
          }}
        >
          Revenue loop
        </a>
      </div>

      <div
        style={{
          padding: '12px 14px',
          borderRadius: 10,
          border: `1px solid ${action ? `${accent}44` : line}`,
          background: action ? `${accent}12` : surface2,
        }}
      >
        <div
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
            color: action ? accent : muted2,
            letterSpacing: '.14em',
            textTransform: 'uppercase',
            fontWeight: 800,
          }}
        >
          {action ? 'Action prioritaire' : 'Aucune priorité revenue'}
        </div>
        <div
          style={{
            marginTop: 6,
            fontSize: 13,
            fontWeight: 700,
            color: text,
          }}
        >
          {action ? action.ventureName : 'Choisir une offre et un canal principal'}
        </div>
        <div style={{ marginTop: 4, fontSize: 12, color: muted, lineHeight: 1.5 }}>
          {action
            ? `${action.reason} · potentiel bloqué ${formatEuro(action.blockedRevenueEur)}`
            : 'Le cockpit doit te pousser vers une seule boucle commerciale active.'}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
        {cards.map((card) => (
          <a
            key={card.label}
            href={card.href}
            style={{
              textDecoration: 'none',
              padding: '12px 12px 10px',
              borderRadius: 10,
              border: `1px solid ${line}`,
              background: surface2,
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
            }}
          >
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 9.5,
                color: muted,
                textTransform: 'uppercase',
                letterSpacing: '.12em',
              }}
            >
              {card.label}
            </span>
            <strong
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 24,
                lineHeight: 1,
                color: card.tone,
              }}
            >
              {card.value}
            </strong>
          </a>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {[
          { label: 'Ouvrir Prospects', href: '/studio/prospects', tone: accent, fill: true },
          { label: 'Ouvrir Revenue', href: '/studio/revenue', tone: emerald, fill: false },
          { label: 'Voir Automations', href: '/studio/automations', tone: accent, fill: false },
        ].map((item) => (
          <a
            key={item.label}
            href={item.href}
            style={{
              textDecoration: 'none',
              padding: '9px 12px',
              borderRadius: 999,
              border: `1px solid ${item.fill ? `${item.tone}66` : line2}`,
              background: item.fill ? `${item.tone}22` : surface,
              color: item.fill ? item.tone : text,
              fontSize: 12,
              fontWeight: 700,
            }}
          >
            {item.label}
          </a>
        ))}
      </div>
    </section>
  )
}

function formatSignedNumber(value: number) {
  if (value > 0) return `+${value}`
  return `${value}`
}

function formatSignedEuro(value: number) {
  const rounded = Number(value.toFixed(2))
  if (rounded > 0) return `+${formatEuro(rounded)}`
  if (rounded < 0) return `-${formatEuro(Math.abs(rounded))}`
  return formatEuro(0)
}

function CashOutcomePanel({
  outcomes,
  isMobile,
}: {
  outcomes: CashOutcomeSnapshot | null
  isMobile: boolean
}) {
  const cards = [
    {
      label: 'Replies 7j',
      value: outcomes?.last7d.replies ?? 0,
      delta: outcomes ? formatSignedNumber(outcomes.delta7d.replies) : '0',
    },
    {
      label: 'Deals 7j',
      value: outcomes?.last7d.deals ?? 0,
      delta: outcomes ? formatSignedNumber(outcomes.delta7d.deals) : '0',
    },
    {
      label: 'Cash 7j',
      value: formatEuro(outcomes?.last7d.cashEur ?? 0),
      delta: outcomes ? formatSignedEuro(outcomes.delta7d.cashEur) : formatEuro(0),
      href: buildRevenueHref({ focus: 'cash_7d' }),
    },
    {
      label: 'Cash 30j',
      value: formatEuro(outcomes?.last30d.cashEur ?? 0),
      delta: outcomes ? formatSignedEuro(outcomes.delta30d.cashEur) : formatEuro(0),
      href: buildRevenueHref({ focus: 'cash_30d' }),
    },
  ]

  return (
    <section
      style={{
        background: surface,
        border: `1px solid ${line}`,
        borderRadius: 14,
        padding: 16,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}
    >
      <div>
        <div
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
            letterSpacing: '.18em',
            color: muted,
            textTransform: 'uppercase',
          }}
        >
          Cash outcomes
        </div>
        <h3
          style={{
            margin: '6px 0 0',
            fontFamily: 'var(--font-display)',
            fontSize: 18,
            fontWeight: 800,
            letterSpacing: '-.02em',
            color: text,
          }}
        >
          Signal revenu
        </h3>
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? 'repeat(2, minmax(0, 1fr))' : 'repeat(4, minmax(0, 1fr))',
          gap: 10,
        }}
      >
        {cards.map((card) => (
          <div
            key={card.label}
            style={{
              borderRadius: 10,
              border: `1px solid ${line}`,
              background: surface2,
              padding: '12px 12px',
              minWidth: 0,
            }}
          >
            <div
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 9.5,
                letterSpacing: '.12em',
                textTransform: 'uppercase',
                color: muted,
              }}
            >
              {card.label}
            </div>
            <div
              style={{
                marginTop: 8,
                color: text,
                fontSize: 21,
                fontWeight: 800,
                lineHeight: 1,
              }}
            >
              {card.value}
            </div>
            <div
              style={{
                marginTop: 8,
                color: muted2,
                fontFamily: 'var(--font-mono)',
              fontSize: 10,
              letterSpacing: '.08em',
              textTransform: 'uppercase',
            }}
            >
              vs prev {card.delta}
            </div>
            {card.href ? (
              <button
                type="button"
                onClick={() => {
                  window.location.href = card.href as string
                }}
                style={{
                  marginTop: 10,
                  borderRadius: 999,
                  border: `1px solid ${accent}55`,
                  background: `${accent}18`,
                  color: accent,
                  padding: '6px 10px',
                  fontSize: 11,
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Open Revenue
              </button>
            ) : null}
          </div>
        ))}
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? '1fr' : '1.1fr .9fr',
          gap: 10,
        }}
      >
        <div
          style={{
            borderRadius: 10,
            border: `1px solid ${line}`,
            background: surface2,
            padding: '12px 12px',
          }}
        >
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 9.5,
              letterSpacing: '.12em',
              textTransform: 'uppercase',
              color: muted,
            }}
          >
            Rates
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
              gap: 10,
              marginTop: 10,
            }}
          >
            {[
              {
                label: 'Reply 7j',
                value: `${outcomes?.rates.replyRate7d ?? 0}%`,
                href: buildRateDrilldownHref('reply'),
              },
              {
                label: 'Win 7j',
                value: `${outcomes?.rates.winRate7d ?? 0}%`,
                href: buildRateDrilldownHref('win'),
              },
              {
                label: 'Reply 30j',
                value: `${outcomes?.rates.replyRate30d ?? 0}%`,
                href: buildRateDrilldownHref('reply'),
              },
              {
                label: 'Win 30j',
                value: `${outcomes?.rates.winRate30d ?? 0}%`,
                href: buildRateDrilldownHref('win'),
              },
            ].map((item) => (
              <div
                key={item.label}
                style={{
                  border: `1px solid ${line}`,
                  borderRadius: 8,
                  padding: '10px 10px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 10,
                }}
              >
                <div>
                  <div style={{ color: muted2, fontSize: 11 }}>{item.label}</div>
                  <div style={{ marginTop: 4, color: text, fontSize: 18, fontWeight: 700 }}>{item.value}</div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    window.location.href = item.href
                  }}
                  style={{
                    borderRadius: 999,
                    border: `1px solid ${accent}55`,
                    background: `${accent}18`,
                    color: accent,
                    padding: '6px 10px',
                    fontSize: 11,
                    fontWeight: 700,
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                  }}
                >
                  Open
                </button>
              </div>
            ))}
          </div>
        </div>
        <div
          style={{
            borderRadius: 10,
            border: `1px solid ${line}`,
            background: surface2,
            padding: '12px 12px',
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
          }}
        >
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 9.5,
              letterSpacing: '.12em',
              textTransform: 'uppercase',
              color: muted,
            }}
          >
            Blockers
          </div>
          {(outcomes?.blockerActions ?? []).filter((blocker) => blocker.count > 0).length ? (
            (outcomes?.blockerActions ?? [])
              .filter((blocker) => blocker.count > 0)
              .map((blocker) => (
                <div
                  key={blocker.key}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 10,
                    border: `1px solid ${line}`,
                    borderRadius: 8,
                    padding: '10px 10px',
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ color: text, fontSize: 12, fontWeight: 700 }}>{blocker.label}</div>
                    <div style={{ color: muted2, fontSize: 11, marginTop: 4 }}>
                      {blocker.count} blocked · {blocker.source}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      window.location.href = blocker.href
                    }}
                    style={{
                      borderRadius: 999,
                      border: `1px solid ${accent}55`,
                      background: `${accent}18`,
                      color: accent,
                      padding: '6px 10px',
                      fontSize: 11,
                      fontWeight: 700,
                      cursor: 'pointer',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {blocker.ctaLabel}
                  </button>
                </div>
              ))
          ) : (
            <div style={{ color: muted2, fontSize: 11 }}>No active blockers.</div>
          )}
        </div>
      </div>
      <div
        style={{
          borderRadius: 10,
          border: `1px solid ${line}`,
          background: surface2,
          padding: '12px 12px',
        }}
      >
        <div
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 9.5,
            letterSpacing: '.12em',
            textTransform: 'uppercase',
            color: muted,
          }}
        >
          Source mix
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, minmax(0, 1fr))',
            gap: 10,
            marginTop: 10,
          }}
        >
          {(outcomes?.sourceBreakdown ?? []).map((source, index) => (
            <div
              key={source.source}
              style={{
                borderRadius: 8,
                border: `1px solid ${line}`,
                padding: '10px 10px',
                minWidth: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 10,
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div
                  style={{
                    color: text,
                    fontFamily: 'var(--font-mono)',
                    fontSize: 10,
                    letterSpacing: '.12em',
                    textTransform: 'uppercase',
                  }}
                >
                  {source.source}
                </div>
                <div style={{ marginTop: 6, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {index === 0 ? (
                    <span
                      style={{
                        borderRadius: 999,
                        border: `1px solid ${accent}44`,
                        background: `${accent}14`,
                        color: accent,
                        padding: '3px 7px',
                        fontSize: 10,
                        fontWeight: 700,
                      }}
                    >
                      Top source
                    </span>
                  ) : null}
                  <span style={{ color: muted2, fontSize: 11 }}>{source.qualityScore}/100 quality</span>
                  {index === 0 ? (
                    <span style={{ color: emerald, fontSize: 11, fontWeight: 700 }}>{source.playbookHint}</span>
                  ) : null}
                </div>
                <div style={{ marginTop: 8, display: 'flex', gap: 10, flexWrap: 'wrap', color: muted2, fontSize: 11 }}>
                  <span>{source.active} active</span>
                  <span>{source.replied} replies</span>
                  <span>{source.won} won</span>
                  <span>{source.replyRate}% reply</span>
                  <span>{source.winRate}% win</span>
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>
                {index === 0 ? (
                  <button
                    type="button"
                    onClick={() => {
                      window.location.href = buildSourceFocusHref({ source: source.source })
                    }}
                    style={{
                      borderRadius: 999,
                      border: `1px solid ${emerald}55`,
                      background: `${emerald}18`,
                      color: emerald,
                      padding: '6px 10px',
                      fontSize: 11,
                      fontWeight: 700,
                      cursor: 'pointer',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    Double down
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => {
                    window.location.href = buildProspectHref({ source: source.source })
                  }}
                  style={{
                    borderRadius: 999,
                    border: `1px solid ${accent}55`,
                    background: `${accent}18`,
                    color: accent,
                    padding: '6px 10px',
                    fontSize: 11,
                    fontWeight: 700,
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                  }}
                >
                  Open
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div
        style={{
          borderRadius: 10,
          border: `1px solid ${line}`,
          background: surface2,
          padding: '12px 12px',
        }}
      >
        <div
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 9.5,
            letterSpacing: '.12em',
            textTransform: 'uppercase',
            color: muted,
          }}
        >
          Source x band
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, minmax(0, 1fr))',
            gap: 10,
            marginTop: 10,
          }}
        >
          {(outcomes?.sourceBandBreakdown ?? []).map((item, index) => (
            <div
              key={item.key}
              style={{
                borderRadius: 8,
                border: `1px solid ${line}`,
                padding: '10px 10px',
                minWidth: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 10,
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div
                  style={{
                    color: text,
                    fontFamily: 'var(--font-mono)',
                    fontSize: 10,
                    letterSpacing: '.12em',
                    textTransform: 'uppercase',
                  }}
                >
                  {item.source} · {item.band}
                </div>
                <div style={{ marginTop: 6, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {index === 0 ? (
                    <span
                      style={{
                        borderRadius: 999,
                        border: `1px solid ${accent}44`,
                        background: `${accent}14`,
                        color: accent,
                        padding: '3px 7px',
                        fontSize: 10,
                        fontWeight: 700,
                      }}
                    >
                      Best segment
                    </span>
                  ) : null}
                  <span style={{ color: muted2, fontSize: 11 }}>{item.qualityScore}/100 quality</span>
                  {index === 0 ? (
                    <span style={{ color: emerald, fontSize: 11, fontWeight: 700 }}>{item.playbookHint}</span>
                  ) : null}
                </div>
                <div style={{ marginTop: 8, display: 'flex', gap: 10, flexWrap: 'wrap', color: muted2, fontSize: 11 }}>
                  <span>{item.active} active</span>
                  <span>{item.replied} replies</span>
                  <span>{item.won} won</span>
                  <span>{item.replyRate}% reply</span>
                  <span>{item.winRate}% win</span>
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>
                {index === 0 ? (
                  <button
                    type="button"
                    onClick={() => {
                      window.location.href = buildSegmentPushHref({ source: item.source, band: item.band })
                    }}
                    style={{
                      borderRadius: 999,
                      border: `1px solid ${emerald}55`,
                      background: `${emerald}18`,
                      color: emerald,
                      padding: '6px 10px',
                      fontSize: 11,
                      fontWeight: 700,
                      cursor: 'pointer',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    Push more
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => {
                    window.location.href = buildProspectHref({ source: item.source, band: item.band })
                  }}
                  style={{
                    borderRadius: 999,
                    border: `1px solid ${accent}55`,
                    background: `${accent}18`,
                    color: accent,
                    padding: '6px 10px',
                    fontSize: 11,
                    fontWeight: 700,
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                  }}
                >
                  Open
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function CashActionQueue({
  actions,
  actionState,
  onRunAction,
}: {
  actions: CashAction[]
  actionState: Record<string, 'idle' | 'running' | 'done' | 'error'>
  onRunAction: (action: CashAction) => void
}) {
  function resolveToneColor(tone: CashAction['tone']) {
    if (tone === 'amber') return amber
    if (tone === 'emerald') return emerald
    if (tone === 'rose') return rose
    return accent
  }

  return (
    <section
      style={{
        background: surface,
        border: `1px solid ${line}`,
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
          justifyContent: 'space-between',
          alignItems: 'baseline',
          gap: 12,
        }}
      >
        <div>
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 10,
              letterSpacing: '.18em',
              color: muted,
              textTransform: 'uppercase',
            }}
          >
            Cash queue
          </div>
          <h3
            style={{
              margin: '6px 0 0',
              fontFamily: 'var(--font-display)',
              fontSize: 18,
              fontWeight: 800,
              letterSpacing: '-.02em',
              color: text,
            }}
          >
            Actions du jour
          </h3>
        </div>
        <a
          href="/studio/prospects"
          style={{
            color: accent,
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
            letterSpacing: '.14em',
            textTransform: 'uppercase',
            textDecoration: 'none',
            whiteSpace: 'nowrap',
          }}
        >
          Prospects
        </a>
      </div>
      {actions.length === 0 ? (
        <div
          style={{
            padding: '12px 14px',
            borderRadius: 10,
            border: `1px solid ${line}`,
            background: surface2,
            fontSize: 12,
            color: muted,
            lineHeight: 1.5,
          }}
        >
          Aucune action cash prioritaire détectée. Utilise `Prospects` pour générer un nouveau lead
          ou `Revenue` pour relancer une boucle existante.
        </div>
      ) : (
        actions.map((action, index) => (
          <div
            key={action.id}
            style={{
              display: 'grid',
              gridTemplateColumns: '28px 1fr auto',
              gap: 12,
              alignItems: 'center',
              padding: '12px 12px',
              borderRadius: 10,
              border: `1px solid ${line}`,
              background: surface2,
              color: text,
            }}
          >
            {(() => {
              const toneColor = resolveToneColor(action.tone)
              const status = actionState[action.id] ?? 'idle'
              const actionLabel = action.intent
                ? status === 'running'
                  ? 'Running...'
                  : action.kind === 'approval'
                    ? 'Approve'
                    : action.kind === 'follow_up'
                      ? 'Mark sent'
                      : action.kind === 'send'
                        ? 'Mark sent'
                        : 'Run'
                : 'Open'
              return (
                <>
                  <span
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 999,
                      display: 'grid',
                      placeItems: 'center',
                      background: `${toneColor}1f`,
                      color: toneColor,
                      fontFamily: 'var(--font-mono)',
                      fontSize: 10,
                      fontWeight: 800,
                    }}
                  >
                    {index + 1}
                  </span>
                  <span style={{ minWidth: 0 }}>
                    <a
                      href={action.href}
                      style={{
                        display: 'block',
                        fontSize: 13,
                        fontWeight: 700,
                        color: text,
                        textDecoration: 'none',
                      }}
                    >
                      {action.label}
                    </a>
                    <span
                      style={{
                        display: 'block',
                        marginTop: 3,
                        fontSize: 11.5,
                        color: muted,
                        lineHeight: 1.45,
                      }}
                    >
                      {action.detail}
                    </span>
                    <span
                      style={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        gap: 8,
                        marginTop: 7,
                        fontFamily: 'var(--font-mono)',
                        fontSize: 9.5,
                        letterSpacing: '.1em',
                        textTransform: 'uppercase',
                        color: muted2,
                      }}
                    >
                      <span>{action.impactLabel}</span>
                      <span>{action.blockedLabel}</span>
                      {action.playbookLabel ? <span style={{ color: emerald }}>{action.playbookLabel}</span> : null}
                      {action.boostLabel ? <span style={{ color: toneColor }}>{action.boostLabel}</span> : null}
                    </span>
                  </span>
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'flex-end',
                      gap: 6,
                    }}
                  >
                    <span
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: 9.5,
                        letterSpacing: '.12em',
                        textTransform: 'uppercase',
                        color: toneColor,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {action.badge}
                    </span>
                    <button
                      type="button"
                      disabled={status === 'running'}
                      onClick={() => {
                        if (action.intent) {
                          onRunAction(action)
                          return
                        }
                        window.location.href = action.href
                      }}
                      style={{
                        minHeight: 30,
                        padding: '0 10px',
                        borderRadius: 8,
                        border: `1px solid ${toneColor}35`,
                        background: status === 'running' ? surface : `${toneColor}14`,
                        color: status === 'running' ? muted2 : toneColor,
                        fontFamily: 'var(--font-mono)',
                        fontSize: 9.5,
                        letterSpacing: '.12em',
                        textTransform: 'uppercase',
                        cursor: status === 'running' ? 'wait' : 'pointer',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {actionLabel}
                    </button>
                  </div>
                </>
              )
            })()}
          </div>
        ))
      )}
    </section>
  )
}

function OpsSummaryStrip({
  summary,
  actionState,
  actionMessage,
  onRunAction,
}: {
  summary: OpsSummaryPayload | null
  actionState: Record<string, 'idle' | 'running' | 'done' | 'error'>
  actionMessage: Record<string, string>
  onRunAction: (action: OpsSummaryAction) => void
}) {
  const cards = summary?.cards ?? []

  if (cards.length === 0) {
    return (
      <section
        style={{ background: surface, border: `1px solid ${line}`, borderRadius: 14, padding: 14 }}
      >
        <h3
          style={{
            margin: 0,
            fontFamily: 'var(--font-display)',
            fontSize: 13,
            color: text,
          }}
        >
          Operations
        </h3>
        <p style={{ margin: '10px 0 0', color: muted, fontSize: 12 }}>
          Résumé opérationnel indisponible.
        </p>
      </section>
    )
  }
  const resolvedSummary = summary!

  return (
    <section
      style={{ background: surface, border: `1px solid ${line}`, borderRadius: 14, padding: 14 }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          gap: 10,
        }}
      >
        <h3
          style={{
            margin: 0,
            fontFamily: 'var(--font-display)',
            fontSize: 13,
            color: text,
          }}
        >
          Operations
        </h3>
        <a
          href={resolvedSummary.primaryRepairHref}
          style={{
            color: resolvedSummary.mode === 'attention' ? amber : emerald,
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
            letterSpacing: '.12em',
            textTransform: 'uppercase',
            textDecoration: 'none',
          }}
        >
          {resolvedSummary.mode === 'attention' ? 'Voir action' : 'Calme'}
        </a>
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
          gap: 8,
          marginTop: 10,
        }}
      >
        {cards.map((card) => {
          const color = card.tone === 'warn' ? amber : card.tone === 'ok' ? emerald : muted2
          return (
            <a
              key={card.label}
              href={card.source.repairHref}
              style={{
                textDecoration: 'none',
                padding: 10,
                borderRadius: 8,
                border: `1px solid ${line}`,
                background: surface2,
                color: text,
              }}
            >
              <div
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 9.5,
                  color: muted,
                  letterSpacing: '.12em',
                  textTransform: 'uppercase',
                }}
              >
                {card.label}
              </div>
              <div
                style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: 22,
                  fontWeight: 800,
                  marginTop: 4,
                  color,
                }}
              >
                {card.value}
              </div>
              <div
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 9,
                  color: muted2,
                  marginTop: 4,
                  letterSpacing: '.04em',
                }}
              >
                {card.source.source} · {card.source.freshness}
              </div>
            </a>
          )
        })}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 10 }}>
        {resolvedSummary.actions.slice(0, 3).map((action) => {
          const color = action.tone === 'warn' ? amber : action.tone === 'ok' ? emerald : muted2
          const state = actionState[action.id] ?? 'idle'
          const isExecutable = action.intent?.method === 'POST'
          const statusLabel =
            state === 'running'
              ? 'en cours'
              : state === 'done'
                ? 'fait'
                : state === 'error'
                  ? 'erreur'
                  : isExecutable
                    ? 'executer'
                    : 'ouvrir'
          const commonStyle = {
            display: 'block',
            width: '100%',
            textAlign: 'left' as const,
            textDecoration: 'none',
            padding: '9px 10px',
            borderRadius: 8,
            border: `1px solid ${color}33`,
            background: `${color}10`,
            color: text,
            cursor: state === 'running' ? 'wait' : 'pointer',
          }
          const content = (
            <>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 8,
                }}
              >
                <span
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 9.5,
                    color,
                    letterSpacing: '.12em',
                    textTransform: 'uppercase',
                    fontWeight: 800,
                  }}
                >
                  {action.label}
                </span>
                <span
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 9,
                    color: state === 'error' ? rose : state === 'done' ? emerald : muted2,
                    letterSpacing: '.08em',
                  }}
                >
                  {statusLabel}
                </span>
              </div>
              <div style={{ marginTop: 4, fontSize: 11.5, color: muted, lineHeight: 1.45 }}>
                {actionMessage[action.id] || action.detail}
              </div>
            </>
          )

          if (isExecutable) {
            return (
              <button
                key={action.id}
                type="button"
                disabled={state === 'running'}
                onClick={() => onRunAction(action)}
                style={{
                  ...commonStyle,
                  font: 'inherit',
                }}
              >
                {content}
              </button>
            )
          }

          return (
            <a
              key={action.id}
              href={action.href}
              style={{
                ...commonStyle,
              }}
            >
              {content}
            </a>
          )
        })}
      </div>
    </section>
  )
}

/* ─────────────────────────────────────────────────────────────────
 * Ops Health — agrégat 5 signaux santé opérationnelle
 * Source : /api/studio/ops/health
 * ─────────────────────────────────────────────────────────────── */
function OpsHealthCard({ summary }: { summary: OpsHealthSummaryPayload | null }) {
  if (!summary) {
    return (
      <section
        style={{ background: surface, border: `1px solid ${line}`, borderRadius: 14, padding: 14 }}
      >
        <h3 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 13, color: text }}>
          Ops Health
        </h3>
        <p style={{ margin: '10px 0 0', color: muted, fontSize: 12 }}>
          Chargement des signaux opérationnels…
        </p>
      </section>
    )
  }

  const modeColor = summary.mode === 'attention' ? amber : emerald
  const modeLabel = summary.mode === 'attention' ? 'Attention' : 'Calme'

  return (
    <section
      style={{
        background: surface,
        border: `1px solid ${summary.mode === 'attention' ? `${amber}66` : line}`,
        borderRadius: 14,
        padding: 14,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: 10,
          marginBottom: 10,
        }}
      >
        <h3 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 13, color: text }}>
          Ops Health
        </h3>
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 9.5,
            letterSpacing: '.14em',
            textTransform: 'uppercase',
            color: modeColor,
            fontWeight: 700,
            padding: '2px 7px',
            borderRadius: 3,
            background: `${modeColor}1a`,
            border: `1px solid ${modeColor}30`,
          }}
        >
          ● {modeLabel}
        </span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {summary.signals.map((signal) => {
          const color =
            signal.tone === 'crit'
              ? rose
              : signal.tone === 'warn'
                ? amber
                : signal.tone === 'ok'
                  ? emerald
                  : muted2
          return (
            <a
              key={signal.id}
              href={signal.href}
              title={signal.detail ?? signal.label}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '8px 10px',
                borderRadius: 8,
                background: signal.tone === 'muted' ? 'transparent' : `${color}0d`,
                border: `1px solid ${signal.tone === 'muted' ? line : `${color}26`}`,
                textDecoration: 'none',
                gap: 10,
                minWidth: 0,
              }}
            >
              <span
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 10,
                  letterSpacing: '.08em',
                  textTransform: 'uppercase',
                  color: muted,
                  flexShrink: 0,
                }}
              >
                {signal.label}
              </span>
              <span
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 11,
                  color,
                  fontWeight: 700,
                  textAlign: 'right',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {signal.value}
              </span>
            </a>
          )
        })}
      </div>
    </section>
  )
}

/* Mission feed / log */
function MissionFeedCompact() {
  return (
    <section
      style={{
        background: surface,
        border: `1px solid ${line}`,
        borderRadius: 14,
        padding: 14,
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        minHeight: 0,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <h3
          style={{
            margin: 0,
            fontFamily: 'var(--font-display)',
            fontSize: 13,
            fontWeight: 700,
            color: text,
          }}
        >
          Mission log
        </h3>
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
            letterSpacing: '.14em',
            textTransform: 'uppercase',
            color: muted2,
          }}
        >
          ● en attente
        </span>
      </div>
      <div style={{ flex: 1, display: 'grid', placeItems: 'center' }}>
        <p style={{ fontSize: 12, color: muted2, textAlign: 'center', lineHeight: 1.6 }}>
          Aucune mission en cours
          <br />
          <span style={{ fontSize: 10, color: muted, letterSpacing: '.1em' }}>
            Lancez un agent pour voir les logs
          </span>
        </p>
      </div>
    </section>
  )
}

/* Cold start hero */
function ColdStartHero() {
  const router = useRouter()
  const steps = [
    { id: 1, label: 'Supabase connecté', done: true },
    { id: 2, label: 'Stripe (test mode)', done: true },
    { id: 3, label: 'Decision Agent prêt', done: true },
    {
      id: 4,
      label: 'Ajouter une première venture',
      done: false,
      action: 'Ajouter',
      onClick: () => router.push('/studio/ventures'),
      primary: false,
    },
    {
      id: 5,
      label: 'Configurer n8n cron 4h',
      done: false,
      action: 'Configurer',
      onClick: () => {},
      primary: false,
    },
    {
      id: 6,
      label: 'Lancer le premier sweep',
      done: false,
      action: 'Lancer',
      onClick: () => router.push('/studio/agents'),
      primary: true,
    },
  ]
  const completed = steps.filter((s) => s.done).length
  return (
    <article
      style={{
        background: surface,
        border: `1px solid ${line}`,
        borderRadius: 16,
        padding: 32,
        display: 'flex',
        flexDirection: 'column',
        gap: 20,
        minHeight: 0,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <div
        style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, background: accent }}
      />
      <div>
        <div
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            letterSpacing: '.24em',
            textTransform: 'uppercase',
            color: accent,
            fontWeight: 700,
          }}
        >
          ◆ Jour 1 · setup en cours
        </div>
        <h2
          style={{
            margin: '12px 0 6px',
            fontFamily: 'var(--font-display)',
            fontSize: 36,
            fontWeight: 800,
            letterSpacing: '-.03em',
            color: text,
          }}
        >
          Pas encore de décisions.
        </h2>
        <p style={{ margin: 0, fontSize: 15, color: muted, maxWidth: 600, lineHeight: 1.55 }}>
          Le cockpit est prêt mais les agents n&apos;ont pas encore tourné. Ajoute une venture en
          validation et active Scout — Decision Agent commencera à proposer des arbitrages dès que
          les données arrivent.
        </p>
      </div>
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              letterSpacing: '.14em',
              textTransform: 'uppercase',
              color: muted,
              fontWeight: 700,
            }}
          >
            Setup · {completed}/{steps.length}
          </span>
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              color: accent,
              letterSpacing: '.06em',
              fontWeight: 700,
            }}
          >
            {Math.round((completed / steps.length) * 100)}%
          </span>
        </div>
        <div
          style={{
            height: 6,
            borderRadius: 3,
            background: surface2,
            overflow: 'hidden',
            border: `1px solid ${line}`,
          }}
        >
          <div
            style={{
              width: `${(completed / steps.length) * 100}%`,
              height: '100%',
              background: accent,
            }}
          />
        </div>
      </div>
      <ul
        style={{
          margin: 0,
          padding: 0,
          listStyle: 'none',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
        }}
      >
        {steps.map((s) => (
          <li
            key={s.id}
            style={{
              display: 'grid',
              gridTemplateColumns: 'auto 1fr auto',
              gap: 14,
              alignItems: 'center',
              padding: '12px 14px',
              borderRadius: 10,
              background: s.done ? surface2 : bg,
              border: `1px solid ${s.done ? line : s.primary ? accent : line2}`,
              opacity: s.done ? 0.55 : 1,
            }}
          >
            <span
              style={{
                width: 22,
                height: 22,
                borderRadius: 6,
                background: s.done ? emerald : 'transparent',
                border: s.done ? 'none' : `1.5px dashed ${s.primary ? accent : line2}`,
                display: 'grid',
                placeItems: 'center',
                color: '#0b0d12',
                fontFamily: 'var(--font-display)',
                fontWeight: 800,
                fontSize: 13,
              }}
            >
              {s.done ? '✓' : s.id}
            </span>
            <span style={{ fontSize: 14, color: text, fontWeight: s.primary ? 700 : 500 }}>
              {s.label}
            </span>
            {!s.done && (
              <button
                onClick={s.onClick}
                style={{
                  padding: '7px 12px',
                  borderRadius: 6,
                  background: s.primary ? accent : surface2,
                  color: s.primary ? '#0b0d12' : text,
                  border: s.primary ? 'none' : `1px solid ${line2}`,
                  cursor: 'pointer',
                  fontFamily: 'var(--font-mono)',
                  fontWeight: 700,
                  fontSize: 11,
                  letterSpacing: '.14em',
                  textTransform: 'uppercase',
                }}
              >
                {s.action}
              </button>
            )}
          </li>
        ))}
      </ul>
    </article>
  )
}

/* ⌘K Palette */
function CmdkPalette({ onClose, ventures }: { onClose: () => void; ventures: Venture[] }) {
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const ventureItems = ventures.map((v) => ({
    kind: 'decision',
    label: `${v.score >= 75 ? 'Scale' : v.score >= 50 ? 'Continue' : 'Pivot'} · ${v.name}`,
    hint: `${v.score}% score · ${v.stage}`,
    href: '/studio/ventures',
  }))

  const allItems = [
    ...ventureItems,
    { kind: 'venture', label: 'Ventures', hint: 'kanban + funnel', href: '/studio/ventures' },
    { kind: 'agent', label: 'Agents', hint: 'run · pause · config', href: '/studio/agents' },
    { kind: 'page', label: 'Prospects', hint: 'leads · CRM · outreach', href: '/studio/prospects' },
    {
      kind: 'page',
      label: 'Analytics',
      hint: 'MRR · cohort · attribution',
      href: '/studio/analytics',
    },
    { kind: 'page', label: 'Marketing', hint: 'campagnes · drafts', href: '/studio/marketing' },
    {
      kind: 'page',
      label: 'Infrastructure',
      hint: 'topology · services',
      href: '/studio/infrastructure',
    },
    { kind: 'page', label: 'Automations', hint: 'n8n · webhooks', href: '/studio/automations' },
    { kind: 'page', label: 'Documents', hint: 'storage · uploads', href: '/studio/documents' },
    { kind: 'action', label: 'Déconnexion', hint: 'logout', href: '/login' },
  ]

  const items = useMemo(() => {
    if (!query) return allItems
    const q = query.toLowerCase()
    return allItems.filter(
      (i) => i.label.toLowerCase().includes(q) || i.hint.toLowerCase().includes(q)
    )
  }, [query]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setActive(0)
  }, [query])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setActive((a) => Math.min(items.length - 1, a + 1))
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setActive((a) => Math.max(0, a - 1))
      }
      if (e.key === 'Enter') {
        e.preventDefault()
        const it = items[active]
        if (it) {
          router.push(it.href)
          onClose()
        }
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [items, active, onClose, router])

  const kindStyle: Record<string, { color: string; label: string }> = {
    decision: { color: accent, label: 'Decision' },
    venture: { color: text, label: 'Venture' },
    agent: { color: text, label: 'Agent' },
    page: { color: muted, label: 'Page' },
    action: { color: muted, label: 'Action' },
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(7,9,13,.72)',
        backdropFilter: 'blur(8px)',
        zIndex: 100,
        display: 'grid',
        placeItems: 'start center',
        paddingTop: 140,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 620,
          background: surface,
          border: `1px solid ${line2}`,
          borderRadius: 14,
          boxShadow: '0 24px 80px rgba(0,0,0,.6)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          maxHeight: 520,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '14px 18px',
            borderBottom: `1px solid ${line}`,
          }}
        >
          <svg width="16" height="16" viewBox="0 0 16 16">
            <circle cx="7" cy="7" r="5" fill="none" stroke={muted} strokeWidth="1.5" />
            <line
              x1="11"
              y1="11"
              x2="14"
              y2="14"
              stroke={muted}
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher décisions, ventures, agents, actions…"
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: text,
              fontSize: 15,
              fontFamily: 'var(--font-sans)',
            }}
          />
          <Kbd>esc</Kbd>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: 8 }}>
          {items.length === 0 ? (
            <div style={{ padding: '32px 18px', textAlign: 'center', color: muted, fontSize: 13 }}>
              Aucun résultat.
            </div>
          ) : (
            items.map((it, i) => (
              <button
                key={i}
                onClick={() => {
                  router.push(it.href)
                  onClose()
                }}
                onMouseEnter={() => setActive(i)}
                style={{
                  width: '100%',
                  textAlign: 'left',
                  display: 'grid',
                  gridTemplateColumns: '70px 1fr auto',
                  gap: 12,
                  alignItems: 'center',
                  padding: '10px 12px',
                  borderRadius: 8,
                  background: i === active ? surface2 : 'transparent',
                  border: '1px solid transparent',
                  cursor: 'pointer',
                }}
              >
                <span
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 10,
                    letterSpacing: '.14em',
                    textTransform: 'uppercase',
                    color: (kindStyle[it.kind] || kindStyle.page).color,
                    fontWeight: 700,
                  }}
                >
                  {(kindStyle[it.kind] || kindStyle.page).label}
                </span>
                <span style={{ fontSize: 13.5, color: text }}>{it.label}</span>
                <span
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 11,
                    color: muted2,
                    letterSpacing: '.06em',
                  }}
                >
                  {it.hint}
                </span>
              </button>
            ))
          )}
        </div>
        <div
          style={{
            padding: '10px 18px',
            borderTop: `1px solid ${line}`,
            display: 'flex',
            alignItems: 'center',
            gap: 16,
            fontFamily: 'var(--font-mono)',
            fontSize: 10.5,
            color: muted2,
            letterSpacing: '.06em',
          }}
        >
          <span>
            <Kbd>↑</Kbd>
            <Kbd>↓</Kbd> nav
          </span>
          <span>
            <Kbd>↵</Kbd> ouvrir
          </span>
          <span>
            <Kbd>esc</Kbd> fermer
          </span>
          <span style={{ marginLeft: 'auto' }}>{items.length} résultats</span>
        </div>
      </div>
    </div>
  )
}

/* Footer keyboard hints */
function CkFooter({ state }: { state: string }) {
  return (
    <footer
      style={{
        padding: '12px 24px',
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        borderTop: `1px solid ${line}`,
        fontFamily: 'var(--font-mono)',
        fontSize: 11,
        color: muted,
        letterSpacing: '.06em',
      }}
    >
      <span>
        <Kbd>⌘K</Kbd> command
      </span>
      <span>
        <Kbd>J</Kbd>
        <Kbd>K</Kbd> navigate
      </span>
      <span>
        <Kbd>↵</Kbd> confirm
      </span>
      <span>
        <Kbd>S</Kbd>
        <Kbd>P</Kbd>
        <Kbd>C</Kbd>
        <Kbd>X</Kbd> override
      </span>
      <span>
        <Kbd>T</Kbd> theme
      </span>
      <span style={{ marginLeft: 'auto', color: muted2 }}>
        {state === 'cold' && 'SYS · jour 1 · setup en cours'}
        {state === 'normal' && 'SYS · OK · Supabase live · n8n actif'}
        {state === 'loading' && 'SYS · chargement…'}
      </span>
    </footer>
  )
}

/* ─── Main page ──────────────────────────────────────────────── */
export default function CockpitPage() {
  const { user } = useAuth()
  const supabase = useMemo(() => createSupabaseBrowser(), [])
  const isMobile = useIsMobile()

  const [ventures, setVentures] = useState<Venture[]>([])
  const [kpi, setKpi] = useState<KpiRow | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedIdx, setSelectedIdx] = useState(0)
  const [confirmedIds, setConfirmedIds] = useState<string[]>([])
  const [showCmdk, setShowCmdk] = useState(false)
  const [theme, setTheme] = useState<'dark' | 'light'>('dark')
  const [opsSummary, setOpsSummary] = useState<OpsSummaryPayload | null>(null)
  const [opsHealth, setOpsHealth] = useState<OpsHealthSummaryPayload | null>(null)
  const [revenueSnapshot, setRevenueSnapshot] = useState<RevenueLoopSnapshotPayload | null>(null)
  const [cashOutcomes, setCashOutcomes] = useState<CashOutcomeSnapshot | null>(null)
  const [prospectCash, setProspectCash] = useState<ProspectCashPayload | null>(null)
  const [cashActionState, setCashActionState] = useState<
    Record<string, 'idle' | 'running' | 'done' | 'error'>
  >({})
  const [opsActionState, setOpsActionState] = useState<
    Record<string, 'idle' | 'running' | 'done' | 'error'>
  >({})
  const [opsActionMessage, setOpsActionMessage] = useState<Record<string, string>>({})
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    try {
      setTheme((localStorage.getItem('kenomi-ck-theme') as 'dark' | 'light') || 'dark')
    } catch {}
  }, [])

  const toggleTheme = useCallback(() => {
    setTheme((t) => {
      const next = t === 'dark' ? 'light' : 'dark'
      try {
        localStorage.setItem('kenomi-ck-theme', next)
      } catch {}
      return next
    })
  }, [])

  /* Load data */
  useEffect(() => {
    if (!user) return
    async function load() {
      setLoading(true)
      const [{ data: v }, { data: k }] = await Promise.all([
        supabase
          .from('ventures')
          .select('*')
          .eq('user_id', user!.id)
          .order('score', { ascending: false }),
        supabase
          .from('kpi_snapshots')
          .select('*')
          .eq('user_id', user!.id)
          .eq('period', '30d')
          .limit(1)
          .maybeSingle(),
      ])
      setVentures((v as Venture[]) || [])
      setKpi(k as KpiRow | null)
      setLoading(false)
    }
    load()
  }, [user]) // eslint-disable-line react-hooks/exhaustive-deps

  const loadOpsSummary = useCallback(() => {
    let cancelled = false
    fetch('/api/studio/ops/summary')
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled && data?.ok) setOpsSummary(data.summary as OpsSummaryPayload)
      })
      .catch(() => {
        if (!cancelled) setOpsSummary(null)
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!user) return
    return loadOpsSummary()
  }, [user, loadOpsSummary])

  useEffect(() => {
    if (!user) return
    let cancelled = false
    fetch('/api/studio/ops/health', { cache: 'no-store' })
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled && data?.ok) setOpsHealth(data.summary as OpsHealthSummaryPayload)
      })
      .catch(() => {
        if (!cancelled) setOpsHealth(null)
      })
    return () => {
      cancelled = true
    }
  }, [user])

  const loadRevenueSnapshot = useCallback(() => {
    let cancelled = false
    fetch('/api/studio/revenue/loop', { cache: 'no-store' })
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled && data?.ok) setRevenueSnapshot(data.snapshot as RevenueLoopSnapshotPayload)
      })
      .catch(() => {
        if (!cancelled) setRevenueSnapshot(null)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const loadCashOutcomes = useCallback(() => {
    let cancelled = false
    fetch('/api/studio/revenue/outcomes', { cache: 'no-store' })
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled && data?.ok) setCashOutcomes(data.outcomes as CashOutcomeSnapshot)
      })
      .catch(() => {
        if (!cancelled) setCashOutcomes(null)
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!user) return
    return loadRevenueSnapshot()
  }, [user, loadRevenueSnapshot])

  useEffect(() => {
    if (!user) return
    return loadCashOutcomes()
  }, [user, loadCashOutcomes])

  const loadProspectCash = useCallback(() => {
    let cancelled = false
    fetch('/api/studio/prospects', { cache: 'no-store' })
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled && data?.ok) setProspectCash(data as ProspectCashPayload)
      })
      .catch(() => {
        if (!cancelled) setProspectCash(null)
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!user) return
    return loadProspectCash()
  }, [user, loadProspectCash])

  const runOpsAction = useCallback(
    async (action: OpsSummaryAction) => {
      if (!action.intent || action.intent.method === 'GET') {
        window.location.href = action.href
        return
      }

      if (action.intent.requiresConfirmation) {
        const confirmed = window.confirm(`${action.label}\n\n${action.detail}`)
        if (!confirmed) return
      }

      setOpsActionState((current) => ({ ...current, [action.id]: 'running' }))
      setOpsActionMessage((current) => ({ ...current, [action.id]: '' }))

      try {
        const response = await fetch(action.intent.endpoint, {
          method: action.intent.method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(action.intent.payload),
        })
        const payload = await response.json().catch(() => null)

        setOpsActionState((current) => ({
          ...current,
          [action.id]: response.ok ? 'done' : 'error',
        }))
        setOpsActionMessage((current) => ({
          ...current,
          [action.id]:
            payload?.message ??
            payload?.error ??
            (response.ok ? 'Action terminee.' : 'Action impossible.'),
        }))

        if (response.ok) loadOpsSummary()
      } catch {
        setOpsActionState((current) => ({ ...current, [action.id]: 'error' }))
        setOpsActionMessage((current) => ({
          ...current,
          [action.id]: 'Action impossible depuis le navigateur.',
        }))
      }
    },
    [loadOpsSummary]
  )

  const runCashAction = useCallback(
    async (action: CashAction) => {
      if (!action.intent) {
        window.location.href = action.href
        return
      }

      setCashActionState((current) => ({ ...current, [action.id]: 'running' }))
      try {
        const response = await fetch(action.intent.endpoint, {
          method: action.intent.method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(action.intent.body),
        })
        const payload = await response.json().catch(() => null)
        if (!response.ok) {
          throw new Error(payload?.error ?? 'Cash action failed')
        }
        toast.success(action.intent.successMessage)
        setCashActionState((current) => ({ ...current, [action.id]: 'done' }))
        loadProspectCash()
        loadRevenueSnapshot()
        loadCashOutcomes()
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Cash action failed'
        toast.error(message)
        setCashActionState((current) => ({ ...current, [action.id]: 'error' }))
      }
    },
    [loadCashOutcomes, loadProspectCash, loadRevenueSnapshot]
  )

  /* Keyboard shortcuts */
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setShowCmdk((v) => !v)
        return
      }
      if (showCmdk) {
        return
      }
      if (e.key === 'j') {
        e.preventDefault()
        setSelectedIdx((i) => Math.min(queue.length - 1, i + 1))
      }
      if (e.key === 'k') {
        e.preventDefault()
        setSelectedIdx((i) => Math.max(0, i - 1))
      }
      if (e.key === 'Enter' && current) {
        e.preventDefault()
        setConfirmedIds((ids) => [...new Set([...ids, current.id])])
      }
      if (e.key.toLowerCase() === 't') {
        e.preventDefault()
        toggleTheme()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [showCmdk, ventures, selectedIdx, toggleTheme]) // eslint-disable-line react-hooks/exhaustive-deps

  const queue = ventures.map(ventureToDecision)
  const current = queue[selectedIdx] ?? queue[0]
  const isCold = !loading && ventures.length === 0
  const ckState = loading ? 'loading' : isCold ? 'cold' : 'normal'
  const cashActions = useMemo(
    () =>
      buildCashActions({
        prospects: prospectCash?.prospects ?? [],
        revenueSnapshot,
        segmentFocus: cashOutcomes?.topSegment ?? null,
      }),
    [cashOutcomes, prospectCash, revenueSnapshot]
  )

  const ckVars = theme === 'dark' ? CK_DARK : CK_LIGHT

  return (
    <div
      ref={rootRef}
      style={
        {
          ...ckVars,
          background: bg,
          color: text,
          fontFamily: 'var(--font-sans)',
          minHeight: '100dvh',
          display: 'flex',
          flexDirection: 'column',
        } as React.CSSProperties
      }
    >
      <style>{`
        .ck-btn-focus:focus-visible { outline: 2px solid var(--ck-accent); outline-offset: 2px; }
        @keyframes ck-rise { 0% { transform: translateY(6px); opacity: 0; } 100% { transform: none; opacity: 1; } }
        @keyframes ck-pulse { 0%,100% { opacity: .6; } 50% { opacity: 1; } }
      `}</style>

      <CkHeader theme={theme} onToggleTheme={toggleTheme} onOpenCmdk={() => setShowCmdk(true)} />

      <main
        style={{
          flex: 1,
          display: 'grid',
          gridTemplateColumns: isMobile ? '1fr' : 'minmax(0, 1fr) 380px',
          gap: 16,
          padding: isMobile ? '12px' : '16px 24px',
        }}
      >
        {/* Left column */}
        <div
          style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0, minHeight: 0 }}
        >
          {isMobile && <RevenueFirstStrip snapshot={revenueSnapshot} />}
          <CashFocusPanel snapshot={revenueSnapshot} />
          <CashOutcomePanel outcomes={cashOutcomes} isMobile={isMobile} />
          <CashActionQueue
            actions={cashActions}
            actionState={cashActionState}
            onRunAction={runCashAction}
          />
          {loading && (
            <div
              style={{
                flex: 1,
                display: 'grid',
                placeItems: 'center',
                color: muted,
                fontFamily: 'var(--font-mono)',
                fontSize: 12,
                letterSpacing: '.14em',
              }}
            >
              CHARGEMENT…
            </div>
          )}
          {!loading && isCold && <ColdStartHero />}
          {!loading && !isCold && current && (
            <>
              <DecisionHero
                d={current}
                idx={selectedIdx}
                total={queue.length}
                confirmed={confirmedIds.includes(current.id)}
                onConfirm={() => setConfirmedIds((ids) => [...new Set([...ids, current.id])])}
              />
              <UpNext
                queue={queue}
                selectedIdx={selectedIdx}
                onSelect={setSelectedIdx}
                confirmedIds={confirmedIds}
              />
            </>
          )}
        </div>

        {/* Right rail — en bas sur mobile */}
        {!isMobile && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
            <RevenueFirstStrip snapshot={revenueSnapshot} />
            <OpsHealthCard summary={opsHealth} />
            <TodayRhythm />
            <OpsSummaryStrip
              summary={opsSummary}
              actionState={opsActionState}
              actionMessage={opsActionMessage}
              onRunAction={runOpsAction}
            />
            <KpiGrid kpi={kpi} />
            <MissionFeedCompact />
          </div>
        )}
      </main>

      <CkFooter state={ckState} />

      {showCmdk && <CmdkPalette onClose={() => setShowCmdk(false)} ventures={ventures} />}
    </div>
  )
}
