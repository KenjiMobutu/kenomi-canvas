'use client'

import Link from 'next/link'
import type { CSSProperties } from 'react'
import { useCallback, useEffect, useMemo, useState } from 'react'
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
} from 'lucide-react'
import { toast } from 'sonner'
import type {
  RevenueLoopItem,
  RevenueLoopNextAction,
  RevenueLoopSnapshot,
  RevenueLoopStageStatus,
} from '@/lib/revenue-loop'

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
}

function euro(value: number) {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: value % 1 === 0 ? 0 : 2,
  }).format(value)
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
}: {
  label: string
  value: string
  tone?: 'good' | 'warn' | 'bad'
}) {
  const color =
    tone === 'good' ? C.good : tone === 'warn' ? C.warn : tone === 'bad' ? C.bad : C.text
  return (
    <div
      style={{
        background: C.panel,
        border: `1px solid ${C.line}`,
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

export default function RevenuePage() {
  const [snapshot, setSnapshot] = useState<RevenueLoopSnapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const res = await fetch('/api/studio/revenue/loop', { cache: 'no-store' })
    const json = await res.json().catch(() => null)
    if (!res.ok || !json?.snapshot) {
      setError(json?.error ?? 'Chargement impossible')
      setLoading(false)
      return
    }
    setSnapshot(json.snapshot)
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const loops = useMemo(() => snapshot?.loops ?? [], [snapshot])
  const recommendedLoop = useMemo(() => {
    const loopId = snapshot?.summary.recommendedAction?.loopId
    return loopId ? (loops.find((loop) => loop.id === loopId) ?? null) : null
  }, [loops, snapshot?.summary.recommendedAction?.loopId])

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
        res = await fetch('/api/studio/stripe/checkout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ventureId: action.ventureId }),
        })
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
      toast.success('Action lancée')
      await load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Action impossible')
    } finally {
      setBusy(null)
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
        </div>
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
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
          gap: 12,
          marginBottom: 18,
        }}
      >
        <Metric label="Revenu prouvé" value={euro(snapshot?.summary.revenueEur ?? 0)} tone="good" />
        <Metric
          label="Revenu bloqué"
          value={euro(snapshot?.summary.blockedRevenueEur ?? 0)}
          tone={(snapshot?.summary.blockedRevenueEur ?? 0) > 0 ? 'bad' : 'good'}
        />
        <Metric label="Boucles actives" value={String(snapshot?.summary.activeLoops ?? 0)} />
        <Metric
          label="Checkouts prêts"
          value={String(snapshot?.summary.readyCheckouts ?? 0)}
          tone="warn"
        />
        <Metric
          label="Approvals"
          value={String(snapshot?.summary.pendingApprovals ?? 0)}
          tone={snapshot?.summary.pendingApprovals ? 'bad' : 'good'}
        />
      </section>

      {snapshot?.summary.recommendedAction && recommendedLoop && (
        <section
          style={{
            background: `linear-gradient(135deg, ${C.accent}18, ${C.panel})`,
            border: `1px solid ${C.accent}66`,
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
                      ) : loop.nextAction.type === 'monitor' ? (
                        <Link href="/studio/analytics" style={linkButtonStyle()}>
                          <TrendingUp size={15} /> Analytics
                        </Link>
                      ) : (
                        <button
                          onClick={() => callAction(loop)}
                          disabled={isBusy || busy === key}
                          style={buttonStyle('primary')}
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
