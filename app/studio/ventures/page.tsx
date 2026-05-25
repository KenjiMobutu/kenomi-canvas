'use client'
import { useEffect, useMemo, useState } from 'react'
import { createSupabaseBrowser } from '@/lib/supabase-browser'
import { useAuth } from '@/lib/auth-context'
import { useIsMobile } from '@/lib/studio-utils'
import { toast } from 'sonner'
import { CkShell } from '@/components/CkShell'
import { surface, surface2, line, line2, text, muted, muted2, accent, bg } from '@/lib/ck-vars'
import { agentById, sparkPath, areaPath } from '@/lib/studio-utils'
import { Play } from 'lucide-react'
import { findAvailableSlug } from '@/lib/venture-materializer'
import {
  evaluateVentureCommerceReadiness,
  getNextCommercialRepairAction,
  type CommercialRepairAction,
  type VentureCommerceReadiness,
} from '@/lib/venture-commerce-readiness'
import { useGamification } from '@/lib/use-gamification'

const em = '#34d399',
  am = '#fbbf24',
  ro = '#fb7185',
  cy = '#22d3ee',
  vi = '#a78bfa'

const STAGES = [
  { id: 'ideas', label: 'Ideas', color: cy },
  { id: 'validation', label: 'Validation', color: vi },
  { id: 'build', label: 'Build', color: em },
  { id: 'launch', label: 'Launch', color: am },
  { id: 'scale', label: 'Scale', color: accent },
]

const STATUS_COLOR: Record<string, string> = {
  Scale: 'var(--ck-accent)',
  Continue: '#22d3ee',
  Pivot: '#e879f9',
  Stop: '#fb7185',
}

const STAGE_AGENTS: Record<string, string[]> = {
  ideas: ['scout'],
  validation: ['validation', 'marketing'],
  build: ['builder', 'payment'],
  launch: ['marketing', 'analytics'],
  scale: ['analytics', 'marketing', 'payment', 'decision'],
}

interface Venture {
  id: string
  name: string
  slug?: string | null
  statut?: string | null
  lifecycle_status?: string | null
  niche: string
  stage: string
  score: number
  mrr: string
  cac: string
  conversion: string
  next_action: string
  insight: string
}
interface DV extends Venture {
  mrrNum: number
  cacNum: number
  convNum: number
  status: string
  note: string
  agentIds: string[]
}

function parseNum(s: string | number): number {
  const str = String(s || '0')
  const n = parseFloat(str.replace(/[€$, ]/g, '').replace('%', ''))
  return str.toLowerCase().includes('k') ? n * 1000 : isNaN(n) ? 0 : n
}

function toDisplay(v: Venture): DV {
  const stage = (v.stage || 'ideas').toLowerCase()
  let status = 'Continue'
  if (stage === 'scale') status = 'Scale'
  else if (v.score < 50) status = 'Stop'
  else if (v.score < 60) status = 'Pivot'
  return {
    ...v,
    stage,
    mrrNum: parseNum(v.mrr),
    cacNum: parseNum(v.cac),
    convNum: parseNum(v.conversion),
    status,
    note: v.insight || v.next_action || '',
    agentIds: STAGE_AGENTS[stage] || ['scout'],
  }
}

// ── Sub-components ──────────────────────────────────────────────────────────

function ScoreRing({ value, color }: { value: number; color: string }) {
  const r = 11,
    circ = 2 * Math.PI * r
  return (
    <div style={{ position: 'relative', width: 28, height: 28, flexShrink: 0 }}>
      <svg width="28" height="28" viewBox="0 0 28 28">
        <circle cx="14" cy="14" r={r} fill="none" stroke={line2} strokeWidth="2.5" />
        <circle
          cx="14"
          cy="14"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="2.5"
          strokeDasharray={`${(value / 100) * circ} ${circ}`}
          strokeLinecap="round"
          transform="rotate(-90 14 14)"
        />
      </svg>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'grid',
          placeItems: 'center',
          fontFamily: 'var(--font-mono)',
          fontSize: 9,
          fontWeight: 700,
          color,
        }}
      >
        {value}
      </div>
    </div>
  )
}

