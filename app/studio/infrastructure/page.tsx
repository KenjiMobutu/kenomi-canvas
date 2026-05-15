'use client'
import { useMemo, useEffect, useState } from 'react'
import { CkShell } from '@/components/CkShell'
import {
  bg, surface, surface2, line, line2, text, muted, muted2,
  accent, emerald, amber, rose, cyan, violet, fuchsia,
} from '@/lib/ck-vars'
import { AGENTS_DATA, makeSpark, sparkPath, useIsMobile } from '@/lib/studio-utils'

const SERVICES_IN = [
  { id: 'proxmox',  label: 'Proxmox VE',  short: 'PROX', status: 'Online',    color: '#34d399', cpu: 42, ram: 58, disk: 31, net: 124, uptime: '32d', role: 'Compute · cluster local',   endpoint: 'proxmox.local' },
  { id: 'coolify',  label: 'Coolify',     short: 'COOL', status: 'Online',    color: '#34d399', cpu: 31, ram: 44, disk: 22, net:  86, uptime: '28d', role: 'Deploy · landings + APIs',  endpoint: 'coolify.local' },
  { id: 'nginx',    label: 'Nginx PM',    short: 'NPM',  status: 'Healthy',   color: '#22d3ee', cpu:  8, ram: 14, disk:  4, net: 412, uptime: '44d', role: 'Proxy · SSL · domains',     endpoint: 'npm.local' },
  { id: 'uptime',   label: 'Uptime Kuma', short: 'UPT',  status: 'Watching',  color: '#a78bfa', cpu:  4, ram:  9, disk:  2, net:  18, uptime: '18d', role: 'Monitor · 38 checks',       endpoint: 'uptime.local' },
  { id: 'vault',    label: 'Vaultwarden', short: 'VLT',  status: 'Ready',     color: '#fbbf24', cpu:  6, ram: 11, disk:  3, net:   4, uptime: '44d', role: 'Secrets · creds · OAuth',   endpoint: 'vault.local' },
  { id: 'supabase', label: 'Supabase',    short: 'SUP',  status: 'Connected', color: '#34d399', cpu: 24, ram: 38, disk: 47, net: 240, uptime: '—',   role: 'Auth · Postgres · Storage', endpoint: 'supabase.com' },
  { id: 'n8n',      label: 'n8n',         short: 'N8N',  status: 'Online',    color: '#e879f9', cpu: 18, ram: 26, disk: 12, net:  98, uptime: '21d', role: 'Automation · 18 wf',        endpoint: 'n8n.local' },
  { id: 'stripe',   label: 'Stripe',      short: 'STR',  status: 'Sandbox',   color: '#fbbf24', cpu:  0, ram:  0, disk:  0, net:  62, uptime: '—',   role: 'Payments · checkout',       endpoint: 'api.stripe.com' },
]

const POSITIONS: Record<string, { x: number; y: number; kind: string }> = {
  proxmox:  { x: 200, y: 240, kind: 'host'     },
  coolify:  { x: 380, y: 100, kind: 'service'  },
  nginx:    { x: 580, y:  80, kind: 'edge'     },
  uptime:   { x: 580, y: 200, kind: 'service'  },
  vault:    { x: 380, y: 240, kind: 'service'  },
  n8n:      { x: 380, y: 380, kind: 'service'  },
  supabase: { x: 720, y: 320, kind: 'external' },
  stripe:   { x: 880, y: 200, kind: 'external' },
}

const TOPO_EDGES: [string, string][] = [
  ['proxmox','coolify'], ['proxmox','vault'], ['proxmox','n8n'],
  ['coolify','nginx'], ['uptime','coolify'], ['uptime','supabase'],
  ['n8n','supabase'], ['n8n','stripe'], ['coolify','supabase'], ['nginx','supabase'],
]

