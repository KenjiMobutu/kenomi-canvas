'use client'
import { useMemo, useEffect, useState } from 'react'
import { CkShell } from '@/components/CkShell'
import {
  bg, surface, surface2, line, line2, text, muted, muted2,
  accent, emerald, amber, rose, cyan, violet, fuchsia,
} from '@/lib/ck-vars'
import { makeSpark, sparkPath } from '@/lib/studio-utils'

const CHATTER = [
  { text: 'Scored 3 niches, top: CFO Ops (82/100)' },
  { text: 'Upserted 12 venture scores to Supabase' },
  { text: 'Webhook received from Stripe · checkout.session.completed' },
  { text: 'Marketing draft queued · LinkedIn carousel CFO v3' },
  { text: 'Decision signal: Forms → Scale (threshold met)' },
  { text: 'MCP infra probe · all 9 servers OK' },
  { text: 'CAC recomputed · CFO niche: €14 (down -8%)' },
  { text: 'SEO page published: alternatives-typeform.html' },
  { text: 'Stripe webhook → analytics event sunk' },
  { text: 'Cohort data refreshed · 8 cohorts × 8 months' },
]

const WORKFLOWS = [
  {
    id: 'validation-loop', name: 'n8n validation loop', trigger: 'Schedule · */15min',
    runs: 248, success: 96, avg: '1.4s', enabled: true, color: '#a78bfa',
    nodes: [
      { id: 'trig',  x:  60, y: 70,  type: 'trigger', label: 'Cron 15m'         },
      { id: 'scout', x: 220, y: 30,  type: 'agent',   label: 'Scout · scan'      },
      { id: 'score', x: 220, y: 110, type: 'agent',   label: 'Validation · score'},
      { id: 'merge', x: 380, y: 70,  type: 'logic',   label: 'Merge ↻'          },
      { id: 'sup',   x: 540, y: 30,  type: 'service', label: 'Supabase upsert'  },
      { id: 'deci',  x: 540, y: 110, type: 'agent',   label: 'Decision · notify' },
      { id: 'out',   x: 700, y: 70,  type: 'out',     label: 'Webhook + queue'  },
    ],
    edges: [['trig','scout'],['trig','score'],['scout','merge'],['score','merge'],['merge','sup'],['merge','deci'],['sup','out'],['deci','out']] as [string,string][],
  },
  { id: 'mcp-probe',       name: 'MCP infrastructure probe',  trigger: 'Webhook',       runs: 124, success: 99, avg: '0.6s', enabled: true,  color: '#22d3ee', nodes: [], edges: [] as [string,string][] },
  { id: 'stripe-ready',    name: 'Stripe checkout readiness', trigger: 'Manual',        runs:  18, success: 88, avg: '2.1s', enabled: false, color: '#fbbf24', nodes: [], edges: [] as [string,string][] },
  { id: 'marketing-queue', name: 'Marketing content queue',   trigger: 'Schedule · 6h', runs:  72, success: 94, avg: '3.4s', enabled: true,  color: '#e879f9', nodes: [], edges: [] as [string,string][] },
  { id: 'billing-events',  name: 'Billing events sink',       trigger: 'Webhook',       runs: 412, success: 99, avg: '0.3s', enabled: true,  color: '#34d399', nodes: [], edges: [] as [string,string][] },
  { id: 'venture-promote', name: 'Venture stage promotion',   trigger: 'Event',         runs:  31, success: 87, avg: '5.2s', enabled: true,  color: '#fb7185', nodes: [], edges: [] as [string,string][] },
]

type Workflow = typeof WORKFLOWS[0]

const TYPE_META: Record<string, { color: string; label: string }> = {
  trigger: { color: '#22d3ee',   label: 'TRIG' },
  agent:   { color: '',          label: 'AGT'  },
  logic:   { color: '#fbbf24',   label: 'LOG'  },
  service: { color: '#34d399',   label: 'SVC'  },
  out:     { color: '#ff6a3d',   label: 'OUT'  },
}

