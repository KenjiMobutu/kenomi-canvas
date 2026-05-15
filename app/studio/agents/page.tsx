'use client'
import { useMemo, useEffect, useState } from 'react'
import { CkShell } from '@/components/CkShell'
import { useIsMobile } from '@/lib/studio-utils'
import {
  surface, surface2, line, line2, text, muted, muted2,
  accent, emerald, rose, cyan, violet,
} from '@/lib/ck-vars'
import { AGENTS_DATA, makeSpark, sparkPath, areaPath, useTick } from '@/lib/studio-utils'
import { createSupabaseBrowser } from '@/lib/supabase-browser'
import { useAuth } from '@/lib/auth-context'
import { toast } from 'sonner'

interface AgentConfig {
  model: string
  system_prompt: string
  temperature: number
  max_tokens: number
}

const DEFAULT_CONFIG: AgentConfig = { model: 'qwen3:8b', system_prompt: '', temperature: 0.7, max_tokens: 2048 }
const MODELS = ['qwen3:8b', 'qwen3:14b', 'claude-sonnet-4-6', 'gpt-4o-mini']

function TunePanel({ agentId, agentColor, onClose }: { agentId: string; agentColor: string; onClose: () => void }) {
  const { user } = useAuth()
  const [cfg, setCfg] = useState<AgentConfig>(DEFAULT_CONFIG)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!user) return
    const supabase = createSupabaseBrowser()
    supabase.from('agent_configs').select('*').eq('user_id', user.id).eq('agent_id', agentId).maybeSingle()
      .then(({ data }) => { if (data) setCfg({ model: data.model, system_prompt: data.system_prompt, temperature: data.temperature, max_tokens: data.max_tokens }) })
  }, [agentId, user])

  async function save() {
    if (!user) return
    setSaving(true)
    const supabase = createSupabaseBrowser()
    const { error } = await supabase.from('agent_configs').upsert({
      user_id: user.id, agent_id: agentId, ...cfg,
    }, { onConflict: 'user_id,agent_id' })
    setSaving(false)
    if (error) return toast.error(error.message)
    toast.success('Config sauvegardée')
    onClose()
  }

  return (
    <div style={{
      background: surface, border: `1px solid ${line2}`, borderRadius: 12,
      padding: 20, display: 'flex', flexDirection: 'column', gap: 14,
      borderTop: `2px solid ${agentColor}`,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 700, color: text }}>Configuration agent</div>
        <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: muted, cursor: 'pointer', fontSize: 16 }}>✕</button>
      </div>

      <div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, color: muted, letterSpacing: '.14em', textTransform: 'uppercase', marginBottom: 6 }}>Modèle</div>
        <select value={cfg.model} onChange={e => setCfg(p => ({ ...p, model: e.target.value }))} className="ck-select" style={{ width: '100%' }}>
          {MODELS.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
      </div>

      <div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, color: muted, letterSpacing: '.14em', textTransform: 'uppercase', marginBottom: 6 }}>System prompt</div>
        <textarea
          value={cfg.system_prompt}
          onChange={e => setCfg(p => ({ ...p, system_prompt: e.target.value }))}
          rows={5} className="ck-input"
          placeholder="Tu es un agent spécialisé dans…"
          style={{ width: '100%', resize: 'vertical', fontFamily: 'var(--font-mono)', fontSize: 11 }}
        />
      </div>

      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, color: muted, letterSpacing: '.14em', textTransform: 'uppercase' }}>Température</span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: agentColor, fontWeight: 700 }}>{cfg.temperature.toFixed(2)}</span>
        </div>
        <input type="range" min={0} max={1} step={0.01} value={cfg.temperature}
          onChange={e => setCfg(p => ({ ...p, temperature: parseFloat(e.target.value) }))}
          style={{ width: '100%', accentColor: agentColor }} />
      </div>

      <div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, color: muted, letterSpacing: '.14em', textTransform: 'uppercase', marginBottom: 6 }}>Max tokens</div>
        <input type="number" value={cfg.max_tokens} min={128} max={32768} step={128}
          onChange={e => setCfg(p => ({ ...p, max_tokens: parseInt(e.target.value) || 2048 }))}
          className="ck-input" style={{ width: '100%' }} />
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={save} disabled={saving} style={{ flex: 1, padding: '10px 12px', borderRadius: 8, background: agentColor, color: '#0b0d12', border: 'none', fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 12, cursor: 'pointer' }}>
          {saving ? '…' : 'Sauvegarder'}
        </button>
        <button onClick={onClose} style={{ padding: '10px 12px', borderRadius: 8, background: 'transparent', color: muted, border: `1px solid ${line}`, cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: 11 }}>Annuler</button>
      </div>
    </div>
  )
}

