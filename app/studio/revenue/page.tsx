'use client'

import Link from 'next/link'
import type { CSSProperties } from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Bot,
  Check,
  CreditCard,
  ExternalLink,
  Play,
  RefreshCw,
  ShieldCheck,
  Target,
  TrendingUp,
  X,
  Zap,
} from 'lucide-react'
import { toast } from 'sonner'
import type {
  RevenueLoopItem,
  RevenueLoopNextAction,
  RevenueLoopSnapshot,
  RevenueLoopStageStatus,
} from '@/lib/revenue-loop'
import {
  formatRevenueFocusLabel,
  readRevenueFocusFromSearch,
  type RevenueFocus,
} from '@/lib/studio/revenue-links'
import { shouldEmphasizeRevenueLoopAction, sortRevenueLoopsByFocus } from '@/lib/studio/revenue-focus'
import { buildWeeklyReviewHref } from '@/lib/studio/weekly-review-links'
import type { HermesOperatorView } from '@/lib/studio/hermes-operator-view'

type RevenueAuditEvent = {
  id: string
  event_type: string
  severity: string
  created_at: string
  metadata?: {
    mode?: string
    summary?: {
      revenueEur?: number
      spendEur?: number
      profitEur?: number
      recommendedBudgetEur?: number
      pendingApprovalCount?: number
    }
    stages?: Array<{ key: string; status: string; source?: string }>
  }
}

type RevenueCadenceStatus = {
  status: 'live' | 'stale' | 'missing'
  lastRunAt: string | null
  nextExpectedAt: string | null
  hoursSinceLastRun: number | null
  detail: string
}

type RevenueProofAudit = {
  generatedAt: string
  roiDecision: {
    decision: 'scale' | 'cut' | 'hold'
    reason: string
  }
  facts: {
    payments: number
    completedPayments: number
    checkouts: number
    publishedCampaigns: number
    trackingEvents: number
    pendingApprovals: number
    completedActions: number
  }
  stages: Array<{
    key: string
    label: string
    status: 'done' | 'blocked' | 'waiting'
    detail: string
    source: string
  }>
}

type ConversionBreakdownItem = {
  replyRate: number
  qualifiedRate: number
  closeRate: number
  wonToPaidRate: number
  replyToPaidRate: number
  contacted: number
  replied: number
  qualifiedReplies: number
  meetingsBooked: number
  checkoutsCreated: number
  wonCount: number
  paidCount: number
  paidCashEur: number
}

type RevenueConversionsSnapshot = {
  overview: ConversionBreakdownItem & {
    leadToReplyHours: number
    replyToCloseDays: number
  }
  offerBreakdown: Array<
    ConversionBreakdownItem & {
      offerId: string | null
      offerName: string
      offerVariant: string | null
    }
  >
  angleBreakdown: Array<
    ConversionBreakdownItem & {
      key: string
      offerId: string | null
      offerName: string
      angle: string
    }
  >
  segmentOfferBreakdown: Array<
    ConversionBreakdownItem & {
      key: string
      source: string
      band: string
      offerId: string | null
      offerName: string
    }
  >
  modelBreakdown: Array<
    ConversionBreakdownItem & {
      model: string
      modelFamily: string
    }
  >
  bestOffer: (ConversionBreakdownItem & {
    offerId: string | null
    offerName: string
    offerVariant: string | null
  }) | null
  bestOfferToWin: (ConversionBreakdownItem & {
    offerId: string | null
    offerName: string
    offerVariant: string | null
  }) | null
  bestOfferToCollectCash: (ConversionBreakdownItem & {
    offerId: string | null
    offerName: string
    offerVariant: string | null
  }) | null
  bestAngle: (ConversionBreakdownItem & {
    key: string
    offerId: string | null
    offerName: string
    angle: string
  }) | null
  bestSegmentToReply: (ConversionBreakdownItem & {
    key: string
    source: string
    band: string
    offerId: string | null
    offerName: string
  }) | null
  bestSegmentToPay: (ConversionBreakdownItem & {
    key: string
    source: string
    band: string
    offerId: string | null
    offerName: string
  }) | null
  segmentRepliesNoPay: (ConversionBreakdownItem & {
    key: string
    source: string
    band: string
    offerId: string | null
    offerName: string
  }) | null
  segmentWinsNoCash: (ConversionBreakdownItem & {
    key: string
    source: string
    band: string
    offerId: string | null
    offerName: string
  }) | null
  sourceClosesFastest: (ConversionBreakdownItem & {
    source: string
    leadToReplyHours: number
    replyToCloseDays: number
  }) | null
  sourceCollectsFastest: (ConversionBreakdownItem & {
    source: string
    leadToReplyHours: number
    replyToCloseDays: number
  }) | null
  bestModel: (ConversionBreakdownItem & {
    model: string
    modelFamily: string
  }) | null
  messageFamilyBreakdown: Array<{
    messageFamily: string
    messageKey: string
    contacted: number
    replied: number
    wonCount: number
    paidCount: number
    paidCashEur: number
    replyRate: number
    winRate: number
    paidRate: number
    topObjection: string | null
    objectionCount: number
  }>
  bestMessageFamily: {
    messageFamily: string
    messageKey: string
    contacted: number
    replied: number
    wonCount: number
    paidCount: number
    paidCashEur: number
    replyRate: number
    winRate: number
    paidRate: number
    topObjection: string | null
    objectionCount: number
  } | null
  messageFamilyRepliesNoCash: {
    messageFamily: string
    messageKey: string
    contacted: number
    replied: number
    wonCount: number
    paidCount: number
    paidCashEur: number
    replyRate: number
    winRate: number
    paidRate: number
    topObjection: string | null
    objectionCount: number
  } | null
  messageFamilyWinsNoCash: {
    messageFamily: string
    messageKey: string
    contacted: number
    replied: number
    wonCount: number
    paidCount: number
    paidCashEur: number
    replyRate: number
    winRate: number
    paidRate: number
    topObjection: string | null
    objectionCount: number
  } | null
  messageFamilyTopObjection: {
    messageFamily: string
    messageKey: string
    contacted: number
    replied: number
    wonCount: number
    paidCount: number
    paidCashEur: number
    replyRate: number
    winRate: number
    paidRate: number
    topObjection: string | null
    objectionCount: number
  } | null
  commonObjections: Array<{
    type: string
    count: number
  }>
  lostReasons: Array<{
    type: string
    count: number
  }>
  repeatNext: {
    title: string
    detail: string
  } | null
  stopNext: {
    title: string
    detail: string
  } | null
}

type RevenueAttributionSnapshot = {
  overview: {
    totalRows: number
    paidRows: number
    attributedCashEur: number
    pendingCashEur: number
    exactRows: number
    inferredRows: number
    unknownRows: number
    confidenceRate: number
  }
  offerBreakdown: Array<{
    offerId: string | null
    offerVariant: string | null
    paidCashEur: number
    pendingCashEur: number
    paidRows: number
    totalRows: number
  }>
  segmentBreakdown: Array<{
    key: string
    source: string
    band: string
    paidCashEur: number
    pendingCashEur: number
    paidRows: number
    totalRows: number
  }>
  bestOfferByCash: {
    offerId: string | null
    offerVariant: string | null
    paidCashEur: number
    pendingCashEur: number
    paidRows: number
    totalRows: number
  } | null
  bestSegmentByCash: {
    key: string
    source: string
    band: string
    paidCashEur: number
    pendingCashEur: number
    paidRows: number
    totalRows: number
  } | null
}