function VentureCard({
  v,
  stageColor,
  active,
  onClick,
}: {
  v: DV
  stageColor: string
  active: boolean
  onClick: () => void
}) {
  const sc = STATUS_COLOR[v.status] || cy
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        textAlign: 'left',
        padding: 10,
        borderRadius: 10,
        width: '100%',
        background: active ? surface : bg,
        border: `${active ? 1.5 : 1}px solid ${active ? stageColor : line}`,
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        gap: 7,
        boxShadow: active ? `0 0 0 3px ${stageColor}1c` : 'none',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 6,
        }}
      >
        <span style={{ fontSize: 12.5, fontWeight: 700, lineHeight: 1.2, color: text }}>
          {v.name}
        </span>
        <ScoreRing value={v.score} color={stageColor} />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        {v.agentIds.map((id) => {
          const a = agentById(id)
          return (
            <span
              key={id}
              title={a.name}
              style={{
                width: 16,
                height: 16,
                borderRadius: 4,
                border: `1px solid ${a.color}`,
                background: `${a.color}18`,
                display: 'grid',
                placeItems: 'center',
                fontFamily: 'var(--font-display)',
                fontWeight: 800,
                fontSize: 9,
                color: a.color,
              }}
            >
              {a.sigil}
            </span>
          )
        })}
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 9,
            color: muted2,
            marginLeft: 4,
            letterSpacing: '.1em',
          }}
        >
          {v.agentIds.length} agents
        </span>
      </div>
      {v.mrrNum > 0 && (
        <div style={{ display: 'flex', gap: 8, fontFamily: 'var(--font-mono)', fontSize: 9.5 }}>
          <span style={{ color: em }}>€{v.mrrNum}</span>
          <span style={{ color: muted }}>CAC €{v.cacNum}</span>
          <span style={{ color: cy }}>{v.convNum}%</span>
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 9,
            padding: '2px 6px',
            borderRadius: 3,
            background: `${sc}1f`,
            color: sc,
            letterSpacing: 1,
            fontWeight: 700,
          }}
        >
          {v.status.toUpperCase()}
        </span>
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 9,
            color: muted2,
            letterSpacing: '.1em',
          }}
        >
          {v.note.length > 24 ? v.note.slice(0, 22) + '…' : v.note}
        </span>
      </div>
    </button>
  )
}

function MiniArea({ label, spark, color }: { label: string; spark: number[]; color: string }) {
  if (!spark || spark.length < 2) {
    return (
      <div
        style={{
          padding: 8,
          borderRadius: 8,
          background: surface2,
          border: `1px solid ${line}`,
          color: muted2,
          fontFamily: 'var(--font-mono)',
          fontSize: 9,
          letterSpacing: '.1em',
        }}
      >
        <div>{label}</div>
        <div style={{ marginTop: 4, opacity: 0.8 }}>Historique indisponible.</div>
      </div>
    )
  }
  const uid = label.replace(/\W/g, '')
  return (
    <div style={{ padding: 8, borderRadius: 8, background: surface2, border: `1px solid ${line}` }}>
      <div
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 9,
          color: muted2,
          letterSpacing: '.14em',
          textTransform: 'uppercase',
        }}
      >
        {label}
      </div>
      <svg
        viewBox="0 0 100 30"
        preserveAspectRatio="none"
        style={{ width: '100%', height: 30, marginTop: 4 }}
      >
        <defs>
          <linearGradient id={`ma-${uid}`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity=".5" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={areaPath(spark, 100, 30, 2)} fill={`url(#ma-${uid})`} />
        <path d={sparkPath(spark, 100, 30, 2)} fill="none" stroke={color} strokeWidth="1.4" />
      </svg>
    </div>
  )
}

interface EditForm {
  name: string
  niche: string
  stage: string
  score: string
  mrr: string
  cac: string
  conversion: string
  next_action: string
  insight: string
}

function generateBrief(v: DV): string {
  return [
    `# ${v.name}`,
    `Niche : ${v.niche || '—'}`,
    `Stage : ${v.stage} | Score : ${v.score}/100 | Statut : ${v.status}`,
    `MRR : ${v.mrr || '—'} | CAC : ${v.cac || '—'} | Conversion : ${v.conversion || '—'}`,
    `Prochaine action : ${v.next_action || '—'}`,
    `Insight : ${v.insight || '—'}`,
  ].join('\n')
}