function AuKpi({ label, value, delta, color }: { label: string; value: string; delta: string; color: string }) {
  const spark = useMemo(() => makeSpark(28, 40, 14, label.length * 7), [label])
  return (
    <div style={{
      background: surface, border: `1px solid ${line}`, borderRadius: 12, padding: 12,
      position: 'relative', overflow: 'hidden',
    }}>
      <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, background: color, opacity: .7 }} />
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, color: muted, letterSpacing: '.14em', textTransform: 'uppercase' }}>{label}</span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, padding: '2px 6px', borderRadius: 3, background: `${color}1a`, color, letterSpacing: 1, fontWeight: 700 }}>{delta}</span>
      </div>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 800, letterSpacing: '-.02em', marginTop: 6, color: text }}>{value}</div>
      <svg viewBox="0 0 100 22" preserveAspectRatio="none" style={{ width: '100%', height: 20, marginTop: 4, display: 'block' }}>
        <path d={sparkPath(spark, 100, 22, 1)} fill="none" stroke={color} strokeWidth="1.4" />
      </svg>
    </div>
  )
}

function AuStatBox({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{ padding: '8px 10px', borderRadius: 8, background: surface2, border: `1px solid ${line}` }}>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: muted2, letterSpacing: '.14em', textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 800, color, marginTop: 2 }}>{value}</div>
    </div>
  )
}

function WorkflowDAG({ workflow }: { workflow: Workflow }) {
  const W = 800, H = 240, NODE_W = 130, NODE_H = 50
  return (
    <div style={{
      background: surface, border: `1px solid ${line}`, borderRadius: 14,
      padding: 16, display: 'flex', flexDirection: 'column', gap: 12, overflow: 'hidden',
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 700, letterSpacing: '-.01em', color: text }}>{workflow.name}</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, color: muted2, letterSpacing: '.14em', textTransform: 'uppercase', marginTop: 2 }}>
            DAG · {workflow.trigger} · {workflow.nodes.length} nœuds · {workflow.edges.length} arêtes
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button style={{
            padding: '6px 12px', borderRadius: 6,
            background: workflow.color, color: '#0b0d12', border: 'none',
            fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 11, letterSpacing: '.06em', cursor: 'pointer',
          }}>▶ RUN NOW</button>
          {(['EDIT', workflow.enabled ? 'PAUSE' : 'ENABLE'] as const).map(label => (
            <button key={label} style={{
              padding: '6px 12px', borderRadius: 6,
              background: surface2, color: text, border: `1px solid ${line2}`,
              fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 10, letterSpacing: '.14em', cursor: 'pointer',
            }}>{label}</button>
          ))}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
        <AuStatBox label="Runs"    value={String(workflow.runs)} color={workflow.color} />
        <AuStatBox label="Success" value={`${workflow.success}%`} color={emerald} />
        <AuStatBox label="Avg dur" value={workflow.avg}           color={cyan} />
        <AuStatBox label="Last"    value="2m ago"                 color={violet} />
      </div>

      <div style={{ flex: 1, minHeight: 200 }}>
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" style={{ width: '100%', height: '100%' }}>
          <defs>
            <linearGradient id="auEdge" x1="0" x2="1" y1="0" y2="0">
              <stop offset="0%"   stopColor={workflow.color} stopOpacity="0" />
              <stop offset="50%"  stopColor={workflow.color} stopOpacity=".7" />
              <stop offset="100%" stopColor={workflow.color} stopOpacity="0" />
            </linearGradient>
          </defs>
          {workflow.edges.map(([from, to], idx) => {
            const f = workflow.nodes.find(n => n.id === from)
            const t = workflow.nodes.find(n => n.id === to)
            if (!f || !t) return null
            const fx = f.x + NODE_W / 2, fy = f.y + NODE_H / 2
            const tx = t.x + NODE_W / 2, ty = t.y + NODE_H / 2
            const offset = (idx * 0.13) % 1
            return (
              <g key={idx}>
                <line x1={fx} y1={fy} x2={tx} y2={ty} stroke={workflow.color} strokeOpacity=".35" strokeWidth="1.2" strokeDasharray="3 5" />
                <circle r="3.5" fill={workflow.color}>
                  <animate attributeName="cx" from={fx} to={tx} dur="1.6s" begin={`${-offset * 1.6}s`} repeatCount="indefinite" />
                  <animate attributeName="cy" from={fy} to={ty} dur="1.6s" begin={`${-offset * 1.6}s`} repeatCount="indefinite" />
                </circle>
                <circle r="2" fill="#fff">
                  <animate attributeName="cx" from={fx} to={tx} dur="1.6s" begin={`${-offset * 1.6}s`} repeatCount="indefinite" />
                  <animate attributeName="cy" from={fy} to={ty} dur="1.6s" begin={`${-offset * 1.6}s`} repeatCount="indefinite" />
                </circle>
              </g>
            )
          })}
          {workflow.nodes.map(n => {
            const meta = TYPE_META[n.type] ?? { color: '#8a93a6', label: '' }
            const nodeColor = n.type === 'agent' ? workflow.color : meta.color
            return (
              <g key={n.id} transform={`translate(${n.x}, ${n.y})`} style={{ cursor: 'pointer' }}>
                <rect width={NODE_W} height={NODE_H} rx="8" ry="8" fill={surface2} stroke={nodeColor} strokeOpacity=".7" strokeWidth="1" />
                <rect width="3" height={NODE_H} rx="2" ry="2" fill={nodeColor} />
                <text x="14" y="18" fontSize="8.5" fill={nodeColor} fontFamily="var(--font-mono)" letterSpacing="1.4" fontWeight="700">{meta.label}</text>
                <text x="14" y="34" fontSize="11" fill={text} fontFamily="var(--font-display)" fontWeight="600">{n.label}</text>
                <circle cx={NODE_W - 12} cy="12" r="3.5" fill={nodeColor}>
                  <animate attributeName="opacity" values="0.4;1;0.4" dur="2s" repeatCount="indefinite" />
                </circle>
              </g>
            )
          })}
        </svg>
      </div>
    </div>
  )
}