const EVENT_SAMPLES = [
  'Coolify deploy succeeded · sha 8af31c',
  'Nginx PM cert renewed · forms.kenomi.studio',
  'Uptime check OK · uptime.local',
  'n8n workflow finished · 0.4s',
  'Vaultwarden cred rotated · stripe-test',
  'Supabase RLS policy updated · ventures',
  'Stripe webhook received · checkout.completed',
  'Proxmox cluster heartbeat · 3/3 online',
  'Disk usage warning · proxmox-02 78%',
  'Backup job started · supabase pg_dump',
]
const EVENT_LEVELS = [
  { lvl: 'INFO',  color: emerald },
  { lvl: 'INFO',  color: emerald },
  { lvl: 'INFO',  color: emerald },
  { lvl: 'WARN',  color: amber   },
  { lvl: 'INFO',  color: emerald },
  { lvl: 'ERROR', color: rose    },
  { lvl: 'INFO',  color: emerald },
]

const DEPLOYS = [
  { name: 'forms.kenomi.studio', sha: '8af31c', status: 'deployed', color: emerald, time: '12m ago',   agent: 'builder'  },
  { name: 'cfo.kenomi.studio',   sha: '2e7d44', status: 'deployed', color: emerald, time: '1h ago',    agent: 'builder'  },
  { name: 'legal.kenomi.studio', sha: '9c1ab0', status: 'failed',   color: rose,    time: '3h ago',    agent: 'builder'  },
  { name: 'uptime.local',        sha: '44ee21', status: 'deployed', color: emerald, time: 'yesterday', agent: 'decision' },
]

type ServiceIn = typeof SERVICES_IN[0]

function InfraKpi({ label, value, delta, color }: { label: string; value: string; delta: string; color: string }) {
  const spark = useMemo(() => makeSpark(28, 40, 14, label.length * 7), [label])
  return (
    <div style={{ background: surface, border: `1px solid ${line}`, borderRadius: 12, padding: 12, position: 'relative', overflow: 'hidden' }}>
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

function ArcGauge({ label, value, max, color, unit }: { label: string; value: number; max: number; color: string; unit?: string }) {
  const pct = Math.min(1, value / max)
  const c = Math.PI * 28
  return (
    <div style={{ padding: 10, borderRadius: 10, background: surface2, border: `1px solid ${line}`, display: 'flex', alignItems: 'center', gap: 10 }}>
      <div style={{ position: 'relative', width: 60, height: 38, flexShrink: 0 }}>
        <svg width="60" height="38" viewBox="0 0 60 38">
          <path d="M5 33 A25 25 0 0 1 55 33" fill="none" stroke={line2} strokeWidth="5" strokeLinecap="round" />
          <path d="M5 33 A25 25 0 0 1 55 33" fill="none" stroke={color} strokeWidth="5" strokeLinecap="round"
            strokeDasharray={`${pct * c} ${c}`} />
        </svg>
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, color }}>
          {value}{unit ?? '%'}
        </div>
      </div>
      <div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: muted, letterSpacing: '.14em', textTransform: 'uppercase' }}>{label}</div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, color: muted2, letterSpacing: '.1em', marginTop: 2 }}>{Math.round(pct * 100)}% of {max}{unit ?? ''}</div>
      </div>
    </div>
  )
}

function InfraStat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{ padding: '5px 8px', borderRadius: 6, background: surface2, border: `1px solid ${line}` }}>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8.5, color: muted2, letterSpacing: '.14em', textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 700, color, marginTop: 1 }}>{value}</div>
    </div>
  )
}