function VentureInspector({
  v,
  repairAction,
  commerceReadiness,
  onSave,
  onDelete,
  onOpen,
  onBrief,
  onRepairAction,
  agentLevels,
}: {
  v: DV | null
  repairAction?: CommercialRepairAction | null
  commerceReadiness?: VentureCommerceReadiness | null
  onSave: (id: string, form: EditForm) => Promise<void>
  onDelete: (id: string) => Promise<void>
  onOpen: () => void
  onBrief: () => void
  onRepairAction?: (action: CommercialRepairAction) => Promise<void>
  agentLevels: Map<string, { level: number; xpBar: number }>
}) {
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [repairRunning, setRepairRunning] = useState(false)
  const [form, setForm] = useState<EditForm>({
    name: '',
    niche: '',
    stage: 'validation',
    score: '',
    mrr: '',
    cac: '',
    conversion: '',
    next_action: '',
    insight: '',
  })
  const [confirmDel, setConfirmDel] = useState(false)

  useEffect(() => {
    if (v) {
      setForm({
        name: v.name,
        niche: v.niche,
        stage: v.stage,
        score: String(v.score),
        mrr: v.mrr,
        cac: v.cac,
        conversion: v.conversion,
        next_action: v.next_action,
        insight: v.insight,
      })
      setEditing(false)
      setConfirmDel(false)
    }
  }, [v?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const stage = v ? STAGES.find((s) => s.id === v.stage) || STAGES[2] : STAGES[2]
  const sparkA: number[] = []
  const sparkB: number[] = []

  if (!v)
    return (
      <div
        style={{
          background: surface,
          border: `1px solid ${line}`,
          borderRadius: 14,
          display: 'grid',
          placeItems: 'center',
          minHeight: 400,
        }}
      >
        <p style={{ fontSize: 13, color: muted2, textAlign: 'center' }}>Sélectionnez une venture</p>
      </div>
    )

  const sc = STATUS_COLOR[v.status] || cy
  const p =
    (field: keyof EditForm) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm((prev) => ({ ...prev, [field]: e.target.value }))

  async function handleSave() {
    if (!v) return
    setSaving(true)
    await onSave(v.id, form)
    setSaving(false)
    setEditing(false)
  }

  async function handleDelete() {
    if (!v) return
    if (!confirmDel) return setConfirmDel(true)
    await onDelete(v.id)
  }

  async function handleRepairAction(action: CommercialRepairAction) {
    if (!onRepairAction || !action.agentId) return
    setRepairRunning(true)
    try {
      await onRepairAction(action)
    } finally {
      setRepairRunning(false)
    }
  }

  const history = [{ day: 0, action: v.status, color: sc, by: 'decision' }]

  return (
    <div
      style={{
        background: surface,
        border: `1px solid ${line}`,
        borderRadius: 14,
        padding: 16,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        borderLeft: `3px solid ${stage.color}`,
        overflowY: 'auto',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 8,
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          {editing ? (
            <input
              className="ck-input"
              value={form.name}
              onChange={p('name')}
              style={{
                width: '100%',
                fontFamily: 'var(--font-display)',
                fontSize: 18,
                fontWeight: 800,
              }}
            />
          ) : (
            <>
              <span
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 10,
                  color: stage.color,
                  letterSpacing: '.14em',
                  textTransform: 'uppercase',
                  fontWeight: 700,
                }}
              >
                {stage.label} · score {v.score}
              </span>
              <div
                style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: 22,
                  fontWeight: 800,
                  letterSpacing: '-.02em',
                  marginTop: 4,
                  color: text,
                }}
              >
                {v.name}
              </div>
              <div style={{ fontSize: 12, color: muted, marginTop: 4 }}>
                {v.insight || v.next_action}
              </div>
            </>
          )}
        </div>
        <button
          onClick={() => setEditing((e) => !e)}
          style={{
            padding: '5px 10px',
            borderRadius: 6,
            border: `1px solid ${line2}`,
            background: editing ? accent + '20' : 'transparent',
            color: editing ? accent : muted,
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
            cursor: 'pointer',
            flexShrink: 0,
          }}
        >
          {editing ? 'Vue' : 'Éditer'}
        </button>
      </div>

      {!editing && repairAction && (
        <div
          style={{
            padding: 12,
            borderRadius: 10,
            background: `${am}12`,
            border: `1px solid ${am}55`,
            display: 'grid',
            gridTemplateColumns: '1fr auto',
            gap: 10,
            alignItems: 'center',
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 9.5,
                color: am,
                letterSpacing: '.14em',
                textTransform: 'uppercase',
                fontWeight: 800,
              }}
            >
              Réparation requise
            </div>
            <div style={{ marginTop: 4, fontSize: 12, color: text, lineHeight: 1.45 }}>
              {repairAction.detail}
            </div>
          </div>
          {repairAction.agentId ? (
            <button
              type="button"
              onClick={() => handleRepairAction(repairAction)}
              disabled={repairRunning}
              style={{
                minHeight: 34,
                padding: '8px 10px',
                borderRadius: 7,
                background: am,
                color: '#0b0d12',
                border: `1px solid ${am}66`,
                fontFamily: 'var(--font-display)',
                fontWeight: 800,
                fontSize: 11,
                whiteSpace: 'nowrap',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                cursor: repairRunning ? 'not-allowed' : 'pointer',
                opacity: repairRunning ? 0.65 : 1,
              }}
            >
              <Play size={12} />
              {repairRunning ? 'Run...' : repairAction.label}
            </button>
          ) : (
            <a
              href={repairAction.href}
              style={{
                padding: '8px 10px',
                borderRadius: 7,
                background: am,
                color: '#0b0d12',
                border: `1px solid ${am}66`,
                fontFamily: 'var(--font-display)',
                fontWeight: 800,
                fontSize: 11,
                textDecoration: 'none',
                whiteSpace: 'nowrap',
              }}
            >
              {repairAction.label}
            </a>
          )}
        </div>
      )}

      {/* Edit fields */}
      {editing && (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            padding: 12,
            borderRadius: 10,
            background: surface2,
            border: `1px solid ${line}`,
          }}
        >
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div>
              <div
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 9,
                  color: muted,
                  letterSpacing: '.14em',
                  textTransform: 'uppercase',
                  marginBottom: 4,
                }}
              >
                Niche
              </div>
              <input
                className="ck-input"
                value={form.niche}
                onChange={p('niche')}
                style={{ width: '100%' }}
              />
            </div>
            <div>
              <div
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 9,
                  color: muted,
                  letterSpacing: '.14em',
                  textTransform: 'uppercase',
                  marginBottom: 4,
                }}
              >
                Stage
              </div>
              <select
                className="ck-select"
                value={form.stage}
                onChange={p('stage')}
                style={{ width: '100%' }}
              >
                {STAGES.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
            {(
              [
                ['Score', 'score'],
                ['MRR', 'mrr'],
                ['CAC', 'cac'],
                ['Conv %', 'conversion'],
              ] as [string, keyof EditForm][]
            ).map(([label, field]) => (
              <div key={field}>
                <div
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 9,
                    color: muted,
                    letterSpacing: '.14em',
                    textTransform: 'uppercase',
                    marginBottom: 4,
                  }}
                >
                  {label}
                </div>
                <input
                  className="ck-input"
                  value={form[field]}
                  onChange={p(field)}
                  style={{ width: '100%' }}
                />
              </div>
            ))}
          </div>
          <div>
            <div
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 9,
                color: muted,
                letterSpacing: '.14em',
                textTransform: 'uppercase',
                marginBottom: 4,
              }}
            >
              Prochaine action
            </div>
            <input
              className="ck-input"
              value={form.next_action}
              onChange={p('next_action')}
              style={{ width: '100%' }}
            />
          </div>
          <div>
            <div
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 9,
                color: muted,
                letterSpacing: '.14em',
                textTransform: 'uppercase',
                marginBottom: 4,
              }}
            >
              Insight
            </div>
            <textarea
              className="ck-input"
              value={form.insight}
              onChange={p('insight')}
              rows={2}
              style={{ width: '100%', resize: 'vertical' }}
            />
          </div>
        </div>
      )}

      {/* Stats */}
      {!editing && (
        <>
          {commerceReadiness && (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(4, 1fr)',
                gap: 8,
              }}
            >
              {[
                ['Slug', commerceReadiness.hasSlug],
                ['Landing', commerceReadiness.hasLanding],
                ['Payment', commerceReadiness.hasPaymentConfig],
                ['Checkout', commerceReadiness.hasCheckout],
              ].map(([label, ok]) => (
                <div
                  key={String(label)}
                  style={{
                    padding: '8px 10px',
                    borderRadius: 8,
                    background: ok ? `${em}10` : `${am}10`,
                    border: `1px solid ${ok ? `${em}44` : `${am}44`}`,
                  }}
                >
                  <div
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: 8.5,
                      color: muted2,
                      letterSpacing: '.14em',
                      textTransform: 'uppercase',
                    }}
                  >
                    {label}
                  </div>
                  <div
                    style={{
                      marginTop: 2,
                      fontFamily: 'var(--font-mono)',
                      fontSize: 10,
                      color: ok ? em : am,
                      fontWeight: 800,
                      letterSpacing: '.12em',
                    }}
                  >
                    {ok ? 'READY' : 'MISSING'}
                  </div>
                </div>
              ))}
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 8 }}>
            {(
              [
                ['MRR', `€${v.mrrNum || 0}`, em],
                ['CAC', v.cacNum ? `€${v.cacNum}` : '—', cy],
                ['Conv.', v.convNum ? `${v.convNum}%` : '—', vi],
                ['Score', String(v.score), stage.color],
              ] as [string, string, string][]
            ).map(([lb, val, col]) => (
              <div
                key={lb}
                style={{
                  padding: '10px 12px',
                  borderRadius: 10,
                  background: surface2,
                  border: `1px solid ${line}`,
                }}
              >
                <div
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 9,
                    color: muted2,
                    letterSpacing: '.14em',
                    textTransform: 'uppercase',
                  }}
                >
                  {lb}
                </div>
                <div
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontSize: 18,
                    fontWeight: 800,
                    color: col,
                    marginTop: 2,
                    letterSpacing: '-.02em',
                  }}
                >
                  {val}
                </div>
              </div>
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <MiniArea label="MRR · 28j" spark={sparkA} color={em} />
            <MiniArea label="Conv · 28j" spark={sparkB} color={cy} />
          </div>

          <div>
            <div
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 10,
                color: muted,
                letterSpacing: '.14em',
                textTransform: 'uppercase',
                marginBottom: 6,
              }}
            >
              Squad assignée
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {v.agentIds.map((id) => {
                const a = agentById(id)
                const stats = agentLevels.get(id)
                return (
                  <div
                    key={id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '5px 8px',
                      borderRadius: 6,
                      background: surface2,
                      border: `1px solid ${line}`,
                    }}
                  >
                    <span
                      style={{
                        width: 22,
                        height: 22,
                        borderRadius: 5,
                        border: `1px solid ${a.color}`,
                        background: `${a.color}12`,
                        display: 'grid',
                        placeItems: 'center',
                        fontFamily: 'var(--font-display)',
                        fontWeight: 800,
                        fontSize: 13,
                        color: a.color,
                      }}
                    >
                      {a.sigil}
                    </span>
                    <span style={{ fontSize: 11.5, fontWeight: 600, flex: 1, color: text }}>
                      {a.name}
                    </span>
                    <span
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: 9,
                        color: a.color,
                        letterSpacing: 1,
                      }}
                    >
                      LV {stats?.level ?? 0}
                    </span>
                    <span
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: 9,
                        color: em,
                        letterSpacing: 1,
                      }}
                    >
                      {Math.round((stats?.xpBar ?? 0) * 100)}%
                    </span>
                  </div>
                )
              })}
            </div>
          </div>

          <div>
            <div
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 10,
                color: muted,
                letterSpacing: '.14em',
                textTransform: 'uppercase',
                marginBottom: 6,
              }}
            >
              Decision timeline
            </div>
            <div style={{ position: 'relative', paddingLeft: 18 }}>
              <div
                style={{
                  position: 'absolute',
                  left: 6,
                  top: 4,
                  bottom: 4,
                  width: 1.5,
                  background: line2,
                }}
              />
              {history.map((h, i) => {
                const a = agentById(h.by)
                return (
                  <div key={i} style={{ position: 'relative', marginBottom: 10 }}>
                    <div
                      style={{
                        position: 'absolute',
                        left: -16,
                        top: 3,
                        width: 10,
                        height: 10,
                        borderRadius: '50%',
                        background: h.color,
                        boxShadow: `0 0 8px ${h.color}`,
                        border: `2px solid ${surface}`,
                      }}
                    />
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'baseline',
                      }}
                    >
                      <div>
                        <span style={{ fontSize: 12, fontWeight: 700, color: text }}>
                          {h.action}
                        </span>
                        <span
                          style={{
                            color: a.color,
                            fontFamily: 'var(--font-mono)',
                            fontSize: 9.5,
                            marginLeft: 6,
                            letterSpacing: 1,
                          }}
                        >
                          · {a.code}
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
                        {h.day === 0 ? 'today' : `t${h.day}j`}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </>
      )}

      {/* Actions */}
      <div style={{ display: 'flex', gap: 6, marginTop: 'auto' }}>
        {editing ? (
          <>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              style={{
                flex: 1,
                padding: '10px 12px',
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
              {saving ? '…' : 'Sauvegarder'}
            </button>
            <button
              type="button"
              onClick={() => {
                setEditing(false)
                setConfirmDel(false)
              }}
              style={{
                padding: '10px 12px',
                borderRadius: 8,
                background: 'transparent',
                color: muted,
                border: `1px solid ${line2}`,
                cursor: 'pointer',
                fontFamily: 'var(--font-mono)',
                fontSize: 10,
              }}
            >
              Annuler
            </button>
            <button
              type="button"
              onClick={handleDelete}
              style={{
                padding: '10px 12px',
                borderRadius: 8,
                border: 'none',
                cursor: 'pointer',
                background: confirmDel ? ro : surface2,
                color: confirmDel ? '#fff' : ro,
                fontFamily: 'var(--font-mono)',
                fontWeight: 700,
                fontSize: 10,
                letterSpacing: '.1em',
                transition: 'all .15s',
              }}
            >
              {confirmDel ? 'Confirmer ?' : '🗑'}
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={() => setEditing(true)}
              style={{
                flex: 1,
                padding: '10px 12px',
                borderRadius: 8,
                background: sc,
                color: '#0b0d12',
                border: 'none',
                fontFamily: 'var(--font-display)',
                fontWeight: 800,
                fontSize: 11.5,
                letterSpacing: '.05em',
                cursor: 'pointer',
              }}
            >
              Confirm · {v.status}
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onOpen()
              }}
              style={{
                padding: '10px 12px',
                borderRadius: 8,
                background: surface2,
                color: text,
                border: `1px solid ${line2}`,
                fontFamily: 'var(--font-mono)',
                fontWeight: 700,
                fontSize: 10,
                letterSpacing: '.14em',
                cursor: 'pointer',
              }}
            >
              OPEN
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onBrief()
              }}
              style={{
                padding: '10px 12px',
                borderRadius: 8,
                background: surface2,
                color: text,
                border: `1px solid ${line2}`,
                fontFamily: 'var(--font-mono)',
                fontWeight: 700,
                fontSize: 10,
                letterSpacing: '.14em',
                cursor: 'pointer',
              }}
            >
              BRIEF
            </button>
          </>
        )}
      </div>
    </div>
  )
}