function WorkflowRow({ w, active, onClick }: { w: Workflow; active: boolean; onClick: () => void }) {
  const spark = useMemo(() => makeSpark(20, 40, 16, w.id.length * 7), [w.id])
  return (
    <button onClick={onClick} style={{
      textAlign: 'left', padding: 10, borderRadius: 10,
      background: active ? surface2 : bg,
      border: active ? `1.5px solid ${w.color}` : `1px solid ${line}`,
      display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: 10, alignItems: 'center',
      cursor: 'pointer', position: 'relative', overflow: 'hidden',
      boxShadow: active ? `0 0 0 4px ${w.color}1c` : 'none',
      transition: 'border-color .15s, box-shadow .15s',
    }}>
      <div style={{
        width: 32, height: 32, borderRadius: 8, flexShrink: 0,
        background: `${w.color}1a`, border: `1px solid ${w.color}55`,
        display: 'grid', placeItems: 'center',
      }}>
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path d="M2 4 H8 M2 7 H12 M2 10 H6" stroke={w.color} strokeWidth="1.4" strokeLinecap="round" />
          <circle cx="11" cy="4" r="1.5" fill={w.color} />
        </svg>
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 12.5, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: text }}>{w.name}</span>
          {!w.enabled && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 8.5, padding: '1px 5px', borderRadius: 3, background: surface, color: muted2, letterSpacing: 1, flexShrink: 0 }}>PAUSED</span>}
        </div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: muted, letterSpacing: '.1em', marginTop: 2 }}>{w.trigger} · {w.runs} runs · {w.success}% ok</div>
      </div>
      <svg viewBox="0 0 60 30" preserveAspectRatio="none" style={{ width: 60, height: 30, flexShrink: 0 }}>
        <path d={sparkPath(spark, 60, 30, 1)} fill="none" stroke={w.color} strokeWidth="1.4" />
      </svg>
    </button>
  )
}