type AgentData = typeof AGENTS_DATA[0]

const QUEUE: Record<string, string[]> = {
  scout:      ['Scan r/saas · t-2m', 'Crawl PH top 50 · t-12m', 'Trend brief #42 · t-1h'],
  validation: ['Score HR Ops Inbox', 'Reprice CFO niche', 'Compare Legal vs HR CPC'],
  builder:    ['Landing CFO v2', 'Pricing block — Forms', 'Hero copy — Legal pivot'],
  payment:    ['Wire Stripe — CFO', 'Webhook → analytics', 'Coupon LAUNCH50'],
  marketing:  ['Carousel LI · CFO', 'TikTok hook #7', 'SEO brief: CFO niche'],
  analytics:  ['Compute CAC W42', 'Cohort retention Forms', 'Push report → Decision'],
  decision:   ['Arbitrate Forms · scale', 'Review Legal pivot', 'Stop CRM Lite'],
}

function StatBox({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{ padding: '10px 12px', borderRadius: 10, background: surface2, border: `1px solid ${line}` }}>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: muted2, letterSpacing: '.14em', textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 800, color, marginTop: 2, letterSpacing: '-.02em' }}>{value}</div>
    </div>
  )
}

function AgentInspector({ agent, activity, queue }: { agent: AgentData; activity: number[]; queue: string[] }) {
  const t = useTick(2400)
  const [tuneOpen, setTuneOpen] = useState(false)
  return (
    <div style={{
      background: surface, border: `1px solid ${line}`, borderRadius: 14,
      padding: 18, display: 'flex', flexDirection: 'column', gap: 14,
      borderTop: `3px solid ${agent.color}`,
      position: 'relative', overflow: 'hidden',
    }}>
      <div style={{
        position: 'absolute', right: -30, bottom: -50,
        fontFamily: 'var(--font-display)', fontSize: 280, fontWeight: 800,
        color: agent.color, opacity: .05, lineHeight: 1, pointerEvents: 'none', userSelect: 'none',
      }}>{agent.sigil}</div>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, position: 'relative' }}>
        <div style={{ position: 'relative', width: 72, height: 72, flexShrink: 0 }}>
          <div style={{
            position: 'absolute', inset: 0, borderRadius: 14,
            background: `conic-gradient(from ${t * 360}deg, ${agent.color}, transparent 60%, ${agent.color})`,
            opacity: .7,
          }} />
          <div style={{
            position: 'absolute', inset: 3, borderRadius: 11, background: surface2,
            border: `1px solid ${agent.color}55`,
            display: 'grid', placeItems: 'center',
            fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 36, color: agent.color,
          }}>{agent.sigil}</div>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: muted, letterSpacing: '.14em', textTransform: 'uppercase' }}>
            {agent.code} · {agent.role}
          </div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 26, fontWeight: 800, letterSpacing: '-.02em', marginTop: 2, color: text }}>
            {agent.name} Agent
          </div>
          <div style={{ fontSize: 12, color: muted, marginTop: 2 }}>{agent.tagline}</div>
        </div>
        <span style={{
          fontFamily: 'var(--font-mono)', fontSize: 11, padding: '5px 10px', borderRadius: 4, flexShrink: 0,
          background: `${agent.color}1f`, color: agent.color, letterSpacing: 1.5, fontWeight: 800,
        }}>LV {agent.level}</span>
      </div>

      {/* XP bar */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: muted, letterSpacing: '.14em', textTransform: 'uppercase' }}>Experience</span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: muted2, letterSpacing: '.1em' }}>
            {Math.round(agent.xp * 1000)} / 1000 · next: LV {agent.level + 1}
          </span>
        </div>
        <div style={{ height: 8, borderRadius: 4, background: surface2, border: `1px solid ${line}`, overflow: 'hidden', position: 'relative' }}>
          <div style={{
            width: `${agent.xp * 100}%`, height: '100%',
            background: `linear-gradient(90deg, ${agent.color}, var(--ck-accent-2))`,
            boxShadow: `0 0 10px ${agent.color}`,
          }} />
          <div style={{
            position: 'absolute', inset: 0,
            backgroundImage: 'linear-gradient(45deg, rgba(255,255,255,.1) 25%, transparent 25%, transparent 50%, rgba(255,255,255,.1) 50%, rgba(255,255,255,.1) 75%, transparent 75%)',
            backgroundSize: '10px 10px', opacity: .35,
          }} />
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
        <StatBox label="Runs"   value={String(42 + Math.round(agent.xp * 220))} color={agent.color} />
        <StatBox label="Win"    value={`${Math.round(60 + agent.xp * 30)}%`}     color={emerald} />
        <StatBox label="Avg"    value={`${(1.2 + (1 - agent.xp) * 3.5).toFixed(1)}s`} color={cyan} />
        <StatBox label="Uptime" value="99.4%"                                     color={violet} />
      </div>

      {/* Activity sparkline */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: muted, letterSpacing: '.14em', textTransform: 'uppercase' }}>Activity · 48h</span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: agent.color }}>+{Math.round(agent.xp * 60)} runs</span>
        </div>
        <svg viewBox="0 0 240 60" preserveAspectRatio="none" style={{ width: '100%', height: 64, display: 'block' }}>
          <defs>
            <linearGradient id={`ag-${agent.id}`} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={agent.color} stopOpacity=".45" />
              <stop offset="100%" stopColor={agent.color} stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={areaPath(activity, 240, 60, 2)} fill={`url(#ag-${agent.id})`} />
          <path d={sparkPath(activity, 240, 60, 2)} fill="none" stroke={agent.color} strokeWidth="1.6" />
        </svg>
      </div>

      {/* Mission queue */}
      <div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: muted, letterSpacing: '.14em', textTransform: 'uppercase', marginBottom: 6 }}>
          Mission queue · 3 prochaines
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {queue.map((q, i) => (
            <div key={i} style={{
              padding: '8px 10px', borderRadius: 8, background: surface2,
              border: `1px dashed ${line2}`,
              display: 'flex', alignItems: 'center', gap: 10,
            }}>
              <span style={{
                width: 18, height: 18, borderRadius: '50%', border: `1.5px solid ${agent.color}`,
                display: 'grid', placeItems: 'center', flexShrink: 0,
                fontFamily: 'var(--font-mono)', fontSize: 9.5, color: agent.color, fontWeight: 700,
              }}>{i + 1}</span>
              <span style={{ fontSize: 12, color: text, flex: 1 }}>{q}</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: muted2, flexShrink: 0 }}>ETA {(i + 1) * 4}m</span>
            </div>
          ))}
        </div>
      </div>

      {/* Controls */}
      <div style={{ display: 'flex', gap: 8 }}>
        <button style={{
          flex: 1, padding: '10px 12px', borderRadius: 8,
          background: agent.color, color: '#0b0d12', border: 'none',
          fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 12, letterSpacing: '.05em',
          cursor: 'pointer',
        }}>▶ Run mission</button>
        {(['PAUSE', 'LOGS'] as const).map(label => (
          <button key={label} style={{
            padding: '10px 12px', borderRadius: 8,
            background: surface2, color: text,
            border: `1px solid ${line2}`,
            fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 10, letterSpacing: '.14em',
            cursor: 'pointer',
          }}>{label}</button>
        ))}
        <button onClick={() => setTuneOpen(o => !o)} style={{
          padding: '10px 12px', borderRadius: 8,
          background: tuneOpen ? agent.color + '22' : surface2,
          color: tuneOpen ? agent.color : text,
          border: `1px solid ${tuneOpen ? agent.color + '55' : line2}`,
          fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 10, letterSpacing: '.14em',
          cursor: 'pointer',
        }}>TUNE</button>
      </div>

      {tuneOpen && <TunePanel agentId={agent.id} agentColor={agent.color} onClose={() => setTuneOpen(false)} />}
    </div>
  )
}