function TopologyGraph({ selectedId, onSelect }: { selectedId: string; onSelect: (id: string) => void }) {
  return (
    <div style={{
      background: surface, border: `1px solid ${line}`, borderRadius: 14,
      position: 'relative', overflow: 'hidden', minHeight: 400,
    }}>
      <div style={{ position: 'absolute', top: 14, left: 16, zIndex: 2 }}>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 700, letterSpacing: '-.01em', color: text }}>Service topology</div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, color: muted2, letterSpacing: '.14em', textTransform: 'uppercase', marginTop: 2 }}>self-host + external · click un nœud</div>
      </div>
      <div style={{ position: 'absolute', top: 14, right: 16, zIndex: 2, display: 'flex', gap: 6 }}>
        {[{ dot: '#34d399', label: 'self-host' }, { dot: '#a78bfa', label: 'external' }].map(l => (
          <span key={l.label} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 8px', borderRadius: 4, background: surface2, border: `1px solid ${line}` }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: l.dot }} />
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: muted, letterSpacing: '.1em', textTransform: 'uppercase' }}>{l.label}</span>
          </span>
        ))}
      </div>

      <svg width="100%" height="100%" viewBox="0 0 1000 460" preserveAspectRatio="xMidYMid meet" style={{ minHeight: 400 }}>
        <defs>
          <filter id="inGlow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="2" />
          </filter>
        </defs>

        {TOPO_EDGES.map(([from, to], idx) => {
          const f = POSITIONS[from], t = POSITIONS[to]
          const fSvc = SERVICES_IN.find(s => s.id === from)
          if (!f || !t || !fSvc) return null
          const offset = (idx * 0.17) % 1
          return (
            <g key={idx}>
              <line x1={f.x} y1={f.y} x2={t.x} y2={t.y} stroke={fSvc.color} strokeOpacity=".25" strokeWidth="1.4" strokeDasharray="2 6" />
              <circle r="3" fill={fSvc.color} filter="url(#inGlow)">
                <animate attributeName="cx" from={f.x.toString()} to={t.x.toString()} dur={`${2 + idx % 3}s`} begin={`${-offset * 2}s`} repeatCount="indefinite" />
                <animate attributeName="cy" from={f.y.toString()} to={t.y.toString()} dur={`${2 + idx % 3}s`} begin={`${-offset * 2}s`} repeatCount="indefinite" />
              </circle>
            </g>
          )
        })}

        <rect x="120" y="40" width="380" height="380" rx="14" fill="none" stroke={line} strokeWidth="1.5" strokeDasharray="6 6" />
        <text x="130" y="58" fontSize="10" fill={muted} fontFamily="var(--font-mono)" letterSpacing="2">SELF-HOST · PROXMOX CLUSTER</text>

        {SERVICES_IN.map(svc => {
          const pos = POSITIONS[svc.id]
          if (!pos) return null
          const isSel = svc.id === selectedId
          const isHost = pos.kind === 'host'
          const isExternal = pos.kind === 'external'
          const r = isHost ? 38 : 26
          return (
            <g key={svc.id} transform={`translate(${pos.x}, ${pos.y})`} style={{ cursor: 'pointer' }} onClick={() => onSelect(svc.id)}>
              {isSel && <circle r={r + 8} fill="none" stroke={svc.color} strokeOpacity=".5" strokeWidth="1.5" />}
              {isExternal ? (
                <rect x={-r} y={-r} width={r * 2} height={r * 2} rx="6" fill={surface2} stroke={svc.color} strokeOpacity={isSel ? 1 : .7} strokeWidth={isSel ? 2 : 1.4} strokeDasharray="4 3" />
              ) : (
                <circle r={r} fill={surface2} stroke={svc.color} strokeOpacity={isSel ? 1 : .7} strokeWidth={isSel ? 2 : 1.4} />
              )}
              {isHost && <circle r={r - 6} fill="none" stroke={svc.color} strokeOpacity=".3" strokeDasharray="2 4" />}
              <text textAnchor="middle" y="-2" fontSize={isHost ? '10' : '9'} fill={svc.color} fontFamily="var(--font-mono)" letterSpacing="1.4" fontWeight="700">{svc.short}</text>
              <text textAnchor="middle" y={isHost ? 12 : 10} fontSize="9" fill={text} fontFamily="var(--font-display)" fontWeight="600">{svc.label}</text>
              <circle cx={r * 0.7} cy={-r * 0.7} r="4" fill={svc.color}>
                <animate attributeName="opacity" values=".5;1;.5" dur="2s" repeatCount="indefinite" />
              </circle>
            </g>
          )
        })}
      </svg>

      <div style={{ position: 'absolute', left: 16, bottom: 12, display: 'flex', gap: 14, fontFamily: 'var(--font-mono)', fontSize: 9, color: muted2, letterSpacing: '.14em' }}>
        <span>NODES <b style={{ color: text }}>{Object.keys(POSITIONS).length}</b></span>
        <span>EDGES <b style={{ color: text }}>{TOPO_EDGES.length}</b></span>
        <span>LATENCY <b style={{ color: cyan }}>12ms p95</b></span>
        <span>THROUGHPUT <b style={{ color: emerald }}>412 Mb/s</b></span>
      </div>
    </div>
  )
}

