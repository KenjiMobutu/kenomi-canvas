'use client'
import { useMemo, useEffect, useState } from 'react'
import { CkShell } from '@/components/CkShell'
import {
  bg, surface, surface2, line, line2, text, muted, muted2,
  accent, emerald, amber, rose, cyan, violet, fuchsia,
} from '@/lib/ck-vars'
import { AGENTS_DATA, makeSpark, sparkPath, useIsMobile } from '@/lib/studio-utils'

// Services de l'infra — statuts alimentés par /api/studio/services/health
const SERVICES_IN = [
  { id: 'proxmox',  vmid: null, label: 'Proxmox VE',  short: 'PROX', color: '#34d399', role: 'Compute · cluster local',   endpointLabel: 'proxmox.local', healthKey: null       },
  { id: 'coolify',  vmid: 102,  label: 'Coolify',     short: 'COOL', color: '#34d399', role: 'Deploy · landings + APIs',  endpointLabel: 'private',      healthKey: 'coolify'  },
  { id: 'nginx',    vmid: 101,  label: 'Nginx PM',    short: 'NPM',  color: '#22d3ee', role: 'Proxy · SSL · domains',     endpointLabel: 'npm.local',    healthKey: null       },
  { id: 'uptime',   vmid: null, label: 'Uptime Kuma', short: 'UPT',  color: '#a78bfa', role: 'Monitor',                   endpointLabel: 'uptime.local', healthKey: null       },
  { id: 'vault',    vmid: 100,  label: 'Vaultwarden', short: 'VLT',  color: '#fbbf24', role: 'Secrets · creds · OAuth',   endpointLabel: 'vault.local',  healthKey: null       },
  { id: 'supabase', vmid: null, label: 'Supabase',    short: 'SUP',  color: '#34d399', role: 'Auth · Postgres · Storage', endpointLabel: 'supabase.kenomi.eu', healthKey: 'supabase'},
  { id: 'n8n',      vmid: null, label: 'n8n',         short: 'N8N',  color: '#e879f9', role: 'Automation',                endpointLabel: 'n8n.kenomi.eu', healthKey: 'n8n'      },
  { id: 'ollama',   vmid: null, label: 'Ollama',      short: 'OLL',  color: '#fb923c', role: 'LLM · inference locale',    endpointLabel: 'private',      healthKey: 'ollama'  },
]

const POSITIONS: Record<string, { x: number; y: number; kind: string }> = {
  proxmox:  { x: 200, y: 240, kind: 'host'     },
  coolify:  { x: 380, y: 100, kind: 'service'  },
  nginx:    { x: 580, y:  80, kind: 'edge'     },
  uptime:   { x: 580, y: 200, kind: 'service'  },
  vault:    { x: 380, y: 240, kind: 'service'  },
  n8n:      { x: 380, y: 380, kind: 'service'  },
  supabase: { x: 720, y: 320, kind: 'external' },
  ollama:   { x: 720, y: 160, kind: 'external' },
}

const TOPO_EDGES: [string, string][] = [
  ['proxmox','coolify'], ['proxmox','vault'], ['proxmox','n8n'],
  ['coolify','nginx'], ['uptime','coolify'], ['uptime','supabase'],
  ['n8n','supabase'], ['coolify','supabase'], ['nginx','supabase'],
  ['coolify','ollama'], ['n8n','ollama'],
]

type HealthResult = { ok: boolean; latencyMs: number }
type HealthServices = { ollama: HealthResult; n8n: HealthResult; supabase: HealthResult; coolify: HealthResult }
type HealthData = HealthServices & { _meta?: { llm?: { fallback_active: boolean } } }

type ProxmoxNode = {
  node: string
  cpu_pct: number
  mem_pct: number
  mem_used_fmt: string
  mem_total_fmt: string
  disk_pct: number
  disk_used_fmt: string
  disk_total_fmt: string
  uptime_fmt: string
  status: string
}
type ProxmoxVM = {
  vmid: number
  name: string
  status: 'running' | 'stopped' | 'paused'
  type: 'qemu' | 'lxc'
  cpu_pct: number
  mem_pct: number
  disk_pct: number
  mem_fmt: string
  maxmem_fmt: string
  disk_used_fmt: string
  maxdisk_fmt: string
  uptime_fmt: string
  netin: number
  netout: number
}
type ProxmoxData = { nodes: ProxmoxNode[]; vms: ProxmoxVM[]; fetched_at: string }
type ServiceIn = typeof SERVICES_IN[0]

