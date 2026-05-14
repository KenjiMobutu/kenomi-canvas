'use client'
import { useEffect, useMemo, useState } from 'react'
import { createSupabaseBrowser } from '@/lib/supabase-browser'
import { useAuth } from '@/lib/auth-context'
import { toast } from 'sonner'
import { CkShell } from '@/components/CkShell'
import { surface, surface2, line, line2, text, muted, muted2, accent, bg } from '@/lib/ck-vars'
import { agentById, makeSpark, sparkPath, areaPath } from '@/lib/studio-utils'

const em = '#34d399', am = '#fbbf24', ro = '#fb7185', cy = '#22d3ee', vi = '#a78bfa'

const STAGES = [
  { id: 'ideas',      label: 'Ideas',      color: cy   },
  { id: 'validation', label: 'Validation', color: vi   },
  { id: 'build',      label: 'Build',      color: em   },
  { id: 'launch',     label: 'Launch',     color: am   },
  { id: 'scale',      label: 'Scale',      color: accent },
]

const STATUS_COLOR: Record<string, string> = {
  Scale: 'var(--ck-accent)', Continue: '#22d3ee', Pivot: '#e879f9', Stop: '#fb7185',
}

const STAGE_AGENTS: Record<string, string[]> = {
  ideas:      ['scout'],
  validation: ['validation', 'marketing'],
  build:      ['builder', 'payment'],
  launch:     ['marketing', 'analytics'],
  scale:      ['analytics', 'marketing', 'payment', 'decision'],
}

const seedVentures = [
  { name: 'AI Inbox Triage',    niche: 'AI inbox',        stage: 'ideas',      score: 62, mrr: '0',   cac: '0',  conversion: '0',   next_action: 'Scan Reddit',       insight: 'r/solopreneur signals' },
  { name: 'Voice Notes → CRM',  niche: 'Voice to CRM',    stage: 'ideas',      score: 71, mrr: '0',   cac: '0',  conversion: '0',   next_action: 'Build landing',     insight: 'TikTok hook viral' },
  { name: 'HR Ops Inbox',       niche: 'HR inbox auto',   stage: 'validation', score: 78, mrr: '0',   cac: '0',  conversion: '0',   next_action: 'Run paid test',     insight: 'CPC €0.42 · TAM €18M' },
  { name: 'Solo CFO Copilot',   niche: 'Finance AI',      stage: 'validation', score: 84, mrr: '620', cac: '21', conversion: '6.2', next_action: 'Pricing A/B test', insight: 'waitlist 482 · SEO strong' },
  { name: 'Legal Intake Bot',   niche: 'Legal intake',    stage: 'build',      score: 68, mrr: '310', cac: '39', conversion: '4.1', next_action: 'Pivot HR ops',      insight: 'high CPC — pivot HR ops' },
  { name: 'Resto Menu Studio',  niche: 'Restaurant menus',stage: 'build',      score: 72, mrr: '180', cac: '24', conversion: '5.0', next_action: 'Scale to 50',       insight: 'first 12 paying' },
  { name: 'Creator CRM Lite',   niche: 'CRM creators',    stage: 'launch',     score: 42, mrr: '120', cac: '52', conversion: '1.9', next_action: 'Archive',           insight: 'CTR below threshold' },
  { name: 'Agency Brief Engine',niche: 'Agency briefs',   stage: 'launch',     score: 70, mrr: '540', cac: '31', conversion: '5.8', next_action: 'Double paid spend', insight: 'LinkedIn 14k imp' },
  { name: 'Kenomi Forms',       niche: 'No-code forms',   stage: 'scale',      score: 91, mrr: '2800',cac: '14', conversion: '9.8', next_action: 'Increase acquisition',insight: 'MRR +18% · CAC -11%' },
]

interface Venture {
  id: string; name: string; niche: string; stage: string; score: number
  mrr: string; cac: string; conversion: string; next_action: string; insight: string
}
interface DV extends Venture {
  mrrNum: number; cacNum: number; convNum: number; status: string
  note: string; agentIds: string[]
}

function parseNum(s: string | number): number {
  const str = String(s || '0')
  const n = parseFloat(str.replace(/[€$, ]/g, '').replace('%', ''))
  return str.toLowerCase().includes('k') ? n * 1000 : (isNaN(n) ? 0 : n)
}