function ServiceInspector({ svc }: { svc: ServiceIn }) {
  return (
    <div style={{
      background: surface, border: `1px solid ${line}`, borderRadius: 14,
      padding: 16, display: 'flex', flexDirection: 'column', gap: 12,
      borderLeft: `3px solid ${svc.color}`,
    }}>
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: svc.color, letterSpacing: '.14em', textTransform: 'uppercase', fontWeight: 700 }}>Service · {svc.short}</span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, padding: '3px 8px', borderRadius: 4, background: `${svc.color}22`, color: svc.color, letterSpacing: 1.5, fontWeight: 800 }}>{svc.status.toUpperCase()}</span>
        </div>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 800, letterSpacing: '-.02em', marginTop: 4, color: text }}>{svc.label}</div>
        <div style={{ fontSize: 12, color: muted, marginTop: 4 }}>{svc.role}</div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, color: muted2, letterSpacing: '.14em', marginTop: 6 }}>→ {svc.endpoint}</div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <ArcGauge label="CPU"  value={svc.cpu}  max={100} color={cyan} />
        <ArcGauge label="RAM"  value={svc.ram}  max={100} color={emerald} />
        <ArcGauge label="Disk" value={svc.disk} max={100} color={violet} />
        <ArcGauge label="Net"  value={svc.net}  max={500} color={amber} unit="Mb" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
        <InfraStat label="Uptime"   value={svc.uptime} color={emerald} />
        <InfraStat label="Latency"  value="12ms"       color={cyan} />
        <InfraStat label="Restarts" value="0"          color={violet} />
      </div>

      <div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: muted, letterSpacing: '.14em', textTransform: 'uppercase', marginBottom: 6 }}>Derniers events</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {[
            { t: '12:42', lvl: 'INFO', msg: 'Health check ok · 12ms' },
            { t: '12:30', lvl: 'INFO', msg: 'Auto-renew SSL · 27d left' },
            { t: '10:18', lvl: 'WARN', msg: 'Memory soft limit 80%' },
            { t: '09:02', lvl: 'INFO', msg: 'Backup completed · 124MB' },
          ].map((e, i) => (
            <div key={i} style={{
              display: 'grid', gridTemplateColumns: '44px 50px 1fr', gap: 6, alignItems: 'center',
              padding: '3px 6px', borderRadius: 4, background: surface2, border: `1px solid ${line}`,
            }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, color: muted2, letterSpacing: 1 }}>{e.t}</span>
              <span style={{
                fontFamily: 'var(--font-mono)', fontSize: 9, padding: '1px 5px', borderRadius: 3, letterSpacing: 1, textAlign: 'center', fontWeight: 700,
                background: e.lvl === 'WARN' ? `${amber}22` : `${emerald}22`,
                color:      e.lvl === 'WARN' ? amber : emerald,
              }}>{e.lvl}</span>
              <span style={{ fontSize: 10.5, color: text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.msg}</span>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 6, marginTop: 'auto' }}>
        <button style={{
          flex: 1, padding: '9px 12px', borderRadius: 8,
          background: svc.color, color: '#0b0d12', border: 'none',
          fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 11.5, letterSpacing: '.06em', cursor: 'pointer',
        }}>↗ OUVRIR · {svc.endpoint}</button>
        <button style={{
          padding: '9px 12px', borderRadius: 8,
          background: surface2, color: text, border: `1px solid ${line2}`,
          fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 10, letterSpacing: '.14em', cursor: 'pointer',
        }}>RESTART</button>
      </div>
    </div>
  )
}