function statusColor(ok: boolean | null): string {
  if (ok === null) return amber
  return ok ? emerald : rose
}

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
          {value === 0 ? '—' : `${value}${unit ?? '%'}`}
        </div>
      </div>
      <div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: muted, letterSpacing: '.14em', textTransform: 'uppercase' }}>{label}</div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, color: muted2, letterSpacing: '.1em', marginTop: 2 }}>
          {value === 0 ? 'non disponible' : `${Math.round(pct * 100)}% of ${max}${unit ?? ''}`}
        </div>
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

function TopologyGraph({ selectedId, onSelect, health }: { selectedId: string; onSelect: (id: string) => void; health: HealthData | null }) {
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
          const hk = fSvc.healthKey as keyof HealthServices | null
          const isLive = hk && health ? health[hk]?.ok : true
          const offset = (idx * 0.17) % 1
          return (
            <g key={idx}>
              <line x1={f.x} y1={f.y} x2={t.x} y2={t.y} stroke={isLive ? fSvc.color : rose} strokeOpacity=".25" strokeWidth="1.4" strokeDasharray="2 6" />
              {isLive && (
                <circle r="3" fill={fSvc.color} filter="url(#inGlow)">
                  <animate attributeName="cx" from={f.x.toString()} to={t.x.toString()} dur={`${2 + idx % 3}s`} begin={`${-offset * 2}s`} repeatCount="indefinite" />
                  <animate attributeName="cy" from={f.y.toString()} to={t.y.toString()} dur={`${2 + idx % 3}s`} begin={`${-offset * 2}s`} repeatCount="indefinite" />
                </circle>
              )}
            </g>
          )
        })}

        <rect x="120" y="40" width="380" height="380" rx="14" fill="none" stroke={line} strokeWidth="1.5" strokeDasharray="6 6" />
        <text x="130" y="58" fontSize="10" fill={muted} fontFamily="var(--font-mono)" letterSpacing="2">SELF-HOST · PROXMOX CLUSTER</text>

        {SERVICES_IN.filter(s => POSITIONS[s.id]).map(svc => {
          const pos = POSITIONS[svc.id]
          if (!pos) return null
          const isSel = svc.id === selectedId
          const isHost = pos.kind === 'host'
          const isExternal = pos.kind === 'external'
          const hk = svc.healthKey as keyof HealthServices | null
          const isLive = hk && health ? health[hk]?.ok : null
          const dotColor = statusColor(isLive)
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
              {/* status dot */}
              <circle cx={r * 0.7} cy={-r * 0.7} r="4" fill={dotColor}>
                {isLive && <animate attributeName="opacity" values=".5;1;.5" dur="2s" repeatCount="indefinite" />}
              </circle>
            </g>
          )
        })}
      </svg>

      <div style={{ position: 'absolute', left: 16, bottom: 12, display: 'flex', gap: 14, fontFamily: 'var(--font-mono)', fontSize: 9, color: muted2, letterSpacing: '.14em' }}>
        <span>NODES <b style={{ color: text }}>{Object.keys(POSITIONS).length}</b></span>
        <span>EDGES <b style={{ color: text }}>{TOPO_EDGES.length}</b></span>
        {health && (
          <span>SERVICES UP <b style={{ color: emerald }}>
            {[health.ollama, health.n8n, health.supabase, health.coolify].filter(h => h?.ok).length}/4
          </b></span>
        )}
      </div>
    </div>
  )
}