function toDisplay(v: Venture): DV {
  const stage = (v.stage || 'ideas').toLowerCase()
  let status = 'Continue'
  if (stage === 'scale') status = 'Scale'
  else if (v.score < 50) status = 'Stop'
  else if (v.score < 60) status = 'Pivot'
  return {
    ...v, stage,
    mrrNum: parseNum(v.mrr), cacNum: parseNum(v.cac), convNum: parseNum(v.conversion),
    status, note: v.insight || v.next_action || '',
    agentIds: STAGE_AGENTS[stage] || ['scout'],
  }
}

// ── Sub-components ──────────────────────────────────────────────────────────

function ScoreRing({ value, color }: { value: number; color: string }) {
  const r = 11, circ = 2 * Math.PI * r
  return (
    <div style={{ position: 'relative', width: 28, height: 28, flexShrink: 0 }}>
      <svg width="28" height="28" viewBox="0 0 28 28">
        <circle cx="14" cy="14" r={r} fill="none" stroke={line2} strokeWidth="2.5" />
        <circle cx="14" cy="14" r={r} fill="none" stroke={color} strokeWidth="2.5"
          strokeDasharray={`${(value / 100) * circ} ${circ}`}
          strokeLinecap="round" transform="rotate(-90 14 14)" />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 700, color }}>{value}</div>
    </div>
  )
}

function VentureCard({ v, stageColor, active, onClick }: { v: DV; stageColor: string; active: boolean; onClick: () => void }) {
  const sc = STATUS_COLOR[v.status] || cy
  return (
    <button type="button" onClick={onClick} style={{
      textAlign: 'left', padding: 10, borderRadius: 10, width: '100%',
      background: active ? surface : bg,
      border: `${active ? 1.5 : 1}px solid ${active ? stageColor : line}`,
      cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 7,
      boxShadow: active ? `0 0 0 3px ${stageColor}1c` : 'none',
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 6 }}>
        <span style={{ fontSize: 12.5, fontWeight: 700, lineHeight: 1.2, color: text }}>{v.name}</span>
        <ScoreRing value={v.score} color={stageColor} />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        {v.agentIds.map(id => {
          const a = agentById(id)
          return (
            <span key={id} title={a.name} style={{
              width: 16, height: 16, borderRadius: 4, border: `1px solid ${a.color}`,
              background: `${a.color}18`, display: 'grid', placeItems: 'center',
              fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 9, color: a.color,
            }}>{a.sigil}</span>
          )
        })}
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: muted2, marginLeft: 4, letterSpacing: '.1em' }}>{v.agentIds.length} agents</span>
      </div>
      {v.mrrNum > 0 && (
        <div style={{ display: 'flex', gap: 8, fontFamily: 'var(--font-mono)', fontSize: 9.5 }}>
          <span style={{ color: em }}>€{v.mrrNum}</span>
          <span style={{ color: muted }}>CAC €{v.cacNum}</span>
          <span style={{ color: cy }}>{v.convNum}%</span>
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, padding: '2px 6px', borderRadius: 3, background: `${sc}1f`, color: sc, letterSpacing: 1, fontWeight: 700 }}>{v.status.toUpperCase()}</span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: muted2, letterSpacing: '.1em' }}>{v.note.length > 24 ? v.note.slice(0, 22) + '…' : v.note}</span>
      </div>
    </button>
  )
}

function MiniArea({ label, spark, color }: { label: string; spark: number[]; color: string }) {
  const uid = label.replace(/\W/g, '')
  return (
    <div style={{ padding: 8, borderRadius: 8, background: surface2, border: `1px solid ${line}` }}>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: muted2, letterSpacing: '.14em', textTransform: 'uppercase' }}>{label}</div>
      <svg viewBox="0 0 100 30" preserveAspectRatio="none" style={{ width: '100%', height: 30, marginTop: 4 }}>
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