function RosterTile({ agent, idx, active, onClick }: { agent: AgentData; idx: number; active: boolean; onClick: () => void }) {
  const t = useTick(2200 + idx * 350)
  const pulse = 0.3 + Math.abs(Math.sin(t * Math.PI * 2)) * 0.7
  return (
    <button onClick={onClick} style={{
      position: 'relative',
      background: surface,
      border: active ? `1.5px solid ${agent.color}` : `1px solid ${line}`,
      borderRadius: 12, padding: 12,
      overflow: 'hidden', textAlign: 'left',
      cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 8,
      boxShadow: active ? `0 0 0 4px ${agent.color}1c` : 'none',
      transition: 'border-color .15s, box-shadow .15s',
    }}>
      <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 2, background: agent.color, opacity: active ? 1 : .6 }} />
      <div style={{
        position: 'absolute', right: -8, bottom: -16,
        fontFamily: 'var(--font-display)', fontSize: 100, fontWeight: 800,
        color: agent.color, opacity: .07, lineHeight: 1, pointerEvents: 'none', userSelect: 'none',
      }}>{agent.sigil}</div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, position: 'relative' }}>
        <div style={{ position: 'relative', width: 34, height: 34, flexShrink: 0 }}>
          <div style={{
            position: 'absolute', inset: 0, borderRadius: 8,
            background: `conic-gradient(from 0deg, ${agent.color}, transparent 60%, ${agent.color})`,
            opacity: 0.7 * pulse,
          }} />
          <div style={{
            position: 'absolute', inset: 2, borderRadius: 6, background: surface,
            border: `1px solid ${agent.color}55`,
            display: 'grid', placeItems: 'center',
            fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 16, color: agent.color,
          }}>{agent.sigil}</div>
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 4 }}>
            <span style={{ fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 700, letterSpacing: '-.01em', color: text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{agent.name}</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, padding: '1px 5px', borderRadius: 3, background: `${agent.color}22`, color: agent.color, fontWeight: 700, flexShrink: 0 }}>LV{agent.level}</span>
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: muted, letterSpacing: 1, marginTop: 2 }}>{agent.code} · {agent.model}</div>
        </div>
      </div>

      <div style={{ height: 4, borderRadius: 2, background: surface2, overflow: 'hidden' }}>
        <div style={{ width: `${agent.xp * 100}%`, height: '100%', background: agent.color }} />
      </div>

      <div style={{ padding: '6px 8px', borderRadius: 6, background: surface2, display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: agent.color, flexShrink: 0 }} />
        <span style={{ fontSize: 11, color: text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {agent.role}
        </span>
      </div>
    </button>
  )
}