function ServiceInspector({ svc, health, proxmox }: { svc: ServiceIn; health: HealthData | null; proxmox: ProxmoxData | null }) {
  const hk = svc.healthKey as keyof HealthServices | null
  const result = hk && health ? health[hk] : null

  // Résolution des métriques selon le type de service
  const isProxmoxNode = svc.id === 'proxmox'
  const pxNode = isProxmoxNode ? (proxmox?.nodes[0] ?? null) : null
  const vm = svc.vmid != null ? (proxmox?.vms.find(v => v.vmid === svc.vmid) ?? null) : null
  const hasMetrics = isProxmoxNode ? pxNode !== null : vm !== null

  // Statut : Ollama → _meta.llm.fallback_active (seule source fiable en prod)
  // Autres avec healthKey → health check direct
  // Sans healthKey → dérivé des métriques Proxmox
  const isOllama = svc.id === 'ollama'
  const isLiveFromHealth = isOllama
    ? (health?._meta?.llm != null ? !health._meta.llm.fallback_active : null)
    : (result?.ok ?? null)
  const isLiveFromProxmox = isProxmoxNode
    ? (pxNode ? pxNode.status === 'online' : null)
    : (vm ? vm.status === 'running' : null)
  const isLive = isLiveFromHealth ?? isLiveFromProxmox
  const latency = result?.latencyMs ?? null
  const statusLabel = isLive === null ? '—' : isLive ? 'ONLINE' : 'OFFLINE'
  const statusCol = statusColor(isLive)

  // Valeurs des jauges
  const cpuPct    = isProxmoxNode ? (pxNode?.cpu_pct  ?? 0) : (vm?.cpu_pct  ?? 0)
  const memPct    = isProxmoxNode ? (pxNode?.mem_pct  ?? 0) : (vm?.mem_pct  ?? 0)
  const diskPct   = isProxmoxNode ? (pxNode?.disk_pct ?? 0) : (vm?.disk_pct ?? 0)
  const uptimeFmt = isProxmoxNode ? (pxNode?.uptime_fmt ?? '—') : (vm?.uptime_fmt ?? '—')

  // 4ème jauge : VMs actives pour le nœud, Net I/O (Mo) pour les VMs
  const vmRunning = proxmox ? proxmox.vms.filter(v => v.status === 'running').length : 0
  const vmTotal   = proxmox?.vms.length ?? 1
  const netMo     = vm ? Math.round((vm.netin + vm.netout) / 1_048_576) : 0
  const netMax    = 10_000

  const isMonitored = hk ? true : hasMetrics

  return (
    <div style={{
      background: surface, border: `1px solid ${line}`, borderRadius: 14,
      padding: 16, display: 'flex', flexDirection: 'column', gap: 12,
      borderLeft: `3px solid ${svc.color}`,
    }}>
      {/* Header */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: svc.color, letterSpacing: '.14em', textTransform: 'uppercase', fontWeight: 700 }}>Service · {svc.short}</span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, padding: '3px 8px', borderRadius: 4, background: `${statusCol}22`, color: statusCol, letterSpacing: 1.5, fontWeight: 800 }}>{statusLabel}</span>
        </div>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 800, letterSpacing: '-.02em', marginTop: 4, color: text }}>{svc.label}</div>
        <div style={{ fontSize: 12, color: muted, marginTop: 4 }}>{svc.role}</div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, color: muted2, letterSpacing: '.14em', marginTop: 6 }}>→ {svc.endpointLabel}</div>
      </div>

      {/* Jauges — affichées uniquement si métriques disponibles */}
      {hasMetrics && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <ArcGauge label="CPU"  value={cpuPct}  max={100} color={cyan} />
          <ArcGauge label="RAM"  value={memPct}  max={100} color={emerald} />
          <ArcGauge label="Disk" value={diskPct} max={100} color={violet} />
          {isProxmoxNode
            ? <ArcGauge label="VMs"  value={vmRunning} max={Math.max(vmTotal, 1)} color={amber} unit="" />
            : <ArcGauge label="Net"  value={netMo}     max={netMax}              color={fuchsia} unit="Mo" />
          }
        </div>
      )}

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
        <InfraStat label="Uptime"    value={hasMetrics ? uptimeFmt : '—'}             color={emerald} />
        <InfraStat label="Latency"   value={latency !== null ? `${latency}ms` : '—'}  color={cyan}    />
        <InfraStat label="Monitored" value={isMonitored ? 'oui' : 'non'}              color={isMonitored ? emerald : muted} />
      </div>

      {/* Warning si aucune métrique */}
      {!hasMetrics && !hk && (
        <div style={{ padding: '10px 12px', borderRadius: 8, background: `${amber}12`, border: `1px solid ${amber}33`, fontSize: 11, color: amber, fontFamily: 'var(--font-mono)' }}>
          ⚠ Aucune métrique · service non hébergé sur Proxmox
        </div>
      )}

      {/* Actions */}
      <div style={{ display: 'flex', gap: 6, marginTop: 'auto' }}>
        <button style={{
          flex: 1, padding: '9px 12px', borderRadius: 8,
          background: svc.color, color: '#0b0d12', border: 'none',
          fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 11.5, letterSpacing: '.06em', cursor: 'pointer',
        }}>↗ {svc.endpointLabel}</button>
        <button style={{
          padding: '9px 12px', borderRadius: 8,
          background: surface2, color: text, border: `1px solid ${line2}`,
          fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 10, letterSpacing: '.14em', cursor: 'pointer',
        }}>RESTART</button>
      </div>
    </div>
  )
}