function RackSlot({ svc, active, onClick }: { svc: ServiceIn; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{
      textAlign: 'left', padding: '5px 8px', borderRadius: 4,
      background: active ? `${svc.color}16` : bg,
      border: active ? `1px solid ${svc.color}` : `1px solid ${line}`,
      display: 'grid', gridTemplateColumns: 'auto auto 1fr auto auto auto', gap: 8, alignItems: 'center',
      cursor: 'pointer', minHeight: 22,
    }}>
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: svc.color, boxShadow: `0 0 6px ${svc.color}` }} />
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: svc.color, letterSpacing: 1, fontWeight: 800 }}>{svc.short}</span>
      <span style={{ fontSize: 10.5, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: text }}>{svc.label}</span>
      <div style={{ width: 30, height: 4, borderRadius: 2, background: surface2, overflow: 'hidden' }}>
        <div style={{ width: `${svc.cpu}%`, height: '100%', background: cyan }} />
      </div>
      <div style={{ width: 30, height: 4, borderRadius: 2, background: surface2, overflow: 'hidden' }}>
        <div style={{ width: `${svc.ram}%`, height: '100%', background: emerald }} />
      </div>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: muted2, letterSpacing: 1 }}>1U</span>
    </button>
  )
}

function ServerRack({ selectedId, onSelect }: { selectedId: string; onSelect: (id: string) => void }) {
  const racks = [
    { label: 'RACK-01', host: 'lan-01', svcs: SERVICES_IN.slice(0, 3) },
    { label: 'RACK-02', host: 'lan-02', svcs: SERVICES_IN.slice(3, 6) },
    { label: 'RACK-03', host: 'cloud',  svcs: SERVICES_IN.slice(6)    },
  ]
  return (
    <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
      {racks.map(rack => (
        <div key={rack.label} style={{
          background: surface2, border: `1px solid ${line}`, borderRadius: 10,
          padding: 8, display: 'flex', flexDirection: 'column', gap: 5,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: muted, letterSpacing: '.18em', textTransform: 'uppercase', fontWeight: 700 }}>{rack.label}</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 8.5, color: muted2, letterSpacing: '.14em' }}>{rack.host}</span>
          </div>
          <div style={{ height: 4, borderRadius: 2, background: bg, border: `1px solid ${line}` }} />
          {rack.svcs.map(svc => (
            <RackSlot key={svc.id} svc={svc} active={svc.id === selectedId} onClick={() => onSelect(svc.id)} />
          ))}
          {Array.from({ length: 3 - rack.svcs.length + 1 }).map((_, i) => (
            <div key={i} style={{ height: 16, borderRadius: 2, background: bg, border: `1px dashed ${line}` }} />
          ))}
        </div>
      ))}
    </div>
  )
}