function WorkflowsList({ selectedId, onSelect }: { selectedId: string; onSelect: (id: string) => void }) {
  return (
    <div style={{
      background: surface, border: `1px solid ${line}`, borderRadius: 14,
      padding: 14, display: 'flex', flexDirection: 'column', gap: 8,
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 2 }}>
        <div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 700, letterSpacing: '-.01em', color: text }}>All workflows</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, color: muted2, letterSpacing: '.14em', textTransform: 'uppercase', marginTop: 2 }}>{WORKFLOWS.length} workflows · 16 actifs</div>
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          {['all', 'active', 'paused'].map((s, i) => (
            <span key={s} style={{
              fontFamily: 'var(--font-mono)', fontSize: 9, padding: '3px 7px', borderRadius: 4, letterSpacing: '.14em', textTransform: 'uppercase',
              background: i === 0 ? surface2 : 'transparent',
              color: i === 0 ? text : muted,
              border: `1px solid ${line}`,
            }}>{s}</span>
          ))}
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {WORKFLOWS.map(w => (
          <WorkflowRow key={w.id} w={w} active={w.id === selectedId} onClick={() => onSelect(w.id)} />
        ))}
      </div>
    </div>
  )
}

function RunsFeed({ tick }: { tick: number }) {
  const lines = useMemo(() => Array.from({ length: 9 }).map((_, i) => {
    const wf = WORKFLOWS[(tick + i) % WORKFLOWS.length]
    const c = CHATTER[(tick + i) % CHATTER.length]
    const ok = ((tick + i * 7) % 12) !== 0
    return { wf, c, ok, key: `${tick}-${i}`, dur: (0.4 + ((i + tick) % 20) / 10).toFixed(1) }
  }), [tick])

  return (
    <div style={{
      background: surface, border: `1px solid ${line}`, borderRadius: 14,
      padding: 14, display: 'flex', flexDirection: 'column', gap: 8,
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 700, letterSpacing: '-.01em', color: text }}>Live runs feed</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, color: muted2, letterSpacing: '.14em', textTransform: 'uppercase', marginTop: 2 }}>tail -f · t-15min</div>
        </div>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, color: emerald, letterSpacing: '.14em' }}>● follow</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        {lines.map((l, i) => (
          <div key={l.key} style={{
            padding: '6px 10px', borderRadius: 6, background: surface2, border: `1px solid ${line}`,
            display: 'grid', gridTemplateColumns: '60px 6px 1fr auto auto', gap: 8, alignItems: 'center',
            opacity: 1 - i * 0.07,
          }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, color: muted2, letterSpacing: 1 }}>T-{String(i).padStart(2, '0')}m</span>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: l.wf.color }} />
            <span style={{ fontSize: 11.5, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              <span style={{ color: l.wf.color }}>{l.wf.name}</span>
              <span style={{ color: muted, marginLeft: 6 }}>· {l.c.text.slice(0, 48)}{l.c.text.length > 48 ? '…' : ''}</span>
            </span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, color: muted, letterSpacing: 1, flexShrink: 0 }}>{l.dur}s</span>
            <span style={{
              fontFamily: 'var(--font-mono)', fontSize: 9, padding: '2px 6px', borderRadius: 3, flexShrink: 0,
              background: l.ok ? `${emerald}22` : `${rose}22`,
              color: l.ok ? emerald : rose,
              letterSpacing: 1, fontWeight: 800,
            }}>{l.ok ? 'OK 200' : 'FAIL 503'}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