function VentureInspector({ v }: { v: DV | null }) {
  const stage = v ? (STAGES.find(s => s.id === v.stage) || STAGES[2]) : STAGES[2]
  const sparkA = useMemo(() => v ? makeSpark(28, 40, 14, (v.id?.length ?? 1) + 3) : [], [v?.id])
  const sparkB = useMemo(() => v ? makeSpark(28, 50, 16, (v.id?.length ?? 1) + 11) : [], [v?.id])

  if (!v) return (
    <div style={{ background: surface, border: `1px solid ${line}`, borderRadius: 14, display: 'grid', placeItems: 'center', minHeight: 400 }}>
      <p style={{ fontSize: 13, color: muted2, textAlign: 'center' }}>Sélectionnez une venture</p>
    </div>
  )

  const sc = STATUS_COLOR[v.status] || cy
  const history = [
    { day: -42, action: 'Created',   color: cy, by: 'scout' },
    { day: -28, action: 'Validated', color: vi, by: 'validation' },
    { day: -14, action: 'Built v1',  color: em, by: 'builder' },
    { day:  -7, action: 'Launched',  color: am, by: 'marketing' },
    { day:   0, action: v.status,    color: sc, by: 'decision' },
  ]

  return (
    <div style={{
      background: surface, border: `1px solid ${line}`, borderRadius: 14,
      padding: 16, display: 'flex', flexDirection: 'column', gap: 12,
      borderLeft: `3px solid ${stage.color}`, overflowY: 'auto',
    }}>
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: stage.color, letterSpacing: '.14em', textTransform: 'uppercase', fontWeight: 700 }}>
            {stage.label} · score {v.score}
          </span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, padding: '3px 8px', borderRadius: 4, background: `${sc}22`, color: sc, letterSpacing: 1.5, fontWeight: 800 }}>
            {v.status.toUpperCase()}
          </span>
        </div>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 800, letterSpacing: '-.02em', marginTop: 4, color: text }}>{v.name}</div>
        <div style={{ fontSize: 12, color: muted, marginTop: 4 }}>{v.note}</div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 8 }}>
        {([['MRR', `€${v.mrrNum || 0}`, em], ['CAC', v.cacNum ? `€${v.cacNum}` : '—', cy], ['Conv.', v.convNum ? `${v.convNum}%` : '—', vi], ['Score', String(v.score), stage.color]] as [string, string, string][]).map(([lb, val, col]) => (
          <div key={lb} style={{ padding: '10px 12px', borderRadius: 10, background: surface2, border: `1px solid ${line}` }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: muted2, letterSpacing: '.14em', textTransform: 'uppercase' }}>{lb}</div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 800, color: col, marginTop: 2, letterSpacing: '-.02em' }}>{val}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <MiniArea label="MRR · 28j"  spark={sparkA} color={em} />
        <MiniArea label="Conv · 28j" spark={sparkB} color={cy} />
      </div>

      <div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: muted, letterSpacing: '.14em', textTransform: 'uppercase', marginBottom: 6 }}>Squad assignée</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          {v.agentIds.map(id => {
            const a = agentById(id)
            return (
              <div key={id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 8px', borderRadius: 6, background: surface2, border: `1px solid ${line}` }}>
                <span style={{ width: 22, height: 22, borderRadius: 5, border: `1px solid ${a.color}`, background: `${a.color}12`, display: 'grid', placeItems: 'center', fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 13, color: a.color }}>{a.sigil}</span>
                <span style={{ fontSize: 11.5, fontWeight: 600, flex: 1, color: text }}>{a.name}</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: a.color, letterSpacing: 1 }}>LV {a.level}</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: em, letterSpacing: 1 }}>{60 + Math.round(a.xp * 30)}%</span>
              </div>
            )
          })}
        </div>
      </div>

      <div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: muted, letterSpacing: '.14em', textTransform: 'uppercase', marginBottom: 6 }}>Decision timeline</div>
        <div style={{ position: 'relative', paddingLeft: 18 }}>
          <div style={{ position: 'absolute', left: 6, top: 4, bottom: 4, width: 1.5, background: line2 }} />
          {history.map((h, i) => {
            const a = agentById(h.by)
            return (
              <div key={i} style={{ position: 'relative', marginBottom: 10 }}>
                <div style={{ position: 'absolute', left: -16, top: 3, width: 10, height: 10, borderRadius: '50%', background: h.color, boxShadow: `0 0 8px ${h.color}`, border: `2px solid ${surface}` }} />
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <div>
                    <span style={{ fontSize: 12, fontWeight: 700, color: text }}>{h.action}</span>
                    <span style={{ color: a.color, fontFamily: 'var(--font-mono)', fontSize: 9.5, marginLeft: 6, letterSpacing: 1 }}>· {a.code}</span>
                  </div>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, color: muted2, letterSpacing: '.1em' }}>{h.day === 0 ? 'today' : `t${h.day}j`}</span>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 6 }}>
        <button type="button" style={{ flex: 1, padding: '10px 12px', borderRadius: 8, background: sc, color: '#0b0d12', border: 'none', fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 11.5, letterSpacing: '.05em', cursor: 'pointer' }}>
          Confirm · {v.status}
        </button>
        {['OPEN', 'BRIEF'].map(lbl => (
          <button key={lbl} type="button" style={{ padding: '10px 12px', borderRadius: 8, background: surface2, color: text, border: `1px solid ${line2}`, fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 10, letterSpacing: '.14em', cursor: 'pointer' }}>{lbl}</button>
        ))}
      </div>
    </div>
  )
}