function AddAgentTile() {
  return (
    <button style={{
      background: 'transparent',
      border: `1.5px dashed ${line2}`,
      borderRadius: 12, padding: 12,
      color: muted,
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      cursor: 'pointer', gap: 8, minHeight: 140,
    }}>
      <div style={{ width: 32, height: 32, borderRadius: '50%', border: `1.5px dashed ${line2}`, display: 'grid', placeItems: 'center' }}>
        <svg width="14" height="14" viewBox="0 0 14 14">
          <path d="M7 1 V13 M1 7 H13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      </div>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '.14em', textTransform: 'uppercase' }}>Recruter agent</span>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: muted2 }}>+1 slot dispo</span>
    </button>
  )
}

function RunsTimeline({ tick }: { tick: number }) {
  const rows = AGENTS_DATA.map((a, i) => {
    const items = Array.from({ length: 18 }).map((_, j) => {
      const seed = (i + 1) * 17 + (j + 1) * 5 + tick
      const r = Math.abs(Math.sin(seed)) * 0.9 + 0.05
      const dur = 4 + r * 18
      return { id: j, w: dur, ok: r > 0.18 }
    })
    return { agent: a, items }
  })

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
      {rows.slice(0, 6).map(row => (
        <div key={row.agent.id} style={{ display: 'grid', gridTemplateColumns: '100px 1fr', gap: 10, alignItems: 'center' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{
              width: 16, height: 16, borderRadius: 4, border: `1px solid ${row.agent.color}`,
              display: 'grid', placeItems: 'center', flexShrink: 0,
              fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 10, color: row.agent.color,
              background: `${row.agent.color}10`,
            }}>{row.agent.sigil}</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: row.agent.color, letterSpacing: 1, fontWeight: 700 }}>{row.agent.code}</span>
          </span>
          <div style={{ height: 12, display: 'flex', gap: 3, alignItems: 'stretch' }}>
            {row.items.map((it, j) => (
              <div key={j} style={{
                flex: it.w,
                background: it.ok ? row.agent.color : rose,
                opacity: it.ok ? (0.4 + (it.w / 22) * 0.6) : 0.6,
                borderRadius: 2,
              }} />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

export default function AgentsPage() {
  const isMobile = useIsMobile()
  const [selectedId, setSelectedId] = useState('decision')
  const [logTick, setLogTick] = useState(0)

  useEffect(() => {
    const i = setInterval(() => setLogTick(t => t + 1), 1600)
    return () => clearInterval(i)
  }, [])

  const selected = AGENTS_DATA.find(a => a.id === selectedId) ?? AGENTS_DATA[0]
  const activity = useMemo(() => makeSpark(48, 50, 22, selectedId.length * 7), [selectedId])
  const queue = QUEUE[selectedId] ?? []

  const throughput = AGENTS_DATA.map((a, i) => ({
    ...a,
    runs: 24 + Math.round(a.xp * 220 + i * 11),
    win: Math.round(60 + a.xp * 30),
    avg: (1.2 + (1 - a.xp) * 3.5).toFixed(1),
  }))
  const maxRuns = Math.max(...throughput.map(t => t.runs))

  const headerActions = (
    <div style={{ display: 'flex', gap: 8 }}>
      {[
        { label: '7 agents', color: muted },
        { label: '6 live', color: emerald },
        { label: '248 runs / 24h', color: cyan },
        { label: 'uptime 99.4%', color: muted },
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
    <CkShell breadcrumb="Studio / Agents" title="Fleet Command" subtitle="7 agents · missions autonomes" actions={headerActions}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

        {/* Main 2-col */}
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '480px 1fr', gap: 14, alignItems: 'start' }}>

          {/* Left: AgentInspector */}
          <AgentInspector agent={selected} activity={activity} queue={queue} />

          {/* Right: Roster + Throughput */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

            {/* Roster */}
            <div>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 700, letterSpacing: '-.01em', color: text }}>Roster</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, color: muted2, letterSpacing: '.14em', textTransform: 'uppercase' }}>click pour inspecter</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)', gap: 10 }}>
                {AGENTS_DATA.map((a, i) => (
                  <RosterTile key={a.id} agent={a} idx={i} active={a.id === selectedId} onClick={() => setSelectedId(a.id)} />
                ))}
                <AddAgentTile />
              </div>
            </div>

            {/* Throughput chart */}
            <div style={{
              background: surface, border: `1px solid ${line}`, borderRadius: 14,
              padding: 16, display: 'flex', flexDirection: 'column',
            }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 14 }}>
                <div>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 700, letterSpacing: '-.01em', color: text }}>Throughput · 24h</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, color: muted2, letterSpacing: '.14em', textTransform: 'uppercase', marginTop: 2 }}>runs · win rate · latency</div>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  {['24h', '7j', '30j'].map((label, i) => (
                    <button key={label} style={{
                      padding: '4px 8px', borderRadius: 4,
                      fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '.14em',
                      border: `1px solid ${line}`,
                      background: i === 0 ? accent : surface2,
                      color: i === 0 ? '#0b0d12' : muted,
                      fontWeight: 700, cursor: 'pointer',
                    }}>{label}</button>
                  ))}
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {throughput.map((row, i) => (
                  <div key={row.id} style={{ display: 'grid', gridTemplateColumns: '110px 1fr 60px 60px 50px', gap: 12, alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                      <span style={{
                        width: 22, height: 22, borderRadius: 5, border: `1px solid ${row.color}`,
                        display: 'grid', placeItems: 'center', flexShrink: 0,
                        fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 13, color: row.color,
                        background: `${row.color}10`,
                      }}>{AGENTS_DATA[i].sigil}</span>
                      <span style={{ fontSize: 12, fontWeight: 600, color: text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.name}</span>
                    </div>
                    <div style={{ height: 12, background: surface2, borderRadius: 3, position: 'relative', overflow: 'hidden', border: `1px solid ${line}` }}>
                      <div style={{
                        width: `${(row.runs / maxRuns) * 100}%`, height: '100%',
                        background: `linear-gradient(90deg, ${row.color}, ${row.color}aa)`,
                      }} />
                      <div style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(90deg, rgba(255,255,255,.08) 1px, transparent 1px)', backgroundSize: '20px 100%' }} />
                    </div>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: row.color, fontWeight: 700, textAlign: 'right' }}>{row.runs}</span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: emerald, textAlign: 'right' }}>{row.win}%</span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: muted, textAlign: 'right' }}>{row.avg}s</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Bottom: Runs timeline */}
        <div style={{
          background: surface, border: `1px solid ${line}`, borderRadius: 14,
          padding: 14, display: 'flex', flexDirection: 'column', gap: 8, minHeight: 168,
        }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 700, letterSpacing: '-.01em', color: text }}>Recent runs · agent timeline</div>
            <div style={{ display: 'flex', gap: 6 }}>
              {['all', ...AGENTS_DATA.slice(0, 5).map(a => a.code)].map((label, i) => (
                <span key={label} style={{
                  fontFamily: 'var(--font-mono)', fontSize: 9, padding: '3px 7px', borderRadius: 4, letterSpacing: '.14em',
                  border: `1px solid ${line}`,
                  background: i === 0 ? surface2 : 'transparent',
                  color: i === 0 ? text : muted,
                }}>{label}</span>
              ))}
            </div>
          </div>
          <RunsTimeline tick={logTick} />
        </div>
      </div>
    </CkShell>
  )
}