type WeeklyRevenueReviewInsight = {
  title: string
  detail: string
  source?: string
  band?: string
}

type WeeklyRevenueReviewSnapshot = {
  window: {
    weekStart: string
    weekEnd: string
    label: string
  }
  bestSource: WeeklyRevenueReviewInsight
  bestSegment: WeeklyRevenueReviewInsight
  bestOffer: WeeklyRevenueReviewInsight
  bestAngle: WeeklyRevenueReviewInsight
  bestMessageFamily: WeeklyRevenueReviewInsight
  topObjection: WeeklyRevenueReviewInsight
  mainLeak: WeeklyRevenueReviewInsight & {
    stageKey: string
  }
  nextExperiment: WeeklyRevenueReviewInsight & {
    focus: string
    source?: string
    band?: string
  }
}

type WeeklyRevenueReviewRecord = {
  id: string
  weekStart: string
  weekEnd: string
  status: string
  createdAt: string
  summary: WeeklyRevenueReviewSnapshot
}

const C = {
  bg: '#07090d',
  panel: '#0e1118',
  panel2: '#121722',
  line: 'rgba(255,255,255,.08)',
  line2: 'rgba(255,255,255,.14)',
  text: '#eef1f6',
  muted: '#929bad',
  muted2: '#687285',
  accent: '#ff6a3d',
  good: '#38d996',
  warn: '#f4b740',
  bad: '#ff5f6d',
  blue: '#6aa7ff',
  purple: '#a785ff',
}

function euro(value: number) {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: value % 1 === 0 ? 0 : 2,
  }).format(value)
}

function conversationLabel(value: string | null | undefined) {
  return value ? value.replaceAll('_', ' ') : 'no truth'
}

function statusColor(status: RevenueLoopStageStatus) {
  if (status === 'done') return C.good
  if (status === 'blocked') return C.bad
  if (status === 'ready') return C.warn
  if (status === 'running') return C.blue
  return C.muted2
}

function actionKind(action: RevenueLoopNextAction) {
  if (action.type === 'run_agent') return action.agentId
  if (action.type === 'create_checkout') return 'checkout'
  if (action.type === 'resolve_approval') return action.actionType
  return action.type
}