const SERVICES = [
  { id: 'n8n',      label: 'n8n',      desc: '18 wf · 0 stuck',          status: 'Online',    color: emerald },
  { id: 'mcp',      label: 'MCP',      desc: '9 servers · 0 errors',     status: 'Healthy',   color: emerald },
  { id: 'supabase', label: 'Supabase', desc: 'Auth + Postgres + S3',     status: 'Connected', color: emerald },
  { id: 'stripe',   label: 'Stripe',   desc: 'test mode · 12 checkouts', status: 'Sandbox',   color: amber   },
  { id: 'coolify',  label: 'Coolify',  desc: '4 deploys · 0 failed',     status: 'Online',    color: emerald },
  { id: 'nginx',    label: 'Nginx PM', desc: '8 domains · SSL valid',    status: 'Healthy',   color: emerald },
]

function ServiceHealth() {
  return (
    <div style={{
      background: surface, border: `1px solid ${line}`, borderRadius: 14,
      padding: 14, display: 'flex', flexDirection: 'column', gap: 8,
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 700, letterSpacing: '-.01em', color: text }}>Service health</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, color: muted2, letterSpacing: '.14em', textTransform: 'uppercase', marginTop: 2 }}>integrations · live</div>
        </div>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, color: emerald, letterSpacing: '.14em' }}>● 6/6 OK</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        {SERVICES.map(s => (
          <div key={s.id} style={{
            padding: 10, borderRadius: 8,
            background: surface2, border: `1px solid ${line}`,
            display: 'flex', flexDirection: 'column', gap: 4,
            borderLeft: `3px solid ${s.color}`,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: text }}>{s.label}</span>
              <span style={{
                fontFamily: 'var(--font-mono)', fontSize: 9, padding: '2px 6px', borderRadius: 3,
                background: `${s.color}22`, color: s.color, letterSpacing: 1, fontWeight: 700,
                display: 'inline-flex', alignItems: 'center', gap: 4,
              }}>
                <span style={{ width: 5, height: 5, borderRadius: '50%', background: s.color }} />
                {s.status.toUpperCase()}
              </span>
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, color: muted, letterSpacing: '.1em' }}>{s.desc}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

const KPI_LIST = [
  { label: 'Total runs 24h', value: '905',   delta: '+12%',    color: cyan    },
  { label: 'Success rate',   value: '96.4%', delta: '+0.8',    color: emerald },
  { label: 'Avg duration',   value: '1.4s',  delta: '-0.2',    color: violet  },
  { label: 'Queue depth',    value: '3',     delta: '0',       color: amber   },
  { label: 'Workflows',      value: '18',    delta: '2 paused',color: fuchsia },
]

export default function AutomationsPage() {
  const [selectedId, setSelectedId] = useState('validation-loop')
  const [logTick, setLogTick] = useState(0)

  useEffect(() => {
    const id = setInterval(() => setLogTick(t => t + 1), 1200)
    return () => clearInterval(id)
  }, [])

  const selected = WORKFLOWS.find(w => w.id === selectedId) ?? WORKFLOWS[0]

  const headerActions = (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      <button style={{
        padding: '8px 14px', borderRadius: 999,
        background: accent, color: '#0b0d12', border: 'none', cursor: 'pointer',
        fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 12, letterSpacing: '.04em',
      }}>+ New workflow</button>
      {[
        { label: '18 workflows', color: muted },
        { label: 'success 96%',  color: emerald },
        { label: '905 runs/24h', color: cyan },
        { label: '3 queued',     color: muted },
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
    <CkShell breadcrumb="Studio / Automations" title="Automation Center" subtitle="n8n · MCP · Webhooks · Workflows" actions={headerActions}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

        {/* KPI strip */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10 }}>
          {KPI_LIST.map(k => <AuKpi key={k.label} {...k} />)}
        </div>

        {/* DAG + workflows list */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 420px', gap: 14, alignItems: 'start' }}>
          <WorkflowDAG workflow={selected} />
          <WorkflowsList selectedId={selectedId} onSelect={setSelectedId} />
        </div>

        {/* Runs feed + service health */}
        <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 14 }}>
          <RunsFeed tick={logTick} />
          <ServiceHealth />
        </div>
      </div>
    </CkShell>
  )
}