// ── Page ────────────────────────────────────────────────────────────────────

export default function VenturesPage() {
  const { user } = useAuth()
  const isMobile = useIsMobile()
  const { agentLevels } = useGamification()
  const [items, setItems] = useState<DV[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [commerceReadinessByVenture, setCommerceReadinessByVenture] = useState<
    Map<string, VentureCommerceReadiness>
  >(new Map())
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState({ name: '', niche: '', stage: 'validation', score: '', mrr: '' })
  const agentLevelMap = useMemo(
    () =>
      new Map(
        agentLevels.map((agentLevel) => [
          agentLevel.id,
          { level: agentLevel.level, xpBar: agentLevel.xpBar },
        ])
      ),
    [agentLevels]
  )

  const supabase = createSupabaseBrowser()

  async function refreshCommerceCoverage(ventures: DV[]) {
    const ventureIds = ventures.map((v) => v.id)
    if (ventureIds.length === 0) {
      setCommerceReadinessByVenture(new Map())
      return
    }

    const [landingResult, pipelineResult, paymentResult] = await Promise.all([
      supabase
        .from('landing_pages')
        .select('venture_id, statut, health_status')
        .in('venture_id', ventureIds),
      supabase
        .from('venture_pipeline')
        .select('venture_id, payment_output')
        .eq('user_id', user!.id)
        .in('venture_id', ventureIds),
      supabase
        .from('payments')
        .select('venture_id, checkout_url, provider_status, status')
        .in('venture_id', ventureIds),
    ])

    if (landingResult.error || pipelineResult.error || paymentResult.error) {
      setCommerceReadinessByVenture(new Map())
      return
    }

    const landingPages =
      (landingResult.data as Array<{
        venture_id: string | null
        statut: string | null
        health_status: string | null
      }> | null) ?? []
    const pipelines =
      (pipelineResult.data as Array<{
        venture_id: string | null
        payment_output: string | null
      }> | null) ?? []
    const payments =
      (paymentResult.data as Array<{
        venture_id: string | null
        checkout_url: string | null
        provider_status: string | null
        status: string | null
      }> | null) ?? []

    setCommerceReadinessByVenture(
      new Map(
        ventures.map((venture) => [
          venture.id,
          evaluateVentureCommerceReadiness({
            venture,
            landingPages,
            pipelines,
            payments,
          }),
        ])
      )
    )
  }

  useEffect(() => {
    if (!user) return
    let cancelled = false
    async function load() {
      const { data, error } = await supabase
        .from('ventures')
        .select('*')
        .eq('user_id', user!.id)
        .order('score', { ascending: false })
      if (cancelled) return
      if (error) {
        toast.error(error.message)
        return
      }
      const dvs = ((data as Venture[]) || []).map(toDisplay)
      setItems(dvs)
      await refreshCommerceCoverage(dvs)
      if (!selectedId && dvs.length > 0) setSelectedId(dvs[0].id)
    }
    load()
    return () => {
      cancelled = true
    }
  }, [user]) // eslint-disable-line react-hooks/exhaustive-deps

  async function reload() {
    if (!user) return
    const { data } = await supabase
      .from('ventures')
      .select('*')
      .eq('user_id', user!.id)
      .order('score', { ascending: false })
    const dvs = ((data as Venture[]) || []).map(toDisplay)
    setItems(dvs)
    await refreshCommerceCoverage(dvs)
  }

  async function create(e: React.FormEvent) {
    e.preventDefault()
    if (!user || !form.name.trim()) return
    const slug = await findAvailableSlug(async (candidate) => {
      const { data } = await supabase.from('ventures').select('id').eq('slug', candidate).limit(1)
      return Boolean(data?.length)
    }, form.name.trim())
    const { error } = await supabase.from('ventures').insert({
      user_id: user.id,
      name: form.name.trim(),
      nom: form.name.trim(),
      slug,
      niche: form.niche.trim(),
      stage: form.stage,
      score: parseInt(form.score) || 50,
      mrr: form.mrr.trim() || '0',
      cac: '0',
      conversion: '0',
      next_action: 'Créer landing dédiée',
      insight: 'Venture créée manuellement. Landing et paiement dédiés requis avant scaling.',
      statut: 'actif',
    })
    if (error) return toast.error(error.message)
    setForm({ name: '', niche: '', stage: 'validation', score: '', mrr: '' })
    setAdding(false)
    await reload()
  }

  async function update(id: string, f: EditForm) {
    const { error } = await supabase
      .from('ventures')
      .update({
        name: f.name.trim(),
        niche: f.niche.trim(),
        stage: f.stage,
        score: parseInt(f.score) || 0,
        mrr: f.mrr,
        cac: f.cac,
        conversion: f.conversion,
        next_action: f.next_action,
        insight: f.insight,
      })
      .eq('id', id)
      .eq('user_id', user!.id)
    if (error) {
      toast.error(error.message)
      return
    }
    toast.success('Venture mise à jour')
    await reload()
  }

  async function remove(id: string) {
    const { error } = await supabase.from('ventures').delete().eq('id', id).eq('user_id', user!.id)
    if (error) {
      toast.error(error.message)
      return
    }
    setSelectedId(null)
    toast.success('Venture supprimée')
    await reload()
  }

  async function runRepairAgent(action: CommercialRepairAction) {
    if (!selected || !action.agentId) return
    const res = await fetch('/api/studio/agents/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agentId: action.agentId,
        ventureId: selected.id,
        prompt: `Répare la venture "${selected.name}" : ${action.detail}`,
      }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      toast.error(data.error ?? 'Impossible de lancer la réparation')
      return
    }
    toast.success(`${action.label} lancé (${data.durationMs ?? 0}ms)`)
    await reload()
  }

  const selected = items.find((v) => v.id === selectedId) ?? null
  const selectedReadiness =
    selected && commerceReadinessByVenture.get(selected.id)
      ? commerceReadinessByVenture.get(selected.id)!
      : null
  const selectedRepairAction =
    selected && selectedReadiness
      ? getNextCommercialRepairAction({
          ventureName: selected.name,
          readiness: selectedReadiness,
        })
      : null

  const funnelCounts = STAGES.map((s) => ({
    stage: s,
    count: items.filter((v) => v.stage === s.id).length,
  }))

  const headerActions = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      {[
        { label: `${items.length} ventures`, color: muted2 },
        {
          label: `${[...commerceReadinessByVenture.values()].filter((r) => r.status === 'ready').length} commerce ready`,
          color: em,
        },
        { label: `${items.filter((v) => v.stage === 'scale').length} scaling`, color: em },
        { label: `${items.filter((v) => v.stage === 'validation').length} valid.`, color: cy },
      ].map((pill) => (
        <span
          key={pill.label}
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
            padding: '3px 8px',
            borderRadius: 4,
            border: `1px solid ${line2}`,
            color: pill.color,
            letterSpacing: '.1em',
          }}
        >
          {pill.label}
        </span>
      ))}
      <button
        onClick={() => setAdding((v) => !v)}
        style={{
          padding: '7px 14px',
          borderRadius: 999,
          background: accent,
          color: '#0b0d12',
          border: 'none',
          cursor: 'pointer',
          fontFamily: 'var(--font-display)',
          fontWeight: 800,
          fontSize: 12,
        }}
      >
        + New venture
      </button>
    </div>
  )

  return (
    <CkShell breadcrumb="Studio / Ventures" title="Venture Board" actions={headerActions}>
      {/* Add form */}
      {adding && (
        <form
          onSubmit={create}
          style={{
            display: 'grid',
            gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr .5fr .3fr .3fr auto',
            gap: 8,
            marginBottom: 14,
            background: surface,
            border: `1px solid ${line}`,
            borderRadius: 12,
            padding: 14,
          }}
        >
          <input
            className="ck-input"
            placeholder="Nom"
            value={form.name}
            onChange={(e) => setForm((c) => ({ ...c, name: e.target.value }))}
          />
          <input
            className="ck-input"
            placeholder="Niche"
            value={form.niche}
            onChange={(e) => setForm((c) => ({ ...c, niche: e.target.value }))}
          />
          <select
            className="ck-select"
            value={form.stage}
            onChange={(e) => setForm((c) => ({ ...c, stage: e.target.value }))}
          >
            {STAGES.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
          {!isMobile && (
            <input
              className="ck-input"
              placeholder="Score"
              type="number"
              min="0"
              max="100"
              value={form.score}
              onChange={(e) => setForm((c) => ({ ...c, score: e.target.value }))}
            />
          )}
          {!isMobile && (
            <input
              className="ck-input"
              placeholder="MRR"
              value={form.mrr}
              onChange={(e) => setForm((c) => ({ ...c, mrr: e.target.value }))}
            />
          )}
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              style={{
                padding: '8px 16px',
                borderRadius: 8,
                background: accent,
                color: '#0b0d12',
                border: 'none',
                cursor: 'pointer',
                fontFamily: 'var(--font-display)',
                fontWeight: 800,
                fontSize: 12,
              }}
            >
              + Ajouter
            </button>
            <button
              type="button"
              onClick={() => setAdding(false)}
              style={{
                padding: '8px 12px',
                borderRadius: 8,
                background: 'transparent',
                color: muted,
                border: `1px solid ${line2}`,
                cursor: 'pointer',
                fontSize: 12,
              }}
            >
              ✕
            </button>
          </div>
        </form>
      )}

      {/* Funnel strip */}
      <div
        style={{
          background: surface,
          border: `1px solid ${line}`,
          borderRadius: 14,
          padding: '12px 18px',
          marginBottom: 14,
          display: 'flex',
          alignItems: 'center',
          gap: 0,
        }}
      >
        <div style={{ width: 130, flexShrink: 0 }}>
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 9.5,
              color: muted,
              letterSpacing: '.14em',
              textTransform: 'uppercase',
            }}
          >
            Funnel · pipeline
          </div>
          <div
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 15,
              fontWeight: 700,
              letterSpacing: '-.01em',
              marginTop: 2,
              color: text,
            }}
          >
            {funnelCounts[0].count} → {funnelCounts[4].count}
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: em, marginTop: 2 }}>
            {items.length} ventures actives
          </div>
        </div>
        <div
          style={{ flex: 1, display: 'flex', alignItems: 'center', height: 60, paddingLeft: 12 }}
        >
          {funnelCounts.map(({ stage, count }, i) => {
            const w = 18 - i * 2.6
            return (
              <div
                key={stage.id}
                style={{ display: 'flex', alignItems: 'center', flex: i < 4 ? 1 : 0 }}
              >
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 4,
                    flexShrink: 0,
                  }}
                >
                  <div
                    style={{
                      width: 80,
                      height: `${w * 3}px`,
                      background: stage.color,
                      opacity: 0.85,
                      clipPath:
                        i === 0
                          ? 'polygon(0 0, 100% 10%, 100% 90%, 0 100%)'
                          : 'polygon(0 10%, 100% 25%, 100% 75%, 0 90%)',
                      display: 'grid',
                      placeItems: 'center',
                    }}
                  >
                    <span
                      style={{
                        fontFamily: 'var(--font-display)',
                        fontSize: 15,
                        fontWeight: 800,
                        color: '#0b0d12',
                      }}
                    >
                      {count}
                    </span>
                  </div>
                  <span
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: 9,
                      color: stage.color,
                      letterSpacing: '.14em',
                      textTransform: 'uppercase',
                      fontWeight: 700,
                    }}
                  >
                    {stage.label}
                  </span>
                </div>
                {i < 4 && (
                  <div style={{ flex: 1, position: 'relative', height: 1, margin: '0 -4px' }}>
                    <svg
                      width="100%"
                      height="20"
                      viewBox="0 0 60 20"
                      preserveAspectRatio="none"
                      style={{ position: 'absolute', top: -10 }}
                    >
                      <path
                        d="M0 10 H56 M50 4 L56 10 L50 16"
                        stroke={muted2}
                        strokeWidth="1.4"
                        fill="none"
                        strokeDasharray="3 4"
                      />
                    </svg>
                    {count > 0 && funnelCounts[i + 1].count > 0 && (
                      <div
                        style={{
                          position: 'absolute',
                          top: -22,
                          left: '50%',
                          transform: 'translateX(-50%)',
                          fontFamily: 'var(--font-mono)',
                          fontSize: 9,
                          color: muted2,
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {Math.round((funnelCounts[i + 1].count / count) * 100)}%
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Kanban + inspector */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? '1fr' : '1fr 420px',
          gap: 14,
          minHeight: isMobile ? 'auto' : 'calc(100vh - 350px)',
        }}
      >
        {/* Kanban — scroll horizontal sur mobile */}
        <div
          style={{
            background: surface,
            border: `1px solid ${line}`,
            borderRadius: 14,
            padding: 14,
            display: 'grid',
            gridTemplateColumns: isMobile ? 'repeat(5, minmax(160px, 1fr))' : 'repeat(5, 1fr)',
            gap: 10,
            overflowX: isMobile ? 'auto' : 'visible',
          }}
        >
          {STAGES.map((stage) => {
            const cards = items.filter((v) => v.stage === stage.id)
            return (
              <div
                key={stage.id}
                style={{ minHeight: 0, display: 'flex', flexDirection: 'column', gap: 8 }}
              >
                <div
                  style={{
                    padding: '6px 8px',
                    borderRadius: 8,
                    background: surface2,
                    border: `1px solid ${line}`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexShrink: 0,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: '50%',
                        background: stage.color,
                        flexShrink: 0,
                      }}
                    />
                    <span
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: 10,
                        letterSpacing: '.14em',
                        textTransform: 'uppercase',
                        fontWeight: 700,
                        color: text,
                      }}
                    >
                      {stage.label}
                    </span>
                  </div>
                  <span
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: 11,
                      color: stage.color,
                      fontWeight: 700,
                    }}
                  >
                    {cards.length}
                  </span>
                </div>
                <div
                  style={{
                    flex: 1,
                    minHeight: 0,
                    overflowY: 'auto',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8,
                    paddingRight: 2,
                  }}
                >
                  {cards.map((v) => (
                    <VentureCard
                      key={v.id}
                      v={v}
                      stageColor={stage.color}
                      active={v.id === selectedId}
                      onClick={() => setSelectedId(v.id)}
                    />
                  ))}
                  {cards.length === 0 && (
                    <div
                      style={{
                        padding: '16px 8px',
                        textAlign: 'center',
                        borderRadius: 8,
                        border: `1px dashed ${line2}`,
                      }}
                    >
                      <span
                        style={{
                          fontFamily: 'var(--font-mono)',
                          fontSize: 9,
                          color: muted2,
                          letterSpacing: '.1em',
                        }}
                      >
                        empty
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {/* Inspector — toujours visible sur desktop, conditionnel sur mobile */}
        {(!isMobile || selectedId) && (
          <VentureInspector
            v={selected}
            repairAction={selectedRepairAction}
            commerceReadiness={selectedReadiness}
            onSave={update}
            onDelete={remove}
            onOpen={() => {
              if (selected) setSelectedId(selected.id)
            }}
            onBrief={() => {
              if (!selected) return
              navigator.clipboard
                .writeText(generateBrief(selected))
                .then(() => toast.success('Brief copié dans le presse-papier'))
                .catch(() => toast.error('Impossible de copier'))
            }}
            onRepairAction={runRepairAgent}
            agentLevels={agentLevelMap}
          />
        )}
      </div>
    </CkShell>
  )
}