function StageRail({ loop }: { loop: RevenueLoopItem }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${loop.stages.length}, minmax(34px, 1fr))`,
        gap: 6,
        alignItems: 'center',
      }}
      aria-label={`Progression ${loop.ventureName}`}
    >
      {loop.stages.map((stage) => (
        <div key={stage.key} style={{ minWidth: 0 }}>
          <div
            title={`${stage.label}: ${stage.status}`}
            style={{
              height: 8,
              borderRadius: 4,
              background: statusColor(stage.status),
              opacity: stage.status === 'idle' ? 0.28 : 0.95,
              boxShadow:
                stage.status === 'done' || stage.status === 'blocked'
                  ? `0 0 18px ${statusColor(stage.status)}33`
                  : 'none',
            }}
          />
          <div
            style={{
              marginTop: 6,
              color: stage.status === 'idle' ? C.muted2 : C.muted,
              fontFamily: 'var(--font-mono)',
              fontSize: 9,
              textTransform: 'uppercase',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {stage.label}
          </div>
        </div>
      ))}
    </div>
  )
}

function Metric({
  label,
  value,
  tone,
  highlighted = false,
}: {
  label: string
  value: string
  tone?: 'good' | 'warn' | 'bad'
  highlighted?: boolean
}) {
  const color =
    tone === 'good' ? C.good : tone === 'warn' ? C.warn : tone === 'bad' ? C.bad : C.text
  return (
    <div
      style={{
        background: C.panel,
        border: `1px solid ${highlighted ? `${C.accent}66` : C.line}`,
        boxShadow: highlighted ? `0 0 0 1px ${C.accent}33 inset` : 'none',
        borderRadius: 8,
        padding: 16,
        minHeight: 90,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
      }}
    >
      <span
        style={{
          color: C.muted,
          fontFamily: 'var(--font-mono)',
          fontSize: 11,
          textTransform: 'uppercase',
        }}
      >
        {label}
      </span>
      <strong style={{ color, fontSize: 28, letterSpacing: 0, lineHeight: 1 }}>{value}</strong>
    </div>
  )
}

function TruthCard({
  label,
  title,
  detail,
  tone = C.text,
  href,
  ctaLabel,
}: {
  label: string
  title: string
  detail: string
  tone?: string
  href?: string
  ctaLabel?: string
}) {
  return (
    <div
      style={{
        background: C.panel,
        border: `1px solid ${C.line}`,
        borderRadius: 8,
        padding: 16,
        display: 'grid',
        gap: 8,
      }}
    >
      <div
        style={{
          color: C.muted,
          fontFamily: 'var(--font-mono)',
          fontSize: 11,
          textTransform: 'uppercase',
        }}
      >
        {label}
      </div>
      <div style={{ color: tone, fontSize: 18, fontWeight: 700, lineHeight: 1.2 }}>{title}</div>
      <div style={{ color: C.muted, fontSize: 13, lineHeight: 1.5 }}>{detail}</div>
      {href ? (
        <Link
          href={href}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: 32,
            width: 'fit-content',
            padding: '0 10px',
            borderRadius: 8,
            border: `1px solid ${C.line2}`,
            background: C.panel2,
            color: C.text,
            textDecoration: 'none',
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
            textTransform: 'uppercase',
            letterSpacing: '.08em',
          }}
        >
          {ctaLabel ?? 'Open'}
        </Link>
      ) : null}
    </div>
  )
}

function formatTruthKey(value: string) {
  return value.replaceAll('_', ' ')
}

export default function RevenuePage() {
  const [snapshot, setSnapshot] = useState<RevenueLoopSnapshot | null>(null)
  const [conversions, setConversions] = useState<RevenueConversionsSnapshot | null>(null)
  const [attribution, setAttribution] = useState<RevenueAttributionSnapshot | null>(null)
  const [operatorView, setOperatorView] = useState<HermesOperatorView | null>(null)
  const [weeklyReview, setWeeklyReview] = useState<WeeklyRevenueReviewSnapshot | null>(null)
  const [lastReview, setLastReview] = useState<WeeklyRevenueReviewRecord | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [autopilotBusy, setAutopilotBusy] = useState(false)
  const [proofBusy, setProofBusy] = useState<string | null>(null)
  const [saveReviewBusy, setSaveReviewBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [cycleAudit, setCycleAudit] = useState<RevenueAuditEvent[]>([])
  const [proofAudit, setProofAudit] = useState<RevenueProofAudit | null>(null)
  const [focus, setFocus] = useState<RevenueFocus | null>(null)
  const [cadence, setCadence] = useState<RevenueCadenceStatus>({
    status: 'missing',
    lastRunAt: null,
    nextExpectedAt: null,
    hoursSinceLastRun: null,
    detail: 'Aucun daily cycle revenue audité.',
  })
  const summaryRef = useRef<HTMLElement | null>(null)
  const recommendationRef = useRef<HTMLElement | null>(null)
  const loopsRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (typeof window === 'undefined') return
    setFocus(readRevenueFocusFromSearch(window.location.search))
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const [loopRes, conversionsRes, attributionRes, insightsRes, operatorRes] = await Promise.all([
      fetch('/api/studio/revenue/loop', { cache: 'no-store' }),
      fetch('/api/studio/revenue/conversions', { cache: 'no-store' }),
      fetch('/api/studio/revenue/attribution', { cache: 'no-store' }),
      fetch('/api/studio/revenue/insights', { cache: 'no-store' }),
      fetch('/api/studio/hermes/operator', { cache: 'no-store' }),
    ])
    const loopJson = await loopRes.json().catch(() => null)
    const conversionsJson = await conversionsRes.json().catch(() => null)
    const attributionJson = await attributionRes.json().catch(() => null)
    const insightsJson = await insightsRes.json().catch(() => null)
    const operatorJson = await operatorRes.json().catch(() => null)
    if (!loopRes.ok || !loopJson?.snapshot) {
      setError(loopJson?.error ?? 'Chargement impossible')
      setLoading(false)
      return
    }
    setSnapshot(loopJson.snapshot)
    setConversions(conversionsRes.ok ? ((conversionsJson?.conversions as RevenueConversionsSnapshot) ?? null) : null)
    setAttribution(attributionRes.ok ? ((attributionJson?.attribution as RevenueAttributionSnapshot) ?? null) : null)
    setOperatorView(operatorRes.ok ? ((operatorJson?.view as HermesOperatorView) ?? null) : null)
    setWeeklyReview(insightsRes.ok ? ((insightsJson?.insights as WeeklyRevenueReviewSnapshot) ?? null) : null)
    setLastReview(insightsRes.ok ? ((insightsJson?.lastReview as WeeklyRevenueReviewRecord | null) ?? null) : null)
    setLoading(false)
  }, [])

  const loadAudit = useCallback(async () => {
    const res = await fetch('/api/studio/revenue/audit', { cache: 'no-store' })
    const json = await res.json().catch(() => null)
    if (res.ok && Array.isArray(json?.events)) {
      setCycleAudit(json.events as RevenueAuditEvent[])
      if (json.cadence) setCadence(json.cadence as RevenueCadenceStatus)
      if (json.proof) setProofAudit(json.proof as RevenueProofAudit)
    }
  }, [])

  useEffect(() => {
    load()
    loadAudit()
  }, [load, loadAudit])

  const loops = useMemo(
    () => sortRevenueLoopsByFocus(snapshot?.loops ?? [], focus),
    [focus, snapshot?.loops]
  )
  const recommendedLoop = useMemo(() => {
    const loopId = snapshot?.summary.recommendedAction?.loopId
    return loopId ? (loops.find((loop) => loop.id === loopId) ?? null) : null
  }, [loops, snapshot?.summary.recommendedAction?.loopId])

  useEffect(() => {
    if (!focus) return
    const target =
      focus === 'ready_checkouts'
        ? loopsRef.current
        : focus === 'blocked'
          ? recommendationRef.current ?? summaryRef.current
          : summaryRef.current
    target?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [focus, recommendedLoop, snapshot])

  async function callAction(loop: RevenueLoopItem, decision?: 'approved' | 'rejected') {
    const action = loop.nextAction
    setBusy(`${loop.id}:${decision ?? action.type}`)
    try {
      let res: Response
      if (action.type === 'run_agent') {
        res = await fetch('/api/studio/agents/run', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            agentId: action.agentId,
            ventureId: action.ventureId ?? undefined,
            prompt: `Continue la revenue loop pour ${loop.ventureName}. Priorité: ${action.label}.`,
          }),
        })
      } else if (action.type === 'create_checkout') {
        if (!loop.publicLandingUrl) throw new Error('Landing publique manquante')
        window.open(loop.publicLandingUrl, '_blank', 'noopener,noreferrer')
        toast.success('Landing publique ouverte')
        return
      } else if (action.type === 'configure_stripe') {
        window.location.href = '/studio/settings'
        return
      } else if (action.type === 'resolve_approval') {
        res = await fetch('/api/studio/autonomy/jobs', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            approvalId: action.approvalId,
            decision: decision ?? 'approved',
          }),
        })
      } else {
        return
      }

      const json = await res.json().catch(() => null)
      if (!res.ok) throw new Error(json?.error ?? 'Action impossible')
      if (json?.checkoutUrl && typeof json.checkoutUrl === 'string') {
        window.location.href = json.checkoutUrl
        return
      }
      toast.success(json?.approvalRequired ? 'Approval checkout créée' : 'Action lancée')
      await Promise.all([load(), loadAudit()])
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Action impossible')
    } finally {
      setBusy(null)
    }
  }

  async function runAutopilot() {
    setAutopilotBusy(true)
    try {
      const res = await fetch('/api/studio/revenue/autopilot', { method: 'POST' })
      const json = await res.json().catch(() => null)
      if (!res.ok) throw new Error(json?.error ?? 'Autopilot impossible')
      const executedCount = Array.isArray(json?.executed) ? json.executed.length : 0
      toast.success(
        executedCount > 0
          ? `Autopilot revenue: ${executedCount} action lancée`
          : 'Autopilot revenue évalué'
      )
      await Promise.all([load(), loadAudit()])
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Autopilot impossible')
    } finally {
      setAutopilotBusy(false)
    }
  }

  async function runProofAction(
    action: 'publish_controlled_campaign' | 'record_controlled_tracking'
  ) {
    setProofBusy(action)
    try {
      const res = await fetch('/api/studio/revenue/proof', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      const json = await res.json().catch(() => null)
      if (!res.ok) throw new Error(json?.error ?? 'Preuve revenue impossible')
      toast.success(
        action === 'publish_controlled_campaign'
          ? 'Campagne mock publiée'
          : 'Tracking revenue injecté'
      )
      await Promise.all([load(), loadAudit()])
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Preuve revenue impossible')
    } finally {
      setProofBusy(null)
    }
  }

  async function saveWeeklyReview() {
    setSaveReviewBusy(true)
    try {
      const res = await fetch('/api/studio/revenue/insights', { method: 'POST' })
      const json = await res.json().catch(() => null)
      if (!res.ok) throw new Error(json?.error ?? 'Weekly review impossible')
      setLastReview((json?.review as WeeklyRevenueReviewRecord) ?? null)
      toast.success('Weekly commercial review saved')
      await load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Weekly review impossible')
    } finally {
      setSaveReviewBusy(false)
    }
  }

  return (
    <main
      style={{
        minHeight: '100vh',
        background: C.bg,
        color: C.text,
        padding: '28px clamp(18px, 4vw, 44px) 72px',
      }}
    >
      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          gap: 16,
          alignItems: 'flex-start',
          marginBottom: 22,
        }}
      >
        <div>
          <p
            style={{
              color: C.accent,
              fontFamily: 'var(--font-mono)',
              fontSize: 12,
              textTransform: 'uppercase',
              margin: '0 0 8px',
            }}
          >
            Revenue Loop
          </p>
          <h1 style={{ fontSize: 34, lineHeight: 1.05, margin: 0, letterSpacing: 0 }}>
            Autonomie agents et revenu vérifiable
          </h1>
          {focus ? (
            <div
              style={{
                marginTop: 12,
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                flexWrap: 'wrap',
              }}
            >
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  borderRadius: 999,
                  border: `1px solid ${C.accent}55`,
                  background: `${C.accent}16`,
                  color: C.accent,
                  padding: '6px 10px',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 11,
                  textTransform: 'uppercase',
                }}
              >
                Focus active · {formatRevenueFocusLabel(focus)}
              </span>
              <button
                type="button"
                onClick={() => {
                  window.location.href = '/studio/revenue'
                }}
                style={buttonStyle('secondary')}
              >
                <X size={15} />
                Clear focus
              </button>
            </div>
          ) : null}
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <button
            onClick={runAutopilot}
            disabled={autopilotBusy}
            style={buttonStyle('primary')}
            title="Lancer la cadence revenue-first"
          >
            <Zap size={15} />
            Autopilot
          </button>
          <button
            onClick={() => runProofAction('publish_controlled_campaign')}
            disabled={Boolean(proofBusy)}
            style={buttonStyle('secondary')}
            title="Publier une campagne mock contrôlée"
          >
            <Target size={15} />
            Campagne mock
          </button>
          <button
            onClick={() => runProofAction('record_controlled_tracking')}
            disabled={Boolean(proofBusy)}
            style={buttonStyle('secondary')}
            title="Injecter page_view, waitlist_signup et campaign_spend"
          >
            <TrendingUp size={15} />
            Tracking test
          </button>
          <button
            onClick={load}
            disabled={loading}
            title="Rafraîchir"
            style={{
              height: 40,
              width: 40,
              display: 'grid',
              placeItems: 'center',
              borderRadius: 8,
              border: `1px solid ${C.line2}`,
              background: C.panel,
              color: C.text,
              cursor: 'pointer',
            }}
          >
            <RefreshCw size={17} />
          </button>
        </div>
      </header>

      {error && (
        <div
          style={{
            border: `1px solid ${C.bad}55`,
            background: `${C.bad}12`,
            color: C.text,
            borderRadius: 8,
            padding: 14,
            marginBottom: 18,
          }}
        >
          {error}
        </div>
      )}

      <section
        ref={summaryRef}
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
          gap: 12,
          marginBottom: 18,
        }}
      >
        <Metric
          label="Revenu prouvé"
          value={euro(snapshot?.summary.revenueEur ?? 0)}
          tone="good"
          highlighted={focus === 'cash_7d' || focus === 'cash_30d'}
        />
        <Metric
          label="Revenu bloqué"
          value={euro(snapshot?.summary.blockedRevenueEur ?? 0)}
          tone={(snapshot?.summary.blockedRevenueEur ?? 0) > 0 ? 'bad' : 'good'}
          highlighted={focus === 'blocked'}
        />
        <Metric label="Boucles actives" value={String(snapshot?.summary.activeLoops ?? 0)} />
        <Metric
          label="Checkouts prêts"
          value={String(snapshot?.summary.readyCheckouts ?? 0)}
          tone="warn"
          highlighted={focus === 'ready_checkouts'}
        />
        <Metric
          label="Approvals"
          value={String(snapshot?.summary.pendingApprovals ?? 0)}
          tone={snapshot?.summary.pendingApprovals ? 'bad' : 'good'}
        />
      </section>

      {operatorView ? (
        <section
          style={{
            marginBottom: 18,
            background: C.panel,
            border: `1px solid ${C.line}`,
            borderRadius: 8,
            padding: 16,
            display: 'grid',
            gap: 10,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <div>
              <div
                style={{
                  color: C.accent,
                  fontFamily: 'var(--font-mono)',
                  fontSize: 11,
                  textTransform: 'uppercase',
                  marginBottom: 6,
                }}
              >
                Hermes Operator
              </div>
              <div style={{ color: C.text, fontSize: 16, fontWeight: 700 }}>
                {operatorView.lastRun?.summary ?? 'No Hermes business summary yet'}
              </div>
            </div>
            <Link
              href="/studio/automations"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                minHeight: 32,
                width: 'fit-content',
                padding: '0 10px',
                borderRadius: 8,
                border: `1px solid ${C.line2}`,
                background: C.panel2,
                color: C.text,
                textDecoration: 'none',
                fontFamily: 'var(--font-mono)',
                fontSize: 10,
                textTransform: 'uppercase',
                letterSpacing: '.08em',
              }}
            >
              Open operator
            </Link>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: 12,
            }}
          >
            <TruthCard
              label="Last operator effect"
              title={`FU ${operatorView.lastRunEffects.followUpScans} · PRO ${operatorView.lastRunEffects.prospectRuns} · OPS ${operatorView.lastRunEffects.devopsRuns}`}
              detail={
                operatorView.lastRun
                  ? 'Accepted side effects from the latest Hermes tick.'
                  : 'No Hermes run has produced operator side effects yet.'
              }
              tone={C.accent}
              href="/studio/automations"
              ctaLabel="Inspect operator"
            />
            <TruthCard
              label="Top recommendation"
              title={operatorView.topRecommendation?.title ?? 'No open recommendation'}
              detail={operatorView.topRecommendation?.detail ?? 'Hermes has not produced an operator recommendation yet.'}
              tone={C.good}
              href="/studio/automations"
              ctaLabel="Open operator"
            />
            <TruthCard
              label="Top alert"
              title={operatorView.topAlert?.headline ?? 'No active alert'}
              detail={operatorView.topAlert?.detail ?? 'No current business alert from Hermes.'}
              tone={operatorView.topAlert ? C.bad : C.muted}
              href="/studio/automations"
              ctaLabel="Review alerts"
            />
          </div>
        </section>
      ) : null}

      {conversions ? (
        <section
          style={{
            marginBottom: 18,
            display: 'grid',
            gap: 12,
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              gap: 12,
              alignItems: 'baseline',
              flexWrap: 'wrap',
            }}
          >
            <div>
              <div
                style={{
                  color: C.accent,
                  fontFamily: 'var(--font-mono)',
                  fontSize: 11,
                  textTransform: 'uppercase',
                  marginBottom: 6,
                }}
              >
                Conversion truth
              </div>
              <div style={{ color: C.muted, fontSize: 13 }}>
                {conversions.overview.contacted} contacted · {conversions.overview.replied} replied ·{' '}
                {conversions.overview.wonCount} won · {conversions.overview.paidCount} paid ·{' '}
                {euro(conversions.overview.paidCashEur)} collected
              </div>
            </div>
            <div style={{ color: C.muted, fontSize: 13 }}>
              lead→reply {conversions.overview.leadToReplyHours}h · reply→cash{' '}
              {conversions.overview.replyToCloseDays}d
            </div>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: 12,
            }}
          >
            <TruthCard
              label="Best offer to collect"
              title={conversions.bestOfferToCollectCash?.offerName ?? 'No paid offer truth yet'}
              detail={
                conversions.bestOfferToCollectCash
                  ? `${euro(conversions.bestOfferToCollectCash.paidCashEur)} collected · ${conversions.bestOfferToCollectCash.paidCount} paid · ${conversions.bestOfferToCollectCash.replyToPaidRate}% reply→paid`
                  : 'Attach paid revenue to prospects to identify the best cash offer.'
              }
              tone={C.good}
            />
            <TruthCard
              label="Best offer to win"
              title={conversions.bestOfferToWin?.offerName ?? 'No won offer truth yet'}
              detail={
                conversions.bestOfferToWin
                  ? `${conversions.bestOfferToWin.wonCount} won · ${conversions.bestOfferToWin.paidCount} paid`
                  : 'Track won prospects even before payment lands.'
              }
              tone={C.blue}
            />
            <TruthCard
              label="Best angle to collect"
              title={
                conversions.bestAngle
                  ? `${conversions.bestAngle.offerName} · ${conversions.bestAngle.angle}`
                  : 'No angle truth yet'
              }
              detail={
                conversions.bestAngle
                  ? `${conversions.bestAngle.paidCount} paid · ${euro(conversions.bestAngle.paidCashEur)} cash`
                  : 'Set outreach angles on prospects to compare positioning.'
              }
              tone={C.purple}
            />
            <TruthCard
              label="Best segment to reply"
              title={
                conversions.bestSegmentToReply
                  ? `${conversions.bestSegmentToReply.source}/${conversions.bestSegmentToReply.band} · ${conversions.bestSegmentToReply.offerName}`
                  : 'No reply segment truth yet'
              }
              detail={
                conversions.bestSegmentToReply
                  ? `${conversions.bestSegmentToReply.replyRate}% reply · ${conversions.bestSegmentToReply.replied} replies`
                  : 'Segments will appear here once outreach is tagged.'
              }
              tone={C.warn}
            />
            <TruthCard
              label="Best segment to pay"
              title={
                conversions.bestSegmentToPay
                  ? `${conversions.bestSegmentToPay.source}/${conversions.bestSegmentToPay.band} · ${conversions.bestSegmentToPay.offerName}`
                  : 'No paid segment truth yet'
              }
              detail={
                conversions.bestSegmentToPay
                  ? `${conversions.bestSegmentToPay.paidCount} paid · ${euro(conversions.bestSegmentToPay.paidCashEur)} cash`
                  : 'Paid segment truth will appear once attributed payments land.'
              }
              tone={C.accent}
            />
            <TruthCard
              label="Replies without cash"
              title={
                conversions.segmentRepliesNoPay
                  ? `${conversions.segmentRepliesNoPay.source}/${conversions.segmentRepliesNoPay.band} · ${conversions.segmentRepliesNoPay.offerName}`
                  : 'No stalled segment yet'
              }
              detail={
                conversions.segmentRepliesNoPay
                  ? `${conversions.segmentRepliesNoPay.replied} replies · ${conversions.segmentRepliesNoPay.paidCount} paid`
                  : 'When replies accumulate without cash, the segment will show here.'
              }
              tone={C.warn}
            />
            <TruthCard
              label="Wins without cash"
              title={
                conversions.segmentWinsNoCash
                  ? `${conversions.segmentWinsNoCash.source}/${conversions.segmentWinsNoCash.band} · ${conversions.segmentWinsNoCash.offerName}`
                  : 'No win without cash yet'
              }
              detail={
                conversions.segmentWinsNoCash
                  ? `${conversions.segmentWinsNoCash.wonCount} won · ${conversions.segmentWinsNoCash.paidCount} paid`
                  : 'Won-but-unpaid segments will surface here.'
              }
              tone={C.bad}
            />
            <TruthCard
              label="Fastest cash source"
              title={
                conversions.sourceCollectsFastest
                  ? conversions.sourceCollectsFastest.source
                  : 'No paid source yet'
              }
              detail={
                conversions.sourceCollectsFastest
                  ? `${conversions.sourceCollectsFastest.replyToCloseDays}d reply→cash · ${conversions.sourceCollectsFastest.paidCount} paid`
                  : 'A source will appear here once at least one payment is attributed.'
              }
              tone={C.accent}
            />
            <TruthCard
              label="Best prospect model"
              title={
                conversions.bestModel
                  ? `${conversions.bestModel.modelFamily} · ${conversions.bestModel.model}`
                  : 'No model truth yet'
              }
              detail={
                conversions.bestModel
                  ? `${conversions.bestModel.paidCount} paid · ${euro(conversions.bestModel.paidCashEur)} cash · ${conversions.bestModel.replyRate}% reply`
                  : 'Prospect runs need model-tagged data before model truth appears.'
              }
              tone={C.blue}
            />
            <TruthCard
              label="Best message family"
              title={conversions.bestMessageFamily?.messageFamily ?? 'No message truth yet'}
              detail={
                conversions.bestMessageFamily
                  ? `${conversions.bestMessageFamily.paidCount} paid · ${euro(conversions.bestMessageFamily.paidCashEur)} cash`
                  : 'Message families will appear once outbound metadata is tagged.'
              }
              tone={C.purple}
            />
            <TruthCard
              label="Replies without cash (message)"
              title={
                conversions.messageFamilyRepliesNoCash?.messageFamily ?? 'No stalled family yet'
              }
              detail={
                conversions.messageFamilyRepliesNoCash
                  ? `${conversions.messageFamilyRepliesNoCash.replied} replies · ${conversions.messageFamilyRepliesNoCash.paidCount} paid`
                  : 'Families that attract replies without cash will surface here.'
              }
              tone={C.warn}
            />
            <TruthCard
              label="Top objection family"
              title={
                conversions.messageFamilyTopObjection
                  ? `${conversions.messageFamilyTopObjection.messageFamily} · ${conversationLabel(conversions.messageFamilyTopObjection.topObjection)}`
                  : 'No message objection truth yet'
              }
              detail={
                conversions.messageFamilyTopObjection
                  ? `${conversions.messageFamilyTopObjection.objectionCount} occurrences`
                  : 'Classified objections will be tied back to message families here.'
              }
              tone={C.bad}
            />
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
              gap: 12,
            }}
          >
            <TruthCard
              label="Repeat this next"
              title={conversions.repeatNext?.title ?? 'No repeat signal yet'}
              detail={
                conversions.repeatNext?.detail ??
                'Once offers and angles have enough volume, the next repetition candidate will appear here.'
              }
              tone={C.good}
            />
            <TruthCard
              label="Stop this next"
              title={conversions.stopNext?.title ?? 'No stop signal yet'}
              detail={
                conversions.stopNext?.detail ??
                'When a segment produces replies without closes, this panel will tell you what to stop pushing.'
              }
              tone={C.bad}
            />
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
              gap: 12,
            }}
          >
            <div
              style={{
                background: C.panel,
                border: `1px solid ${C.line}`,
                borderRadius: 8,
                padding: 16,
                display: 'grid',
                gap: 10,
              }}
            >
              <div
                style={{
                  color: C.muted,
                  fontFamily: 'var(--font-mono)',
                  fontSize: 11,
                  textTransform: 'uppercase',
                }}
              >
                Common objections
              </div>
              {conversions.commonObjections.length ? (
                conversions.commonObjections.map((item) => (
                  <div
                    key={item.type}
                    style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}
                  >
                    <span style={{ color: C.text, fontSize: 14 }}>{formatTruthKey(item.type)}</span>
                    <span style={{ color: C.warn, fontFamily: 'var(--font-mono)', fontSize: 12 }}>
                      {item.count}
                    </span>
                  </div>
                ))
              ) : (
                <div style={{ color: C.muted, fontSize: 13 }}>
                  No objection truth recorded yet.
                </div>
              )}
            </div>

            <div
              style={{
                background: C.panel,
                border: `1px solid ${C.line}`,
                borderRadius: 8,
                padding: 16,
                display: 'grid',
                gap: 10,
              }}
            >
              <div
                style={{
                  color: C.muted,
                  fontFamily: 'var(--font-mono)',
                  fontSize: 11,
                  textTransform: 'uppercase',
                }}
              >
                Lost reasons
              </div>
              {conversions.lostReasons.length ? (
                conversions.lostReasons.map((item) => (
                  <div
                    key={item.type}
                    style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}
                  >
                    <span style={{ color: C.text, fontSize: 14 }}>{formatTruthKey(item.type)}</span>
                    <span style={{ color: C.bad, fontFamily: 'var(--font-mono)', fontSize: 12 }}>
                      {item.count}
                    </span>
                  </div>
                ))
              ) : (
                <div style={{ color: C.muted, fontSize: 13 }}>
                  No lost-reason truth recorded yet.
                </div>
              )}
            </div>
          </div>
        </section>
      ) : null}

      {attribution ? (
        <section
          style={{
            marginBottom: 18,
            display: 'grid',
            gap: 12,
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              gap: 12,
              alignItems: 'baseline',
              flexWrap: 'wrap',
            }}
          >
            <div>
              <div
                style={{
                  color: C.accent,
                  fontFamily: 'var(--font-mono)',
                  fontSize: 11,
                  textTransform: 'uppercase',
                  marginBottom: 6,
                }}
              >
                Cash attribution
              </div>
              <div style={{ color: C.muted, fontSize: 13 }}>
                {attribution.overview.paidRows} paid rows · {attribution.overview.totalRows} tracked rows
              </div>
            </div>
            <div style={{ color: C.muted, fontSize: 13 }}>
              confidence {attribution.overview.confidenceRate}% · pending {euro(attribution.overview.pendingCashEur)}
            </div>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: 12,
            }}
          >
            <TruthCard
              label="Attributed cash"
              title={euro(attribution.overview.attributedCashEur)}
              detail={`${attribution.overview.exactRows} exact · ${attribution.overview.inferredRows} inferred · ${attribution.overview.unknownRows} unknown`}
              tone={C.good}
            />
            <TruthCard
              label="Best paid offer"
              title={
                attribution.bestOfferByCash
                  ? `${attribution.bestOfferByCash.offerId ?? 'Unassigned'} · ${attribution.bestOfferByCash.offerVariant ?? 'default'}`
                  : 'No paid offer yet'
              }
              detail={
                attribution.bestOfferByCash
                  ? `${euro(attribution.bestOfferByCash.paidCashEur)} paid · ${attribution.bestOfferByCash.paidRows} rows`
                  : 'Paid attribution will surface here once cash is linked to offers.'
              }
              tone={C.blue}
            />
            <TruthCard
              label="Best paid segment"
              title={
                attribution.bestSegmentByCash
                  ? `${attribution.bestSegmentByCash.source}/${attribution.bestSegmentByCash.band}`
                  : 'No paid segment yet'
              }
              detail={
                attribution.bestSegmentByCash
                  ? `${euro(attribution.bestSegmentByCash.paidCashEur)} paid · ${attribution.bestSegmentByCash.paidRows} rows`
                  : 'Segment cash truth will appear here once payments are attributed.'
              }
              tone={C.accent}
            />
            <TruthCard
              label="Cash still unattributed"
              title={euro(attribution.overview.pendingCashEur)}
              detail="Pending or weak-confidence cash that still needs cleaner attribution."
              tone={attribution.overview.pendingCashEur > 0 ? C.warn : C.muted}
            />
          </div>
        </section>
      ) : null}

      {weeklyReview ? (
        <section
          style={{
            marginBottom: 18,
            display: 'grid',
            gap: 12,
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              gap: 12,
              alignItems: 'baseline',
              flexWrap: 'wrap',
            }}
          >
            <div>
              <div
                style={{
                  color: C.accent,
                  fontFamily: 'var(--font-mono)',
                  fontSize: 11,
                  textTransform: 'uppercase',
                  marginBottom: 6,
                }}
              >
                Weekly commercial review
              </div>
              <div style={{ color: C.muted, fontSize: 13 }}>
                {weeklyReview.window.label}
                {lastReview ? ` · last saved ${new Date(lastReview.createdAt).toLocaleString('fr-FR')}` : ' · not saved yet'}
              </div>
            </div>
            <button
              type="button"
              onClick={saveWeeklyReview}
              disabled={saveReviewBusy}
              style={buttonStyle('secondary')}
            >
              <Check size={15} />
              Save review
            </button>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: 12,
            }}
          >
            <TruthCard
              label="Best source"
              title={weeklyReview.bestSource.title}
              detail={weeklyReview.bestSource.detail}
              tone={C.good}
              href={buildWeeklyReviewHref('best_source', {
                source: weeklyReview.bestSource.source,
              })}
              ctaLabel="Open source"
            />
            <TruthCard
              label="Best segment"
              title={weeklyReview.bestSegment.title}
              detail={weeklyReview.bestSegment.detail}
              tone={C.blue}
              href={buildWeeklyReviewHref('best_segment', {
                source: weeklyReview.bestSegment.source,
                band: weeklyReview.bestSegment.band,
              })}
              ctaLabel="Open segment"
            />
            <TruthCard
              label="Best offer"
              title={weeklyReview.bestOffer.title}
              detail={weeklyReview.bestOffer.detail}
              tone={C.accent}
              href={buildWeeklyReviewHref('best_offer')}
              ctaLabel="Open revenue"
            />
            <TruthCard
              label="Best angle"
              title={weeklyReview.bestAngle.title}
              detail={weeklyReview.bestAngle.detail}
              tone={C.good}
              href={buildWeeklyReviewHref('best_angle')}
              ctaLabel="Open revenue"
            />
            <TruthCard
              label="Best message family"
              title={weeklyReview.bestMessageFamily.title}
              detail={weeklyReview.bestMessageFamily.detail}
              tone={C.purple}
            />
            <TruthCard
              label="Top objection"
              title={weeklyReview.topObjection.title}
              detail={weeklyReview.topObjection.detail}
              tone={C.warn}
              href={buildWeeklyReviewHref('top_objection')}
              ctaLabel="Inspect replies"
            />
            <TruthCard
              label="Main leak"
              title={weeklyReview.mainLeak.title}
              detail={weeklyReview.mainLeak.detail}
              tone={C.bad}
              href={buildWeeklyReviewHref('main_leak', {
                stageKey: weeklyReview.mainLeak.stageKey,
              })}
              ctaLabel="Open leak"
            />
          </div>

          <div
            style={{
              background: C.panel,
              border: `1px solid ${C.line}`,
              borderRadius: 8,
              padding: 16,
              display: 'grid',
              gap: 8,
            }}
          >
            <div
              style={{
                color: C.muted,
                fontFamily: 'var(--font-mono)',
                fontSize: 11,
                textTransform: 'uppercase',
              }}
            >
              Next commercial experiment
            </div>
            <div style={{ color: C.text, fontSize: 18, fontWeight: 700 }}>
              {weeklyReview.nextExperiment.title}
            </div>
            <div style={{ color: C.muted, fontSize: 13, lineHeight: 1.5 }}>
              {weeklyReview.nextExperiment.detail}
            </div>
            <Link
              href={buildWeeklyReviewHref('next_experiment', {
                focus: weeklyReview.nextExperiment.focus,
                source: weeklyReview.nextExperiment.source,
                band: weeklyReview.nextExperiment.band,
              })}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                minHeight: 32,
                width: 'fit-content',
                padding: '0 10px',
                borderRadius: 8,
                border: `1px solid ${C.line2}`,
                background: C.panel2,
                color: C.text,
                textDecoration: 'none',
                fontFamily: 'var(--font-mono)',
                fontSize: 10,
                textTransform: 'uppercase',
                letterSpacing: '.08em',
              }}
            >
              Act on this
            </Link>
          </div>
        </section>
      ) : null}

      {snapshot?.summary.recommendedAction && recommendedLoop && (
        <section
          ref={recommendationRef}
          style={{
            background: `linear-gradient(135deg, ${C.accent}18, ${C.panel})`,
            border: `1px solid ${focus === 'blocked' ? `${C.accent}` : `${C.accent}66`}`,
            borderRadius: 8,
            padding: 16,
            marginBottom: 18,
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1fr) auto',
            gap: 14,
            alignItems: 'center',
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                color: C.accent,
                fontFamily: 'var(--font-mono)',
                fontSize: 11,
                textTransform: 'uppercase',
                marginBottom: 8,
              }}
            >
              Action revenu #1 · score {snapshot.summary.recommendedAction.priorityScore}
            </div>
            <h2 style={{ margin: 0, fontSize: 20, letterSpacing: 0 }}>
              {snapshot.summary.recommendedAction.ventureName}
            </h2>
            <div style={{ color: C.muted, marginTop: 6, fontSize: 14 }}>
              {snapshot.summary.recommendedAction.reason} ·{' '}
              {euro(snapshot.summary.recommendedAction.blockedRevenueEur)} bloqué
            </div>
          </div>
          <button
            onClick={() => callAction(recommendedLoop)}
            disabled={busy?.startsWith(recommendedLoop.id)}
            style={buttonStyle('primary')}
          >
            <Target size={15} />
            Lancer priorité
          </button>
        </section>
      )}

      <section
        ref={loopsRef}
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 360px), 1fr))',
          gap: 16,
          alignItems: 'start',
        }}
      >
        <div style={{ display: 'grid', gap: 10 }}>
          {loading && !snapshot ? (
            <div style={{ color: C.muted, padding: 18 }}>Chargement...</div>
          ) : loops.length === 0 ? (
            <div
              style={{
                border: `1px solid ${C.line}`,
                background: C.panel,
                borderRadius: 8,
                padding: 18,
                color: C.muted,
              }}
            >
              Aucune boucle revenue active.
            </div>
          ) : (
            loops.map((loop) => {
              const key = `${loop.id}:${loop.nextAction.type}`
              const isBusy = busy?.startsWith(loop.id)
              const emphasizeAction = shouldEmphasizeRevenueLoopAction(loop, focus)
              return (
                <article
                  key={loop.id}
                  style={{
                    background: C.panel,
                    border: `1px solid ${
                      loop.nextAction.type === 'resolve_approval' ? `${C.bad}66` : C.line
                    }`,
                    borderRadius: 8,
                    padding: 16,
                    display: 'grid',
                    gap: 14,
                    boxShadow: emphasizeAction ? `0 0 0 1px ${C.accent}22 inset` : 'none',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      gap: 12,
                      alignItems: 'flex-start',
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <h2 style={{ margin: 0, fontSize: 18, letterSpacing: 0 }}>
                        {loop.ventureName}
                      </h2>
                      <div
                        style={{
                          color: C.muted,
                          fontFamily: 'var(--font-mono)',
                          fontSize: 11,
                          textTransform: 'uppercase',
                          marginTop: 6,
                        }}
                      >
                        {loop.status} · {actionKind(loop.nextAction)}
                      </div>
                      <div
                        style={{
                          color: loop.blockedRevenueEur > 0 ? C.warn : C.muted2,
                          fontSize: 12,
                          marginTop: 6,
                        }}
                      >
                        {loop.priorityReason} · {euro(loop.blockedRevenueEur)} bloqué
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <strong style={{ color: C.good, fontSize: 18 }}>
                        {euro(loop.revenueEur)}
                      </strong>
                      <div style={{ color: C.muted2, fontSize: 12 }}>
                        {loop.paidPayments} paiement{loop.paidPayments > 1 ? 's' : ''}
                      </div>
                    </div>
                  </div>

                  <StageRail loop={loop} />

                  <div
                    style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      justifyContent: 'space-between',
                      gap: 10,
                      alignItems: 'center',
                    }}
                  >
                    <div style={{ color: C.text, fontSize: 14 }}>{loop.nextAction.label}</div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {loop.publicLandingUrl && (
                        <Link
                          href={loop.publicLandingUrl}
                          target="_blank"
                          style={emphasizeAction && focus === 'ready_checkouts' ? primaryLinkButtonStyle() : linkButtonStyle()}
                        >
                          <ExternalLink size={15} /> Landing
                        </Link>
                      )}
                      {loop.checkoutUrl && (
                        <Link
                          href={loop.checkoutUrl}
                          target="_blank"
                          style={{
                            color: C.text,
                            border: `1px solid ${C.line2}`,
                            background: C.panel2,
                            borderRadius: 8,
                            height: 36,
                            padding: '0 12px',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 8,
                            textDecoration: 'none',
                            fontSize: 13,
                          }}
                        >
                          <ExternalLink size={15} /> Checkout
                        </Link>
                      )}
                      {loop.nextAction.type === 'resolve_approval' ? (
                        <>
                          <button
                            onClick={() => callAction(loop, 'rejected')}
                            disabled={isBusy}
                            title="Rejeter"
                            style={buttonStyle('secondary')}
                          >
                            <X size={15} />
                          </button>
                          <button
                            onClick={() => callAction(loop, 'approved')}
                            disabled={isBusy}
                            title="Approuver"
                            style={buttonStyle('primary')}
                          >
                            <ShieldCheck size={15} />
                            Approuver
                          </button>
                        </>
                      ) : loop.nextAction.type === 'review_pipeline' ? (
                        <Link href="/studio/agents" style={linkButtonStyle()}>
                          <Check size={15} /> Ouvrir
                        </Link>
                      ) : loop.nextAction.type === 'configure_stripe' ? (
                        <Link href="/studio/settings" style={linkButtonStyle()}>
                          <CreditCard size={15} /> Settings
                        </Link>
                      ) : loop.nextAction.type === 'create_checkout' && loop.publicLandingUrl ? (
                        <Link
                          href={loop.publicLandingUrl}
                          target="_blank"
                          style={emphasizeAction ? primaryLinkButtonStyle() : linkButtonStyle()}
                        >
                          <ExternalLink size={15} /> Ouvrir landing
                        </Link>
                      ) : loop.nextAction.type === 'monitor' ? (
                        <Link href="/studio/analytics" style={linkButtonStyle()}>
                          <TrendingUp size={15} /> Analytics
                        </Link>
                      ) : (
                        <button
                          onClick={() => callAction(loop)}
                          disabled={isBusy || busy === key}
                          style={emphasizeAction ? buttonStyle('primary') : buttonStyle('secondary')}
                        >
                          {loop.nextAction.type === 'create_checkout' ? (
                            <CreditCard size={15} />
                          ) : loop.nextAction.type === 'run_agent' ? (
                            <Bot size={15} />
                          ) : (
                            <Play size={15} />
                          )}
                          Lancer
                        </button>
                      )}
                    </div>
                  </div>
                </article>
              )
            })
          )}
        </div>

        <aside
          style={{
            background: C.panel,
            border: `1px solid ${C.line}`,
            borderRadius: 8,
            padding: 16,
            display: 'grid',
            gap: 14,
          }}
        >
          <h2 style={{ margin: 0, fontSize: 16, letterSpacing: 0 }}>Attribution revenu</h2>
          {(snapshot?.agentRevenueAttribution ?? []).length === 0 ? (
            <div style={{ color: C.muted, fontSize: 14 }}>Aucun paiement encaissé.</div>
          ) : (
            snapshot!.agentRevenueAttribution.map((item) => (
              <div
                key={item.ventureId}
                style={{
                  borderTop: `1px solid ${C.line}`,
                  paddingTop: 12,
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: 12,
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ color: C.text, fontSize: 14 }}>{item.ventureName}</div>
                  <div style={{ color: C.muted2, fontSize: 12 }}>
                    {item.paidPayments} paiement{item.paidPayments > 1 ? 's' : ''}
                  </div>
                </div>
                <strong style={{ color: C.good }}>{euro(item.revenueEur)}</strong>
              </div>
            ))
          )}
          <div
            style={{ borderTop: `1px solid ${C.line}`, paddingTop: 14, display: 'grid', gap: 10 }}
          >
            <div
              style={{
                border: `1px solid ${
                  cadence?.status === 'live'
                    ? `${C.good}55`
                    : cadence?.status === 'stale'
                      ? `${C.warn}66`
                      : `${C.bad}55`
                }`,
                background: C.panel2,
                borderRadius: 8,
                padding: 12,
                display: 'grid',
                gap: 8,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                <strong
                  style={{
                    color:
                      cadence?.status === 'live'
                        ? C.good
                        : cadence?.status === 'stale'
                          ? C.warn
                          : C.bad,
                  }}
                >
                  Cadence quotidienne
                </strong>
                <span
                  style={{
                    color: C.muted2,
                    fontFamily: 'var(--font-mono)',
                    fontSize: 12,
                    textTransform: 'uppercase',
                  }}
                >
                  {cadence?.status ?? 'missing'}
                </span>
              </div>
              <div style={{ color: C.muted, fontSize: 12 }}>
                {cadence?.detail ?? 'Aucun statut cadence disponible.'}
              </div>
              {cadence?.nextExpectedAt && (
                <div style={{ color: C.muted2, fontSize: 12 }}>
                  prochain attendu{' '}
                  {new Date(cadence.nextExpectedAt).toLocaleString('fr-FR', {
                    day: '2-digit',
                    month: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </div>
              )}
            </div>
            <h2 style={{ margin: 0, fontSize: 16, letterSpacing: 0 }}>Audit complet</h2>
            {!proofAudit ? (
              <div style={{ color: C.muted, fontSize: 14 }}>Audit revenue indisponible.</div>
            ) : (
              <div style={{ display: 'grid', gap: 10 }}>
                <div
                  style={{
                    border: `1px solid ${
                      proofAudit.roiDecision.decision === 'scale'
                        ? `${C.good}55`
                        : proofAudit.roiDecision.decision === 'cut'
                          ? `${C.bad}55`
                          : C.line
                    }`,
                    background: C.panel2,
                    borderRadius: 8,
                    padding: 12,
                    display: 'grid',
                    gap: 8,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                    <strong style={{ color: C.text }}>Décision ROI</strong>
                    <span
                      style={{
                        color:
                          proofAudit.roiDecision.decision === 'scale'
                            ? C.good
                            : proofAudit.roiDecision.decision === 'cut'
                              ? C.bad
                              : C.warn,
                        fontFamily: 'var(--font-mono)',
                        textTransform: 'uppercase',
                        fontSize: 12,
                      }}
                    >
                      {proofAudit.roiDecision.decision}
                    </span>
                  </div>
                  <div style={{ color: C.muted, fontSize: 12 }}>
                    {proofAudit.roiDecision.reason}
                  </div>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
                      gap: 6,
                      color: C.muted2,
                      fontFamily: 'var(--font-mono)',
                      fontSize: 11,
                    }}
                  >
                    <span>pay {proofAudit.facts.completedPayments}</span>
                    <span>chk {proofAudit.facts.checkouts}</span>
                    <span>camp {proofAudit.facts.publishedCampaigns}</span>
                    <span>evt {proofAudit.facts.trackingEvents}</span>
                  </div>
                </div>
                {proofAudit.stages.map((stage) => (
                  <div
                    key={stage.key}
                    style={{
                      border: `1px solid ${
                        stage.status === 'done'
                          ? `${C.good}33`
                          : stage.status === 'blocked'
                            ? `${C.bad}55`
                            : C.line
                      }`,
                      borderRadius: 8,
                      padding: 10,
                      display: 'grid',
                      gap: 5,
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                      <strong style={{ color: C.text, fontSize: 13 }}>{stage.label}</strong>
                      <span
                        style={{
                          color:
                            stage.status === 'done'
                              ? C.good
                              : stage.status === 'blocked'
                                ? C.bad
                                : C.muted2,
                          fontFamily: 'var(--font-mono)',
                          textTransform: 'uppercase',
                          fontSize: 11,
                        }}
                      >
                        {stage.status}
                      </span>
                    </div>
                    <div style={{ color: C.muted, fontSize: 12 }}>{stage.detail}</div>
                    <div style={{ color: C.muted2, fontSize: 11 }}>{stage.source}</div>
                  </div>
                ))}
              </div>
            )}
            <h2 style={{ margin: 0, fontSize: 16, letterSpacing: 0 }}>Audit quotidien</h2>
            {cycleAudit.length === 0 ? (
              <div style={{ color: C.muted, fontSize: 14 }}>Aucun cycle revenue audité.</div>
            ) : (
              cycleAudit.slice(0, 3).map((event) => (
                <div
                  key={event.id}
                  style={{
                    border: `1px solid ${event.severity === 'warn' ? `${C.warn}55` : C.line}`,
                    background: C.panel2,
                    borderRadius: 8,
                    padding: 12,
                    display: 'grid',
                    gap: 8,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                    <strong style={{ color: event.severity === 'warn' ? C.warn : C.good }}>
                      {event.metadata?.mode ?? event.severity}
                    </strong>
                    <span style={{ color: C.muted2, fontSize: 12 }}>
                      {new Date(event.created_at).toLocaleString('fr-FR', {
                        day: '2-digit',
                        month: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                  {event.metadata?.summary && (
                    <div style={{ color: C.muted, fontSize: 12 }}>
                      revenu {euro(event.metadata.summary.revenueEur ?? 0)} · profit{' '}
                      {euro(event.metadata.summary.profitEur ?? 0)} · budget{' '}
                      {euro(event.metadata.summary.recommendedBudgetEur ?? 0)}
                    </div>
                  )}
                  <div style={{ display: 'grid', gap: 5 }}>
                    {(event.metadata?.stages ?? []).slice(0, 8).map((stage) => (
                      <div
                        key={`${event.id}:${stage.key}`}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          gap: 10,
                          color: C.muted,
                          fontSize: 12,
                        }}
                      >
                        <span>{stage.key.replaceAll('_', ' ')}</span>
                        <span
                          style={{
                            color:
                              stage.status === 'done'
                                ? C.good
                                : stage.status === 'blocked'
                                  ? C.bad
                                  : C.muted2,
                            fontFamily: 'var(--font-mono)',
                            textTransform: 'uppercase',
                          }}
                        >
                          {stage.status}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        </aside>
      </section>
    </main>
  )
}

function buttonStyle(tone: 'primary' | 'secondary'): CSSProperties {
  return {
    height: 36,
    padding: tone === 'secondary' ? '0 10px' : '0 13px',
    borderRadius: 8,
    border: `1px solid ${tone === 'primary' ? `${C.accent}88` : C.line2}`,
    background: tone === 'primary' ? C.accent : C.panel2,
    color: tone === 'primary' ? '#120906' : C.text,
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    cursor: 'pointer',
    fontWeight: 700,
    fontSize: 13,
  }
}

function linkButtonStyle(): CSSProperties {
  return {
    ...buttonStyle('secondary'),
    textDecoration: 'none',
  }
}

function primaryLinkButtonStyle(): CSSProperties {
  return {
    ...buttonStyle('primary'),
    textDecoration: 'none',
  }
}