function EventLog({ tick }: { tick: number }) {
  const events = useMemo(() => Array.from({ length: 10 }).map((_, i) => {
    const L = EVENT_LEVELS[(tick + i * 3) % EVENT_LEVELS.length]
    const s = EVENT_SAMPLES[(tick + i) % EVENT_SAMPLES.length]
    return { id: `${tick}-${i}`, ...L, msg: s }
  }), [tick])

  return (
    <div style={{ background: surface, border: `1px solid ${line}`, borderRadius: 14, padding: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 700, letterSpacing: '-.01em', color: text }}>Event log · sys</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, color: muted2, letterSpacing: '.14em', textTransform: 'uppercase', marginTop: 2 }}>journalctl · follow</div>
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          {['ALL', 'INFO', 'WARN', 'ERROR'].map((f, i) => (
            <span key={f} style={{
              fontFamily: 'var(--font-mono)', fontSize: 9, padding: '3px 7px', borderRadius: 3, letterSpacing: '.14em',
              background: i === 0 ? surface2 : 'transparent',
              color: i === 0 ? text : muted2,
              border: `1px solid ${line}`, textTransform: 'uppercase',
            }}>{f}</span>
          ))}
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3, fontFamily: 'var(--font-mono)' }}>
        {events.map((e, i) => {
          const ts = new Date(Date.now() - i * 9200).toISOString().slice(11, 19)
          return (
            <div key={e.id} style={{
              display: 'grid', gridTemplateColumns: '78px 56px 1fr', gap: 8, alignItems: 'center',
              fontSize: 11, opacity: 1 - i * 0.06,
            }}>
              <span style={{ color: muted2 }}>{ts}</span>
              <span style={{ color: e.color, textAlign: 'center', fontWeight: 700, letterSpacing: 1, background: `${e.color}1a`, borderRadius: 3, padding: '1px 4px' }}>{e.lvl}</span>
              <span style={{ color: text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.msg}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function DeploysPanel() {
  return (
    <div style={{ background: surface, border: `1px solid ${line}`, borderRadius: 14, padding: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 700, letterSpacing: '-.01em', color: text }}>Recent deploys</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, color: muted2, letterSpacing: '.14em', textTransform: 'uppercase', marginTop: 2 }}>coolify · last 24h</div>
        </div>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, color: emerald, letterSpacing: '.14em' }}>3/4 ok</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {DEPLOYS.map((d, i) => {
          const a = AGENTS_DATA.find(ag => ag.id === d.agent) ?? AGENTS_DATA[0]
          return (
            <div key={i} style={{
              padding: '8px 10px', borderRadius: 8, background: surface2, border: `1px solid ${line}`,
              display: 'grid', gridTemplateColumns: 'auto 1fr auto auto', gap: 8, alignItems: 'center',
              borderLeft: `3px solid ${d.color}`,
            }}>
              <span style={{
                width: 22, height: 22, borderRadius: 5, border: `1px solid ${a.color}`,
                background: `${a.color}10`,
                display: 'grid', placeItems: 'center',
                fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 12, color: a.color, flexShrink: 0,
              }}>{a.sigil}</span>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 11.5, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: text }}>{d.name}</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: muted2, letterSpacing: 1, marginTop: 2 }}>{d.sha} · {d.time}</div>
              </div>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, padding: '2px 6px', borderRadius: 3, background: `${d.color}22`, color: d.color, letterSpacing: 1, fontWeight: 700, flexShrink: 0 }}>{d.status.toUpperCase()}</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: muted, letterSpacing: 1, flexShrink: 0 }}>{a.code}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

const KPI_LIST = [
  { label: 'CPU avg',     value: '22%',    delta: '4 core idle',  color: cyan    },
  { label: 'RAM avg',     value: '38%',    delta: '12 GB free',   color: emerald },
  { label: 'Network I/O', value: '412Mb',  delta: '+18%',         color: violet  },
  { label: 'Containers',  value: '32',     delta: '0 unhealthy',  color: amber   },
  { label: 'Uptime',      value: '99.94%', delta: '30d',          color: fuchsia },
]