function EventLog() {
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
      <div style={{ padding: '24px 16px', textAlign: 'center' }}>
        <p style={{ fontSize: 12, color: muted2 }}>Aucun événement · configurez votre monitoring</p>
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
      </div>
      <div style={{ padding: '24px 16px', textAlign: 'center' }}>
        <p style={{ fontSize: 12, color: muted2 }}>Configurez <b style={{ color: text }}>COOLIFY_API_TOKEN</b> pour voir les déploiements</p>
      </div>
    </div>
  )
}

export default function InfrastructurePage() {
  const [selectedId, setSelectedId] = useState('coolify')
  const [health, setHealth] = useState<HealthData | null>(null)
  const [healthLoading, setHealthLoading] = useState(true)
  const [proxmox, setProxmox] = useState<ProxmoxData | null>(null)
  const isMobile = useIsMobile()

  useEffect(() => {
    let cancelled = false
    async function loadHealth() {
      setHealthLoading(true)
      try {
        const res = await fetch('/api/studio/services/health')
        if (!res.ok) return
        const data = await res.json() as HealthData
        if (!cancelled) setHealth(data)
      } finally {
        if (!cancelled) setHealthLoading(false)
      }
    }
    async function loadProxmox() {
      try {
        const res = await fetch('/api/studio/infra/proxmox')
        if (!res.ok) return
        const data = await res.json() as ProxmoxData
        if (!cancelled) setProxmox(data)
      } catch { /* Proxmox indisponible — silencieux */ }
    }
    loadHealth()
    loadProxmox()
    const interval = setInterval(() => { loadHealth(); loadProxmox() }, 30_000)
    return () => { cancelled = true; clearInterval(interval) }
  }, [])

  const selected = SERVICES_IN.find(s => s.id === selectedId) ?? SERVICES_IN[0]

  const liveCount = health
    ? [health.ollama, health.n8n, health.supabase, health.coolify].filter(h => h?.ok).length
    : null

  const avgLatency = health
    ? Math.round(
        [health.ollama, health.n8n, health.supabase, health.coolify]
          .filter(h => h?.ok)
          .reduce((sum, h) => sum + h!.latencyMs, 0) /
        Math.max(1, [health.ollama, health.n8n, health.supabase, health.coolify].filter(h => h?.ok).length)
      )
    : null

  const pxNode = proxmox?.nodes[0] ?? null
  const runningVMs = proxmox?.vms.filter(v => v.status === 'running').length ?? null

  const kpiList = [
    { label: 'Services live',  value: liveCount !== null ? `${liveCount}/4` : '—',                                  delta: healthLoading ? '…' : 'ping',   color: liveCount === 4 ? emerald : liveCount === null ? muted : rose   },
    { label: 'Latency avg',    value: avgLatency !== null ? `${avgLatency}ms` : '—',                                 delta: 'p50',                          color: cyan    },
    { label: 'CPU node',       value: pxNode ? `${pxNode.cpu_pct}%` : '—',                                          delta: 'proxmox',                      color: pxNode && pxNode.cpu_pct >= 90 ? rose : pxNode && pxNode.cpu_pct >= 70 ? amber : violet  },
    { label: 'RAM node',       value: pxNode ? `${pxNode.mem_pct}%` : '—',                                          delta: pxNode ? `${pxNode.mem_used_fmt}/${pxNode.mem_total_fmt}` : 'proxmox',  color: pxNode && pxNode.mem_pct >= 90 ? rose : pxNode && pxNode.mem_pct >= 70 ? amber : emerald },
    { label: 'VMs actives',    value: runningVMs !== null ? `${runningVMs}/${proxmox?.vms.length ?? 0}` : '—',           delta: 'proxmox',                      color: amber   },
  ]

  const headerActions = (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      {liveCount !== null && (
        <span style={{
          padding: '4px 10px', borderRadius: 5,
          background: liveCount === 4 ? `${emerald}18` : `${rose}18`,
          color: liveCount === 4 ? emerald : rose,
          fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '.1em', fontWeight: 700,
          border: `1px solid ${liveCount === 4 ? emerald : rose}30`,
        }}>{liveCount}/4 services live</span>
      )}
      {[
        { label: `${SERVICES_IN.length} services`, color: muted },
        { label: 'self-host · Proxmox',            color: muted },
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
          {kpiList.map(k => <InfraKpi key={k.label} {...k} />)}
        </div>

        {/* Topology + Service inspector */}
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 400px', gap: 14, alignItems: 'start' }}>
          {!isMobile && <TopologyGraph selectedId={selectedId} onSelect={setSelectedId} health={health} />}
          <ServiceInspector svc={selected} health={health} proxmox={proxmox} />
        </div>

        {/* Server rack */}
        <div style={{ background: surface, border: `1px solid ${line}`, borderRadius: 14, padding: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
            <div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 700, letterSpacing: '-.01em', color: text }}>Server rack · self-host</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, color: muted2, letterSpacing: '.14em', textTransform: 'uppercase', marginTop: 2 }}>proxmox cluster · 3 hosts · {SERVICES_IN.length} services</div>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)', gap: 14 }}>
            {[
              { label: 'RACK-01', host: 'lan-01', svcs: SERVICES_IN.slice(0, 3) },
              { label: 'RACK-02', host: 'lan-02', svcs: SERVICES_IN.slice(3, 6) },
              { label: 'RACK-03', host: 'ext',    svcs: SERVICES_IN.slice(6)    },
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
                {rack.svcs.map(svc => {
                  const hk = svc.healthKey as keyof HealthServices | null
                  const isLive = hk && health ? health[hk]?.ok : null
                  const dotCol = statusColor(isLive)
                  return (
                    <button key={svc.id} onClick={() => setSelectedId(svc.id)} style={{
                      textAlign: 'left', padding: '5px 8px', borderRadius: 4,
                      background: svc.id === selectedId ? `${svc.color}16` : bg,
                      border: svc.id === selectedId ? `1px solid ${svc.color}` : `1px solid ${line}`,
                      display: 'grid', gridTemplateColumns: 'auto auto 1fr auto', gap: 8, alignItems: 'center',
                      cursor: 'pointer', minHeight: 22,
                    }}>
                      <span style={{ width: 7, height: 7, borderRadius: '50%', background: dotCol, boxShadow: isLive ? `0 0 6px ${dotCol}` : 'none' }} />
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: svc.color, letterSpacing: 1, fontWeight: 800 }}>{svc.short}</span>
                      <span style={{ fontSize: 10.5, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: text }}>{svc.label}</span>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: muted2, letterSpacing: 1 }}>1U</span>
                    </button>
                  )
                })}
                {Array.from({ length: Math.max(0, 3 - rack.svcs.length + 1) }).map((_, i) => (
                  <div key={i} style={{ height: 16, borderRadius: 2, background: bg, border: `1px dashed ${line}` }} />
                ))}
              </div>
            ))}
          </div>
        </div>

        {/* Event log + Deploys */}
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1.4fr 1fr', gap: 14 }}>
          <EventLog />
          <DeploysPanel />
        </div>
      </div>
    </CkShell>
  )
}