// ── Page ────────────────────────────────────────────────────────────────────

export default function VenturesPage() {
  const { user } = useAuth()
  const [items, setItems] = useState<DV[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState({ name: '', niche: '', stage: 'validation', score: '', mrr: '' })

  const supabase = createSupabaseBrowser()

  async function load() {
    const { data } = await supabase.from('ventures').select('*').order('score', { ascending: false })
    const list = (data as Venture[]) || []
    if (list.length === 0 && user) {
      await supabase.from('ventures').insert(seedVentures.map(v => ({ ...v, user_id: user.id })))
      return load()
    }
    const dvs = list.map(toDisplay)
    setItems(dvs)
    if (!selectedId && dvs.length > 0) setSelectedId(dvs[0].id)
  }
  useEffect(() => { if (user) load() }, [user]) // eslint-disable-line react-hooks/exhaustive-deps

  async function create(e: React.FormEvent) {
    e.preventDefault()
    if (!user || !form.name.trim()) return
    const { error } = await supabase.from('ventures').insert({
      user_id: user.id, name: form.name.trim(), niche: form.niche.trim(),
      stage: form.stage, score: parseInt(form.score) || 50,
      mrr: form.mrr.trim() || '0', cac: '0', conversion: '0',
      next_action: '', insight: '',
    })
    if (error) return toast.error(error.message)
    setForm({ name: '', niche: '', stage: 'validation', score: '', mrr: '' })
    setAdding(false)
    load()
  }

  const selected = items.find(v => v.id === selectedId) ?? null

  const funnelCounts = STAGES.map(s => ({
    stage: s,
    count: items.filter(v => v.stage === s.id).length,
  }))

  const headerActions = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      {[
        { label: `${items.length} ventures`, color: muted2 },
        { label: `${items.filter(v => v.stage === 'scale').length} scaling`, color: em },
        { label: `${items.filter(v => v.stage === 'validation').length} valid.`, color: cy },
      ].map(pill => (
        <span key={pill.label} style={{ fontFamily: 'var(--font-mono)', fontSize: 10, padding: '3px 8px', borderRadius: 4, border: `1px solid ${line2}`, color: pill.color, letterSpacing: '.1em' }}>{pill.label}</span>
      ))}
      <button onClick={() => setAdding(v => !v)} style={{ padding: '7px 14px', borderRadius: 999, background: accent, color: '#0b0d12', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 12 }}>
        + New venture
      </button>
    </div>
  )

  return (
    <CkShell breadcrumb="Studio / Ventures" title="Venture Board" actions={headerActions}>

      {/* Add form */}
      {adding && (
        <form onSubmit={create} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr .5fr .3fr .3fr auto', gap: 8, marginBottom: 14, background: surface, border: `1px solid ${line}`, borderRadius: 12, padding: 14 }}>
          <input className="ck-input" placeholder="Nom" value={form.name} onChange={e => setForm(c => ({ ...c, name: e.target.value }))} />
          <input className="ck-input" placeholder="Niche" value={form.niche} onChange={e => setForm(c => ({ ...c, niche: e.target.value }))} />
          <select className="ck-select" value={form.stage} onChange={e => setForm(c => ({ ...c, stage: e.target.value }))}>
            {STAGES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
          <input className="ck-input" placeholder="Score" type="number" min="0" max="100" value={form.score} onChange={e => setForm(c => ({ ...c, score: e.target.value }))} />
          <input className="ck-input" placeholder="MRR" value={form.mrr} onChange={e => setForm(c => ({ ...c, mrr: e.target.value }))} />
          <div style={{ display: 'flex', gap: 6 }}>
            <button style={{ padding: '8px 16px', borderRadius: 8, background: accent, color: '#0b0d12', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 12 }}>+ Ajouter</button>
            <button type="button" onClick={() => setAdding(false)} style={{ padding: '8px 12px', borderRadius: 8, background: 'transparent', color: muted, border: `1px solid ${line2}`, cursor: 'pointer', fontSize: 12 }}>✕</button>
          </div>
        </form>
      )}

      {/* Funnel strip */}
      <div style={{ background: surface, border: `1px solid ${line}`, borderRadius: 14, padding: '12px 18px', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 0 }}>
        <div style={{ width: 130, flexShrink: 0 }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, color: muted, letterSpacing: '.14em', textTransform: 'uppercase' }}>Funnel · pipeline</div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 700, letterSpacing: '-.01em', marginTop: 2, color: text }}>
            {funnelCounts[0].count} → {funnelCounts[4].count}
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: em, marginTop: 2 }}>
            {items.length} ventures actives
          </div>
        </div>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', height: 60, paddingLeft: 12 }}>
          {funnelCounts.map(({ stage, count }, i) => {
            const w = 18 - i * 2.6
            return (
              <div key={stage.id} style={{ display: 'flex', alignItems: 'center', flex: i < 4 ? 1 : 0 }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                  <div style={{
                    width: 80, height: `${w * 3}px`,
                    background: stage.color, opacity: .85,
                    clipPath: i === 0 ? 'polygon(0 0, 100% 10%, 100% 90%, 0 100%)' : 'polygon(0 10%, 100% 25%, 100% 75%, 0 90%)',
                    display: 'grid', placeItems: 'center',
                  }}>
                    <span style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 800, color: '#0b0d12' }}>{count}</span>
                  </div>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: stage.color, letterSpacing: '.14em', textTransform: 'uppercase', fontWeight: 700 }}>{stage.label}</span>
                </div>
                {i < 4 && (
                  <div style={{ flex: 1, position: 'relative', height: 1, margin: '0 -4px' }}>
                    <svg width="100%" height="20" viewBox="0 0 60 20" preserveAspectRatio="none" style={{ position: 'absolute', top: -10 }}>
                      <path d="M0 10 H56 M50 4 L56 10 L50 16" stroke={muted2} strokeWidth="1.4" fill="none" strokeDasharray="3 4" />
                    </svg>
                    {count > 0 && funnelCounts[i + 1].count > 0 && (
                      <div style={{ position: 'absolute', top: -22, left: '50%', transform: 'translateX(-50%)', fontFamily: 'var(--font-mono)', fontSize: 9, color: muted2, whiteSpace: 'nowrap' }}>
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
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 420px', gap: 14, height: 'calc(100vh - 350px)', minHeight: 480 }}>
        {/* Kanban */}
        <div style={{ background: surface, border: `1px solid ${line}`, borderRadius: 14, padding: 14, display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10, minHeight: 0 }}>
          {STAGES.map(stage => {
            const cards = items.filter(v => v.stage === stage.id)
            return (
              <div key={stage.id} style={{ minHeight: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ padding: '6px 8px', borderRadius: 8, background: surface2, border: `1px solid ${line}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: stage.color, flexShrink: 0 }} />
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '.14em', textTransform: 'uppercase', fontWeight: 700, color: text }}>{stage.label}</span>
                  </div>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: stage.color, fontWeight: 700 }}>{cards.length}</span>
                </div>
                <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8, paddingRight: 2 }}>
                  {cards.map(v => (
                    <VentureCard key={v.id} v={v} stageColor={stage.color} active={v.id === selectedId} onClick={() => setSelectedId(v.id)} />
                  ))}
                  {cards.length === 0 && (
                    <div style={{ padding: '16px 8px', textAlign: 'center', borderRadius: 8, border: `1px dashed ${line2}` }}>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: muted2, letterSpacing: '.1em' }}>empty</span>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {/* Inspector */}
        <VentureInspector v={selected} />
      </div>
    </CkShell>
  )
}