export default function InfrastructurePage() {
  const [selectedId, setSelectedId] = useState('proxmox')
  const [logTick, setLogTick] = useState(0)
  const isMobile = useIsMobile()

  useEffect(() => {
    const id = setInterval(() => setLogTick(t => t + 1), 1400)
    return () => clearInterval(id)
  }, [])

  const selected = SERVICES_IN.find(s => s.id === selectedId) ?? SERVICES_IN[0]

  const headerActions = (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      <button style={{
        padding: '8px 14px', borderRadius: 999,
        background: accent, color: '#0b0d12', border: 'none', cursor: 'pointer',
        fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 12, letterSpacing: '.04em',
      }}>+ Add service</button>
      {[
        { label: '8 services',         color: muted   },
        { label: 'all healthy',        color: emerald },
        { label: 'uptime 99.94%',      color: cyan    },
        { label: 'self-host · Proxmox',color: muted   },
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
    <CkShell breadcrumb="Studio / Infrastructure" title="Infrastructure Control" subtitle="Proxmox · Coolify · Docker · Supabase" actions={headerActions}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

        {/* KPI strip */}
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(5, 1fr)', gap: 10 }}>
          {KPI_LIST.map(k => <InfraKpi key={k.label} {...k} />)}
        </div>

        {/* Topology + Service inspector */}
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 400px', gap: 14, alignItems: 'start' }}>
          {!isMobile && <TopologyGraph selectedId={selectedId} onSelect={setSelectedId} />}
          <ServiceInspector svc={selected} />
        </div>

        {/* Server rack */}
        <div style={{ background: surface, border: `1px solid ${line}`, borderRadius: 14, padding: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
            <div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 700, letterSpacing: '-.01em', color: text }}>Server rack · self-host</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, color: muted2, letterSpacing: '.14em', textTransform: 'uppercase', marginTop: 2 }}>proxmox cluster · 3 hosts · 8 services</div>
            </div>
            {!isMobile && (
              <div style={{ display: 'flex', gap: 6 }}>
                {[{ l: 'CPU 22%' }, { l: 'RAM 38%' }, { l: 'DISK 31%' }].map(({ l }) => (
                  <span key={l} style={{ fontFamily: 'var(--font-mono)', fontSize: 9, padding: '3px 7px', borderRadius: 3, background: surface2, border: `1px solid ${line}`, color: muted, letterSpacing: '.14em' }}>{l}</span>
                ))}
              </div>
            )}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)', gap: 14 }}>
            {[
              { label: 'RACK-01', host: 'lan-01', svcs: SERVICES_IN.slice(0, 3) },
              { label: 'RACK-02', host: 'lan-02', svcs: SERVICES_IN.slice(3, 6) },
              { label: 'RACK-03', host: 'cloud',  svcs: SERVICES_IN.slice(6)    },
            ].map(rack => (
              <div key={rack.label} style={{
                background: surface2, border: `1px solid ${line}`, borderRadius: 10,
                padding: 8, display: 'flex', flexDirection: 'column', gap: 5,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: muted, letterSpacing: '.18em', textTransform: 'uppercase', fontWeight: 700 }}>{rack.label}</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 8.5, color: muted2, letterSpacing: '.14em' }}>{rack.host}</span>
                </div>
                <div style={{ height: 4, borderRadius: 2, background: bg, border: `1px solid ${line}` }} />
                {rack.svcs.map(svc => (
                  <button key={svc.id} onClick={() => setSelectedId(svc.id)} style={{
                    textAlign: 'left', padding: '5px 8px', borderRadius: 4,
                    background: svc.id === selectedId ? `${svc.color}16` : bg,
                    border: svc.id === selectedId ? `1px solid ${svc.color}` : `1px solid ${line}`,
                    display: 'grid', gridTemplateColumns: 'auto auto 1fr auto auto auto', gap: 8, alignItems: 'center',
                    cursor: 'pointer', minHeight: 22,
                  }}>
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: svc.color, boxShadow: `0 0 6px ${svc.color}` }} />
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: svc.color, letterSpacing: 1, fontWeight: 800 }}>{svc.short}</span>
                    <span style={{ fontSize: 10.5, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: text }}>{svc.label}</span>
                    <div style={{ width: 30, height: 4, borderRadius: 2, background: surface2, overflow: 'hidden' }}>
                      <div style={{ width: `${svc.cpu}%`, height: '100%', background: cyan }} />
                    </div>
                    <div style={{ width: 30, height: 4, borderRadius: 2, background: surface2, overflow: 'hidden' }}>
                      <div style={{ width: `${svc.ram}%`, height: '100%', background: emerald }} />
                    </div>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: muted2, letterSpacing: 1 }}>1U</span>
                  </button>
                ))}
                {Array.from({ length: 3 - rack.svcs.length + 1 }).map((_, i) => (
                  <div key={i} style={{ height: 16, borderRadius: 2, background: bg, border: `1px dashed ${line}` }} />
                ))}
              </div>
            ))}
          </div>
        </div>

        {/* Event log + Deploys */}
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1.4fr 1fr', gap: 14 }}>
          <EventLog tick={logTick} />
          <DeploysPanel />
        </div>
      </div>
    </CkShell>
  )
}
