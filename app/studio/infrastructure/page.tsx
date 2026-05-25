'use client'
import { useCallback, useEffect, useState } from 'react'
import { CkShell } from '@/components/CkShell'
import {
  bg,
  surface,
  surface2,
  line,
  line2,
  text,
  muted,
  muted2,
  emerald,
  amber,
  rose,
  cyan,
  violet,
  fuchsia,
} from '@/lib/ck-vars'
import { sparkPath, useIsMobile } from '@/lib/studio-utils'

// Services de l'infra — statuts alimentés par /api/studio/services/health
type InfraService = {
  id: string
  vmid: number | null
  label: string
  short: string
  color: string
  role: string
  endpointLabel: string
  healthKey: keyof HealthServices | null
  kind: 'host' | 'service' | 'edge' | 'external'
  checkedAt?: string | null
  repairHref?: string
}

const FALLBACK_SERVICES: InfraService[] = [
  {
    id: 'proxmox',
    vmid: null,
    label: 'Proxmox VE',
    short: 'PROX',
    color: '#34d399',
    role: 'Compute cluster',
    endpointLabel: 'private',
    healthKey: null,
    kind: 'host',
  },
  {
    id: 'coolify',
    vmid: 102,
    label: 'Coolify',
    short: 'COOL',
    color: '#34d399',
    role: 'Deployments',
    endpointLabel: 'private',
    healthKey: 'coolify',
    kind: 'service',
  },
  {
    id: 'hermesAgent',
    vmid: 102,
    label: 'Hermes Agent',
    short: 'HRM',
    color: '#f97316',
    role: 'Hermes API',
    endpointLabel: 'hermes-api.kenomi.eu',
    healthKey: 'hermesAgent',
    kind: 'service',
  },
  {
    id: 'n8n',
    vmid: null,
    label: 'n8n',
    short: 'N8N',
    color: '#e879f9',
    role: 'Automation',
    endpointLabel: 'private',
    healthKey: 'n8n',
    kind: 'service',
  },
  {
    id: 'supabase',
    vmid: null,
    label: 'Supabase',
    short: 'SUP',
    color: '#34d399',
    role: 'Auth and database',
    endpointLabel: 'supabase',
    healthKey: 'supabase',
    kind: 'external',
  },
  {
    id: 'ollama',
    vmid: null,
    label: 'Ollama',
    short: 'OLL',
    color: '#fb923c',
    role: 'Local inference',
    endpointLabel: 'private',
    healthKey: 'ollama',
    kind: 'external',
  },
]

const POSITIONS: Record<string, { x: number; y: number; kind: string }> = {
  proxmox: { x: 200, y: 240, kind: 'host' },
  coolify: { x: 380, y: 100, kind: 'service' },
  hermesAgent: { x: 560, y: 100, kind: 'service' },
  nginx: { x: 580, y: 80, kind: 'edge' },
  uptime: { x: 580, y: 200, kind: 'service' },
  vault: { x: 380, y: 240, kind: 'service' },
  n8n: { x: 380, y: 380, kind: 'service' },
  supabase: { x: 720, y: 320, kind: 'external' },
  ollama: { x: 720, y: 160, kind: 'external' },
}

const TOPO_EDGES: [string, string][] = [
  ['proxmox', 'coolify'],
  ['proxmox', 'vault'],
  ['proxmox', 'n8n'],
  ['coolify', 'nginx'],
  ['uptime', 'coolify'],
  ['uptime', 'supabase'],
  ['n8n', 'supabase'],
  ['coolify', 'supabase'],
  ['nginx', 'supabase'],
  ['coolify', 'hermesAgent'],
  ['hermesAgent', 'ollama'],
  ['coolify', 'ollama'],
  ['n8n', 'ollama'],
]

type HealthResult = { ok: boolean; latencyMs: number }
type HealthServices = {
  hermesAgent: HealthResult
  ollama: HealthResult
  n8n: HealthResult
  supabase: HealthResult
  coolify: HealthResult
}
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
  disk_pct: number | null
  mem_fmt: string
  maxmem_fmt: string
  disk_used_fmt: string
  maxdisk_fmt: string
  disk_source?: 'qemu_guest_agent' | 'proxmox_lxc' | 'unavailable'
  disk_error?: string | null
  uptime_fmt: string
  netin: number
  netout: number
}
type ProxmoxData = {
  nodes: ProxmoxNode[]
  vms: ProxmoxVM[]
  fetched_at: string
  error?: string
  errors?: { scope: string; message: string }[]
}
type DiagnosticStatus = 'ok' | 'degraded' | 'down'
type DiagnosticSource = 'settings' | 'env' | 'runtime'
type DiagnosticLine = {
  id: string
  label: string
  status: DiagnosticStatus
  source: DiagnosticSource
  urlLabel: string
  latencyMs: number
  lastError: string | null
  repairAction: string
  checkedAt: string
  detail?: string
}
type InfraDiagnostics = {
  checkedAt: string
  runtime: {
    environment: string
    sourceCommit: string
    commitShort: string
  }
  summary: {
    ok: boolean
    checksOk: number
    checksTotal: number
  }
  services: DiagnosticLine[]
  proxmox: DiagnosticLine
}
type DiagnosticActionId = 'recheck' | 'record_incident'
type DiagnosticActionResult = {
  ok: boolean
  code: string
  message: string
  targetId: string
  checkedAt: string
}
type InfraOpsEvent = {
  id: string
  type: string
  severity: string
  targetId: string
  targetLabel: string
  status: DiagnosticStatus | 'unknown'
  message: string
  createdAt: string
}
type InfraIncident = {
  id: string
  targetId: string
  targetLabel: string
  status: 'open' | 'resolved'
  severity: string
  lastError: string
  repairAction: string
  createdAt: string
}
type DeploymentParity = {
  status: 'ok' | 'mismatch' | 'unknown'
  runtimeCommit: string
  expectedCommit: string
  message: string
}
type InfraOpsHistory = {
  checkedAt: string
  summary: {
    actionsTotal: number
    openIncidents: number
    lastActionAt: string | null
  }
  events: InfraOpsEvent[]
  incidents: InfraIncident[]
  parity: DeploymentParity
}

function statusColor(ok: boolean | null): string {
  if (ok === null) return amber
  return ok ? emerald : rose
}

function diagnosticStatusColor(status: DiagnosticStatus): string {
  if (status === 'ok') return emerald
  if (status === 'degraded') return amber
  return rose
}

function minutesAgo(iso: string): string {
  const ts = Date.parse(iso)
  if (!Number.isFinite(ts)) return '—'
  const diffMin = Math.max(0, Math.round((Date.now() - ts) / 60_000))
  if (diffMin < 1) return '<1m'
  if (diffMin < 60) return `${diffMin}m`
  return `${Math.round(diffMin / 60)}h`
}

function InfraKpi({
  label,
  value,
  delta,
  color,
  trend = [],
}: {
  label: string
  value: string
  delta: string
  color: string
  trend?: number[]
}) {
  const hasTrend = trend.length >= 2
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
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
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
          fontSize: 24,
          fontWeight: 800,
          letterSpacing: '-.02em',
          marginTop: 6,
          color: text,
        }}
      >
        {value}
      </div>
      {hasTrend ? (
        <svg
          viewBox="0 0 100 22"
          preserveAspectRatio="none"
          style={{ width: '100%', height: 20, marginTop: 4, display: 'block' }}
        >
          <path
            d={sparkPath(trend, 100, 22, 1)}
            fill="none"
            stroke={color}
            strokeWidth="1.4"
          />
        </svg>
      ) : (
        <div
          style={{
            marginTop: 4,
            fontFamily: 'var(--font-mono)',
            fontSize: 9,
            color: muted2,
            letterSpacing: '.08em',
          }}
        >
          Tendance indisponible.
        </div>
      )}
    </div>
  )
}

function ArcGauge({
  label,
  value,
  max,
  color,
  unit,
  detail,
  unavailableText = 'non disponible',
}: {
  label: string
  value: number | null
  max: number
  color: string
  unit?: string
  detail?: string
  unavailableText?: string
}) {
  const hasValue = typeof value === 'number' && Number.isFinite(value)
  const pct = hasValue ? Math.min(1, value / max) : 0
  const c = Math.PI * 28
  return (
    <div
      style={{
        padding: 10,
        borderRadius: 10,
        background: surface2,
        border: `1px solid ${line}`,
        display: 'flex',
        alignItems: 'center',
        gap: 10,
      }}
    >
      <div style={{ position: 'relative', width: 60, height: 38, flexShrink: 0 }}>
        <svg width="60" height="38" viewBox="0 0 60 38">
          <path
            d="M5 33 A25 25 0 0 1 55 33"
            fill="none"
            stroke={line2}
            strokeWidth="5"
            strokeLinecap="round"
          />
          <path
            d="M5 33 A25 25 0 0 1 55 33"
            fill="none"
            stroke={color}
            strokeWidth="5"
            strokeLinecap="round"
            strokeDasharray={`${pct * c} ${c}`}
          />
        </svg>
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            textAlign: 'center',
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            fontWeight: 700,
            color,
          }}
        >
          {hasValue ? `${value}${unit ?? '%'}` : '—'}
        </div>
      </div>
      <div>
        <div
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 9,
            color: muted,
            letterSpacing: '.14em',
            textTransform: 'uppercase',
          }}
        >
          {label}
        </div>
        <div
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 9.5,
            color: muted2,
            letterSpacing: '.1em',
            marginTop: 2,
          }}
        >
          {hasValue
            ? (detail ?? `${Math.round(pct * 100)}% of ${max}${unit ?? ''}`)
            : unavailableText}
        </div>
      </div>
    </div>
  )
}

function InfraStat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div
      style={{
        padding: '5px 8px',
        borderRadius: 6,
        background: surface2,
        border: `1px solid ${line}`,
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
          fontFamily: 'var(--font-mono)',
          fontSize: 12,
          fontWeight: 700,
          color,
          marginTop: 1,
        }}
      >
        {value}
      </div>
    </div>
  )
}

function TopologyGraph({
  selectedId,
  onSelect,
  health,
  services,
}: {
  selectedId: string
  onSelect: (id: string) => void
  health: HealthData | null
  services: InfraService[]
}) {
  return (
    <div
      style={{
        background: surface,
        border: `1px solid ${line}`,
        borderRadius: 14,
        position: 'relative',
        overflow: 'hidden',
        minHeight: 400,
      }}
    >
      <div style={{ position: 'absolute', top: 14, left: 16, zIndex: 2 }}>
        <div
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 14,
            fontWeight: 700,
            letterSpacing: '-.01em',
            color: text,
          }}
        >
          Service topology
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
          self-host + external · click un nœud
        </div>
      </div>
      <div style={{ position: 'absolute', top: 14, right: 16, zIndex: 2, display: 'flex', gap: 6 }}>
        {[
          { dot: '#34d399', label: 'self-host' },
          { dot: '#a78bfa', label: 'external' },
        ].map((l) => (
          <span
            key={l.label}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              padding: '3px 8px',
              borderRadius: 4,
              background: surface2,
              border: `1px solid ${line}`,
            }}
          >
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: l.dot }} />
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 9,
                color: muted,
                letterSpacing: '.1em',
                textTransform: 'uppercase',
              }}
            >
              {l.label}
            </span>
          </span>
        ))}
      </div>

      <svg
        width="100%"
        height="100%"
        viewBox="0 0 1000 460"
        preserveAspectRatio="xMidYMid meet"
        style={{ minHeight: 400 }}
      >
        <defs>
          <filter id="inGlow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="2" />
          </filter>
        </defs>

        {TOPO_EDGES.map(([from, to], idx) => {
          const f = POSITIONS[from],
            t = POSITIONS[to]
          const fSvc = services.find((s) => s.id === from)
          if (!f || !t || !fSvc) return null
          const hk = fSvc.healthKey as keyof HealthServices | null
          const isLive = hk && health ? health[hk]?.ok : true
          const offset = (idx * 0.17) % 1
          return (
            <g key={idx}>
              <line
                x1={f.x}
                y1={f.y}
                x2={t.x}
                y2={t.y}
                stroke={isLive ? fSvc.color : rose}
                strokeOpacity=".25"
                strokeWidth="1.4"
                strokeDasharray="2 6"
              />
              {isLive && (
                <circle r="3" fill={fSvc.color} filter="url(#inGlow)">
                  <animate
                    attributeName="cx"
                    from={f.x.toString()}
                    to={t.x.toString()}
                    dur={`${2 + (idx % 3)}s`}
                    begin={`${-offset * 2}s`}
                    repeatCount="indefinite"
                  />
                  <animate
                    attributeName="cy"
                    from={f.y.toString()}
                    to={t.y.toString()}
                    dur={`${2 + (idx % 3)}s`}
                    begin={`${-offset * 2}s`}
                    repeatCount="indefinite"
                  />
                </circle>
              )}
            </g>
          )
        })}

        <rect
          x="120"
          y="40"
          width="380"
          height="380"
          rx="14"
          fill="none"
          stroke={line}
          strokeWidth="1.5"
          strokeDasharray="6 6"
        />
        <text
          x="130"
          y="58"
          fontSize="10"
          fill={muted}
          fontFamily="var(--font-mono)"
          letterSpacing="2"
        >
          SELF-HOST · PROXMOX CLUSTER
        </text>

        {services
          .filter((s) => POSITIONS[s.id])
          .map((svc) => {
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
              <g
                key={svc.id}
                transform={`translate(${pos.x}, ${pos.y})`}
                style={{ cursor: 'pointer' }}
                onClick={() => onSelect(svc.id)}
              >
                {isSel && (
                  <circle
                    r={r + 8}
                    fill="none"
                    stroke={svc.color}
                    strokeOpacity=".5"
                    strokeWidth="1.5"
                  />
                )}
                {isExternal ? (
                  <rect
                    x={-r}
                    y={-r}
                    width={r * 2}
                    height={r * 2}
                    rx="6"
                    fill={surface2}
                    stroke={svc.color}
                    strokeOpacity={isSel ? 1 : 0.7}
                    strokeWidth={isSel ? 2 : 1.4}
                    strokeDasharray="4 3"
                  />
                ) : (
                  <circle
                    r={r}
                    fill={surface2}
                    stroke={svc.color}
                    strokeOpacity={isSel ? 1 : 0.7}
                    strokeWidth={isSel ? 2 : 1.4}
                  />
                )}
                {isHost && (
                  <circle
                    r={r - 6}
                    fill="none"
                    stroke={svc.color}
                    strokeOpacity=".3"
                    strokeDasharray="2 4"
                  />
                )}
                <text
                  textAnchor="middle"
                  y="-2"
                  fontSize={isHost ? '10' : '9'}
                  fill={svc.color}
                  fontFamily="var(--font-mono)"
                  letterSpacing="1.4"
                  fontWeight="700"
                >
                  {svc.short}
                </text>
                <text
                  textAnchor="middle"
                  y={isHost ? 12 : 10}
                  fontSize="9"
                  fill={text}
                  fontFamily="var(--font-display)"
                  fontWeight="600"
                >
                  {svc.label}
                </text>
                {/* status dot */}
                <circle cx={r * 0.7} cy={-r * 0.7} r="4" fill={dotColor}>
                  {isLive && (
                    <animate
                      attributeName="opacity"
                      values=".5;1;.5"
                      dur="2s"
                      repeatCount="indefinite"
                    />
                  )}
                </circle>
              </g>
            )
          })}
      </svg>

      <div
        style={{
          position: 'absolute',
          left: 16,
          bottom: 12,
          display: 'flex',
          gap: 14,
          fontFamily: 'var(--font-mono)',
          fontSize: 9,
          color: muted2,
          letterSpacing: '.14em',
        }}
      >
        <span>
          NODES <b style={{ color: text }}>{Object.keys(POSITIONS).length}</b>
        </span>
        <span>
          EDGES <b style={{ color: text }}>{TOPO_EDGES.length}</b>
        </span>
        {health && (
          <span>
            SERVICES UP{' '}
            <b style={{ color: emerald }}>
              {
                [
                  health.hermesAgent,
                  health.ollama,
                  health.n8n,
                  health.supabase,
                  health.coolify,
                ].filter((h) => h?.ok)
                  .length
              }
              /5
            </b>
          </span>
        )}
      </div>
    </div>
  )
}

function ServiceInspector({
  svc,
  health,
  proxmox,
}: {
  svc: InfraService
  health: HealthData | null
  proxmox: ProxmoxData | null
}) {
  const hk = svc.healthKey as keyof HealthServices | null
  const result = hk && health ? health[hk] : null

  // Résolution des métriques selon le type de service
  const isProxmoxNode = svc.id === 'proxmox'
  const pxNode = isProxmoxNode ? (proxmox?.nodes[0] ?? null) : null
  const vm = svc.vmid != null ? (proxmox?.vms.find((v) => v.vmid === svc.vmid) ?? null) : null
  const hasMetrics = isProxmoxNode ? pxNode !== null : vm !== null

  // Statut : Ollama → _meta.llm.fallback_active (seule source fiable en prod)
  // Autres avec healthKey → health check direct
  // Sans healthKey → dérivé des métriques Proxmox
  const isOllama = svc.id === 'ollama'
  const isLiveFromHealth = isOllama
    ? health?._meta?.llm != null
      ? !health._meta.llm.fallback_active
      : null
    : (result?.ok ?? null)
  const isLiveFromProxmox = isProxmoxNode
    ? pxNode
      ? pxNode.status === 'online'
      : null
    : vm
      ? vm.status === 'running'
      : null
  const isLive = isLiveFromHealth ?? isLiveFromProxmox
  const latency = result?.latencyMs ?? null
  const statusLabel = isLive === null ? '—' : isLive ? 'ONLINE' : 'OFFLINE'
  const statusCol = statusColor(isLive)

  // Valeurs des jauges
  const cpuPct = isProxmoxNode ? (pxNode?.cpu_pct ?? 0) : (vm?.cpu_pct ?? 0)
  const memPct = isProxmoxNode ? (pxNode?.mem_pct ?? 0) : (vm?.mem_pct ?? 0)
  const diskPct = isProxmoxNode ? (pxNode?.disk_pct ?? null) : (vm?.disk_pct ?? null)
  const uptimeFmt = isProxmoxNode ? (pxNode?.uptime_fmt ?? '—') : (vm?.uptime_fmt ?? '—')
  const diskDetail = isProxmoxNode
    ? pxNode
      ? `${pxNode.disk_used_fmt} / ${pxNode.disk_total_fmt}`
      : undefined
    : vm && vm.disk_pct !== null
      ? `${vm.disk_used_fmt} / ${vm.maxdisk_fmt}${
          vm.disk_source === 'qemu_guest_agent' ? ' · guest' : ' · proxmox'
        }`
      : undefined
  const diskUnavailableText =
    vm?.type === 'qemu'
      ? vm.disk_error
        ? vm.disk_error
        : 'guest disk indisponible'
      : 'non disponible'

  // 4ème jauge : VMs actives pour le nœud, Net I/O (Mo) pour les VMs
  const vmRunning = proxmox ? proxmox.vms.filter((v) => v.status === 'running').length : 0
  const vmTotal = proxmox?.vms.length ?? 1
  const netMo = vm ? Math.round((vm.netin + vm.netout) / 1_048_576) : 0
  const netMax = 10_000

  const isMonitored = hk ? true : hasMetrics

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
        borderLeft: `3px solid ${svc.color}`,
      }}
    >
      {/* Header */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 10,
              color: svc.color,
              letterSpacing: '.14em',
              textTransform: 'uppercase',
              fontWeight: 700,
            }}
          >
            Service · {svc.short}
          </span>
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 10,
              padding: '3px 8px',
              borderRadius: 4,
              background: `${statusCol}22`,
              color: statusCol,
              letterSpacing: 1.5,
              fontWeight: 800,
            }}
          >
            {statusLabel}
          </span>
        </div>
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
          {svc.label}
        </div>
        <div style={{ fontSize: 12, color: muted, marginTop: 4 }}>{svc.role}</div>
        <div
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 9.5,
            color: muted2,
            letterSpacing: '.14em',
            marginTop: 6,
          }}
        >
          → {svc.endpointLabel}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginTop: 8 }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: muted2 }}>
            {svc.checkedAt ? `check ${minutesAgo(svc.checkedAt)}` : 'check —'}
          </span>
          <a
            href={svc.repairHref ?? '/studio/settings'}
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 9,
              color: isLive === false ? amber : muted2,
              letterSpacing: '.1em',
              textTransform: 'uppercase',
              textDecoration: 'none',
            }}
          >
            réparer
          </a>
        </div>
      </div>

      {/* Jauges — affichées uniquement si métriques disponibles */}
      {hasMetrics && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <ArcGauge label="CPU" value={cpuPct} max={100} color={cyan} />
          <ArcGauge label="RAM" value={memPct} max={100} color={emerald} />
          <ArcGauge
            label="Disk"
            value={diskPct}
            max={100}
            color={violet}
            detail={diskDetail}
            unavailableText={diskUnavailableText}
          />
          {isProxmoxNode ? (
            <ArcGauge
              label="VMs"
              value={vmRunning}
              max={Math.max(vmTotal, 1)}
              color={amber}
              unit=""
            />
          ) : (
            <ArcGauge label="Net" value={netMo} max={netMax} color={fuchsia} unit="Mo" />
          )}
        </div>
      )}

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
        <InfraStat label="Uptime" value={hasMetrics ? uptimeFmt : '—'} color={emerald} />
        <InfraStat label="Latency" value={latency !== null ? `${latency}ms` : '—'} color={cyan} />
        <InfraStat
          label="Monitored"
          value={isMonitored ? 'oui' : 'non'}
          color={isMonitored ? emerald : muted}
        />
      </div>

      {/* Warning si aucune métrique */}
      {!hasMetrics && !hk && (
        <div
          style={{
            padding: '10px 12px',
            borderRadius: 8,
            background: `${amber}12`,
            border: `1px solid ${amber}33`,
            fontSize: 11,
            color: amber,
            fontFamily: 'var(--font-mono)',
          }}
        >
          ⚠ Aucune métrique · service non hébergé sur Proxmox
        </div>
      )}

      {/* Actions */}
      <div style={{ display: 'flex', gap: 6, marginTop: 'auto' }}>
        <button
          style={{
            flex: 1,
            padding: '9px 12px',
            borderRadius: 8,
            background: svc.color,
            color: '#0b0d12',
            border: 'none',
            fontFamily: 'var(--font-display)',
            fontWeight: 800,
            fontSize: 11.5,
            letterSpacing: '.06em',
            cursor: 'pointer',
          }}
        >
          ↗ {svc.endpointLabel}
        </button>
        <button
          style={{
            padding: '9px 12px',
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
          RESTART
        </button>
      </div>
    </div>
  )
}

function EventLog() {
  return (
    <div
      style={{
        background: surface,
        border: `1px solid ${line}`,
        borderRadius: 14,
        padding: 14,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
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
            Event log · sys
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
            journalctl · follow
          </div>
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          {['ALL', 'INFO', 'WARN', 'ERROR'].map((f, i) => (
            <span
              key={f}
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 9,
                padding: '3px 7px',
                borderRadius: 3,
                letterSpacing: '.14em',
                background: i === 0 ? surface2 : 'transparent',
                color: i === 0 ? text : muted2,
                border: `1px solid ${line}`,
                textTransform: 'uppercase',
              }}
            >
              {f}
            </span>
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
    <div
      style={{
        background: surface,
        border: `1px solid ${line}`,
        borderRadius: 14,
        padding: 14,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
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
            Recent deploys
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
            coolify · last 24h
          </div>
        </div>
      </div>
      <div style={{ padding: '24px 16px', textAlign: 'center' }}>
        <p style={{ fontSize: 12, color: muted2 }}>
          Configurez <b style={{ color: text }}>COOLIFY_API_TOKEN</b> pour voir les déploiements
        </p>
      </div>
    </div>
  )
}

function DiagnosticsPanel({
  diagnostics,
  error,
  isMobile,
  pendingAction,
  actionResult,
  actionError,
  onAction,
}: {
  diagnostics: InfraDiagnostics | null
  error: string | null
  isMobile: boolean
  pendingAction: string | null
  actionResult: DiagnosticActionResult | null
  actionError: string | null
  onAction: (targetId: string, action: DiagnosticActionId) => void
}) {
  const rows = diagnostics ? [...diagnostics.services, diagnostics.proxmox] : []
  const summaryColor = diagnostics?.summary.ok ? emerald : diagnostics ? amber : muted

  return (
    <div
      style={{
        background: surface,
        border: `1px solid ${line}`,
        borderRadius: 14,
        padding: 14,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: 12,
          flexWrap: 'wrap',
        }}
      >
        <div>
          <div
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 14,
              fontWeight: 800,
              color: text,
              letterSpacing: '-.01em',
            }}
          >
            Diagnostic prod
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
            runtime · config source · repair hint
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <span
            style={{
              padding: '4px 9px',
              borderRadius: 5,
              background: `${summaryColor}18`,
              color: summaryColor,
              border: `1px solid ${summaryColor}30`,
              fontFamily: 'var(--font-mono)',
              fontSize: 10,
              letterSpacing: '.1em',
              fontWeight: 800,
            }}
          >
            {diagnostics
              ? `${diagnostics.summary.checksOk}/${diagnostics.summary.checksTotal}`
              : '—'}
          </span>
          <span
            style={{
              padding: '4px 9px',
              borderRadius: 5,
              background: surface2,
              color: muted,
              border: `1px solid ${line}`,
              fontFamily: 'var(--font-mono)',
              fontSize: 10,
              letterSpacing: '.1em',
            }}
          >
            {diagnostics ? diagnostics.runtime.commitShort : 'local'}
          </span>
        </div>
      </div>

      {error && (
        <div
          style={{
            padding: '9px 10px',
            borderRadius: 7,
            background: `${rose}12`,
            border: `1px solid ${rose}30`,
            color: rose,
            fontFamily: 'var(--font-mono)',
            fontSize: 10.5,
            lineHeight: 1.5,
          }}
        >
          Diagnostic indisponible · {error}
        </div>
      )}

      {(actionResult || actionError) && (
        <div
          style={{
            padding: '9px 10px',
            borderRadius: 7,
            background: actionError ? `${rose}12` : `${emerald}12`,
            border: `1px solid ${actionError ? rose : emerald}30`,
            color: actionError ? rose : emerald,
            fontFamily: 'var(--font-mono)',
            fontSize: 10.5,
            lineHeight: 1.5,
          }}
        >
          Action · {actionError ?? actionResult?.message}
        </div>
      )}

      {diagnostics && (
        <>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr 1fr',
              gap: 8,
            }}
          >
            {[
              { label: 'Env', value: diagnostics.runtime.environment, color: cyan },
              { label: 'Source', value: diagnostics.runtime.sourceCommit, color: muted },
              { label: 'Checked', value: minutesAgo(diagnostics.checkedAt), color: emerald },
            ].map((item) => (
              <div
                key={item.label}
                style={{
                  background: surface2,
                  border: `1px solid ${line}`,
                  borderRadius: 8,
                  padding: '8px 10px',
                  minWidth: 0,
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
                  {item.label}
                </div>
                <div
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 10.5,
                    color: item.color,
                    marginTop: 3,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                  title={item.value}
                >
                  {item.value}
                </div>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {rows.map((row) => {
              const color = diagnosticStatusColor(row.status)
              return (
                <div
                  key={row.id}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: isMobile ? '1fr' : '120px 1fr 90px 90px 150px',
                    gap: isMobile ? 5 : 10,
                    alignItems: 'center',
                    padding: '8px 10px',
                    borderRadius: 8,
                    background: bg,
                    border: `1px solid ${line}`,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
                    <span
                      style={{
                        width: 7,
                        height: 7,
                        borderRadius: '50%',
                        background: color,
                        boxShadow: row.status === 'ok' ? `0 0 7px ${color}` : 'none',
                        flexShrink: 0,
                      }}
                    />
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 800,
                        color: text,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {row.label}
                    </span>
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: 10,
                        color: muted,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                      title={row.urlLabel}
                    >
                      {row.urlLabel}
                    </div>
                    <div
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: 9,
                        color: row.lastError ? rose : muted2,
                        marginTop: 2,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                      title={row.lastError ?? row.repairAction}
                    >
                      {row.lastError ?? row.detail ?? row.repairAction}
                    </div>
                  </div>
                  <span
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: 9.5,
                      color,
                      textTransform: 'uppercase',
                      letterSpacing: '.12em',
                      fontWeight: 800,
                    }}
                  >
                    {row.status}
                  </span>
                  <span
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: 9.5,
                      color: muted2,
                      letterSpacing: '.1em',
                    }}
                  >
                    {row.source} · {row.latencyMs}ms
                  </span>
                  <div
                    style={{
                      display: 'flex',
                      gap: 6,
                      justifyContent: isMobile ? 'flex-start' : 'flex-end',
                      flexWrap: 'wrap',
                    }}
                  >
                    {(
                      [
                        { id: 'recheck' as const, label: 'Recheck', visible: true },
                        {
                          id: 'record_incident' as const,
                          label: 'Tracer',
                          visible: row.status !== 'ok',
                        },
                      ] satisfies { id: DiagnosticActionId; label: string; visible: boolean }[]
                    )
                      .filter((action) => action.visible)
                      .map((action) => {
                        const pending = pendingAction === `${row.id}:${action.id}`
                        const isTrace = action.id === 'record_incident'
                        const actionColor = isTrace ? amber : cyan
                        return (
                          <button
                            key={action.id}
                            type="button"
                            disabled={pending}
                            onClick={() => onAction(row.id, action.id)}
                            style={{
                              minHeight: 26,
                              padding: '4px 8px',
                              borderRadius: 5,
                              border: `1px solid ${actionColor}35`,
                              background: pending ? surface2 : `${actionColor}12`,
                              color: pending ? muted2 : actionColor,
                              fontFamily: 'var(--font-mono)',
                              fontSize: 9,
                              letterSpacing: '.1em',
                              textTransform: 'uppercase',
                              cursor: pending ? 'wait' : 'pointer',
                            }}
                            title={
                              action.id === 'recheck'
                                ? `Relancer le check ${row.label}`
                                : `Tracer un incident ${row.label}`
                            }
                          >
                            {pending ? '...' : action.label}
                          </button>
                        )
                      })}
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}

function InfraOpsJournalPanel({
  history,
  error,
  isMobile,
}: {
  history: InfraOpsHistory | null
  error: string | null
  isMobile: boolean
}) {
  const parity = history?.parity
  const parityColor =
    parity?.status === 'ok' ? emerald : parity?.status === 'mismatch' ? rose : amber
  const incidents = history?.incidents ?? []
  const events = history?.events ?? []

  return (
    <div
      style={{
        background: surface,
        border: `1px solid ${line}`,
        borderRadius: 14,
        padding: 14,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: 12,
          flexWrap: 'wrap',
        }}
      >
        <div>
          <div
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 14,
              fontWeight: 800,
              color: text,
              letterSpacing: '-.01em',
            }}
          >
            Journal ops
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
            incidents · actions · deployment parity
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <span
            style={{
              padding: '4px 9px',
              borderRadius: 5,
              background: `${history?.summary.openIncidents ? rose : emerald}18`,
              color: history?.summary.openIncidents ? rose : emerald,
              border: `1px solid ${history?.summary.openIncidents ? rose : emerald}30`,
              fontFamily: 'var(--font-mono)',
              fontSize: 10,
              letterSpacing: '.1em',
              fontWeight: 800,
            }}
          >
            {history ? `${history.summary.openIncidents} open` : '—'}
          </span>
          <span
            style={{
              padding: '4px 9px',
              borderRadius: 5,
              background: `${parityColor}18`,
              color: parityColor,
              border: `1px solid ${parityColor}30`,
              fontFamily: 'var(--font-mono)',
              fontSize: 10,
              letterSpacing: '.1em',
              fontWeight: 800,
            }}
          >
            {parity ? parity.status : 'unknown'}
          </span>
        </div>
      </div>

      {error && (
        <div
          style={{
            padding: '9px 10px',
            borderRadius: 7,
            background: `${rose}12`,
            border: `1px solid ${rose}30`,
            color: rose,
            fontFamily: 'var(--font-mono)',
            fontSize: 10.5,
            lineHeight: 1.5,
          }}
        >
          Journal indisponible · {error}
        </div>
      )}

      {history && (
        <>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr 1fr',
              gap: 8,
            }}
          >
            {[
              {
                label: 'Runtime',
                value: parity?.runtimeCommit ?? '—',
                color: parityColor,
              },
              {
                label: 'Expected',
                value: parity?.expectedCommit ?? '—',
                color: muted,
              },
              {
                label: 'Last action',
                value: history.summary.lastActionAt
                  ? minutesAgo(history.summary.lastActionAt)
                  : '—',
                color: cyan,
              },
            ].map((item) => (
              <div
                key={item.label}
                style={{
                  background: surface2,
                  border: `1px solid ${line}`,
                  borderRadius: 8,
                  padding: '8px 10px',
                  minWidth: 0,
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
                  {item.label}
                </div>
                <div
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 10.5,
                    color: item.color,
                    marginTop: 3,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                  title={item.value}
                >
                  {item.value}
                </div>
              </div>
            ))}
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr',
              gap: 10,
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
              <div
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 9,
                  color: muted2,
                  letterSpacing: '.14em',
                  textTransform: 'uppercase',
                }}
              >
                Incidents
              </div>
              {incidents.length === 0 ? (
                <div
                  style={{
                    padding: '10px',
                    borderRadius: 8,
                    background: bg,
                    border: `1px solid ${line}`,
                    color: muted2,
                    fontSize: 11,
                  }}
                >
                  Aucun incident tracé
                </div>
              ) : (
                incidents.slice(0, 4).map((incident) => {
                  const color = incident.status === 'open' ? rose : emerald
                  return (
                    <div
                      key={incident.id}
                      style={{
                        padding: '8px 10px',
                        borderRadius: 8,
                        background: bg,
                        border: `1px solid ${line}`,
                        minWidth: 0,
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          gap: 8,
                          alignItems: 'center',
                        }}
                      >
                        <span style={{ color: text, fontSize: 11, fontWeight: 800 }}>
                          {incident.targetLabel}
                        </span>
                        <span
                          style={{
                            color,
                            fontFamily: 'var(--font-mono)',
                            fontSize: 9,
                            letterSpacing: '.1em',
                            textTransform: 'uppercase',
                          }}
                        >
                          {incident.status}
                        </span>
                      </div>
                      <div
                        style={{
                          marginTop: 3,
                          color: muted2,
                          fontFamily: 'var(--font-mono)',
                          fontSize: 9.5,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                        title={incident.lastError}
                      >
                        {incident.lastError}
                      </div>
                    </div>
                  )
                })
              )}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
              <div
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 9,
                  color: muted2,
                  letterSpacing: '.14em',
                  textTransform: 'uppercase',
                }}
              >
                Dernières actions
              </div>
              {events.length === 0 ? (
                <div
                  style={{
                    padding: '10px',
                    borderRadius: 8,
                    background: bg,
                    border: `1px solid ${line}`,
                    color: muted2,
                    fontSize: 11,
                  }}
                >
                  Aucune action diagnostic
                </div>
              ) : (
                events.slice(0, 5).map((event) => {
                  const color =
                    event.severity === 'error' ? rose : event.severity === 'warn' ? amber : emerald
                  return (
                    <div
                      key={event.id}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '72px 1fr',
                        gap: 8,
                        alignItems: 'center',
                        padding: '8px 10px',
                        borderRadius: 8,
                        background: bg,
                        border: `1px solid ${line}`,
                        minWidth: 0,
                      }}
                    >
                      <span
                        style={{
                          color,
                          fontFamily: 'var(--font-mono)',
                          fontSize: 9,
                          letterSpacing: '.1em',
                          textTransform: 'uppercase',
                        }}
                      >
                        {event.type}
                      </span>
                      <span
                        style={{
                          color: muted,
                          fontFamily: 'var(--font-mono)',
                          fontSize: 9.5,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                        title={event.message}
                      >
                        {event.message}
                      </span>
                    </div>
                  )
                })
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

export default function InfrastructurePage() {
  const [selectedId, setSelectedId] = useState('coolify')
  const [health, setHealth] = useState<HealthData | null>(null)
  const [healthLoading, setHealthLoading] = useState(true)
  const [proxmox, setProxmox] = useState<ProxmoxData | null>(null)
  const [proxmoxError, setProxmoxError] = useState<string | null>(null)
  const [diagnostics, setDiagnostics] = useState<InfraDiagnostics | null>(null)
  const [diagnosticsError, setDiagnosticsError] = useState<string | null>(null)
  const [diagnosticActionPending, setDiagnosticActionPending] = useState<string | null>(null)
  const [diagnosticActionResult, setDiagnosticActionResult] =
    useState<DiagnosticActionResult | null>(null)
  const [diagnosticActionError, setDiagnosticActionError] = useState<string | null>(null)
  const [opsHistory, setOpsHistory] = useState<InfraOpsHistory | null>(null)
  const [opsHistoryError, setOpsHistoryError] = useState<string | null>(null)
  const [services, setServices] = useState<InfraService[]>(FALLBACK_SERVICES)
  const isMobile = useIsMobile()

  const loadDiagnostics = useCallback(async () => {
    try {
      const res = await fetch('/api/studio/infra/diagnostics')
      const data = (await res.json().catch(() => null)) as InfraDiagnostics | null
      if (data) {
        setDiagnostics(data)
        setDiagnosticsError(null)
        return
      }
      setDiagnosticsError(`HTTP ${res.status}`)
    } catch {
      setDiagnosticsError('requête réseau échouée')
    }
  }, [])

  const loadOpsHistory = useCallback(async () => {
    try {
      const res = await fetch('/api/studio/infra/diagnostics/history')
      const data = (await res.json().catch(() => null)) as InfraOpsHistory | null
      if (data) {
        setOpsHistory(data)
        setOpsHistoryError(null)
        return
      }
      setOpsHistoryError(`HTTP ${res.status}`)
    } catch {
      setOpsHistoryError('requête réseau échouée')
    }
  }, [])

  const runDiagnosticAction = useCallback(
    async (targetId: string, action: DiagnosticActionId) => {
      const pendingKey = `${targetId}:${action}`
      setDiagnosticActionPending(pendingKey)
      setDiagnosticActionError(null)
      setDiagnosticActionResult(null)
      try {
        const res = await fetch('/api/studio/infra/diagnostics/actions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ targetId, action }),
        })
        const data = (await res.json().catch(() => null)) as {
          action?: DiagnosticActionResult
          diagnostics?: InfraDiagnostics
          error?: string
        } | null
        if (!res.ok || !data?.action) {
          throw new Error(data?.error ?? `HTTP ${res.status}`)
        }
        setDiagnosticActionResult(data.action)
        if (data.diagnostics) {
          setDiagnostics(data.diagnostics)
          setDiagnosticsError(null)
        } else {
          await loadDiagnostics()
        }
        await loadOpsHistory()
      } catch (error) {
        setDiagnosticActionError(error instanceof Error ? error.message : 'action échouée')
      } finally {
        setDiagnosticActionPending(null)
      }
    },
    [loadDiagnostics, loadOpsHistory]
  )

  useEffect(() => {
    let cancelled = false
    async function loadHealth() {
      setHealthLoading(true)
      try {
        const res = await fetch('/api/studio/services/health')
        if (!res.ok) return
        const data = (await res.json()) as HealthData
        if (!cancelled) setHealth(data)
      } finally {
        if (!cancelled) setHealthLoading(false)
      }
    }
    async function loadProxmox() {
      try {
        const res = await fetch('/api/studio/infra/proxmox')
        const data = (await res.json().catch(() => null)) as ProxmoxData | null
        if (!cancelled && !res.ok) {
          setProxmox(null)
          setProxmoxError(data?.error ?? `Proxmox indisponible: HTTP ${res.status}`)
          return
        }
        if (!cancelled && data) {
          setProxmox(data)
          setProxmoxError(
            data.error ?? data.errors?.map((item) => item.message).join(' · ') ?? null
          )
        }
      } catch {
        if (!cancelled) {
          setProxmox(null)
          setProxmoxError('Proxmox indisponible: requête réseau échouée')
        }
      }
    }
    async function loadServices() {
      try {
        const res = await fetch('/api/studio/infra/services')
        if (!res.ok) return
        const data = (await res.json()) as { services?: InfraService[] }
        if (!cancelled && data.services?.length) setServices(data.services)
      } catch {
        if (!cancelled) setServices(FALLBACK_SERVICES)
      }
    }
    loadServices()
    loadHealth()
    loadProxmox()
    loadDiagnostics()
    loadOpsHistory()
    const interval = setInterval(() => {
      loadHealth()
      loadProxmox()
      loadDiagnostics()
      loadOpsHistory()
    }, 30_000)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [loadDiagnostics, loadOpsHistory])

  const selected = services.find((s) => s.id === selectedId) ?? services[0] ?? FALLBACK_SERVICES[0]

  const liveCount = health
    ? [
        health.hermesAgent,
        health.ollama,
        health.n8n,
        health.supabase,
        health.coolify,
      ].filter((h) => h?.ok).length
    : null

  const avgLatency = health
    ? Math.round(
        [
          health.hermesAgent,
          health.ollama,
          health.n8n,
          health.supabase,
          health.coolify,
        ]
          .filter((h) => h?.ok)
          .reduce((sum, h) => sum + h!.latencyMs, 0) /
          Math.max(
            1,
            [
              health.hermesAgent,
              health.ollama,
              health.n8n,
              health.supabase,
              health.coolify,
            ].filter((h) => h?.ok).length
          )
      )
    : null

  const pxNode = proxmox?.nodes[0] ?? null
  const runningVMs = proxmox?.vms.filter((v) => v.status === 'running').length ?? null

  const kpiList = [
    {
      label: 'Services live',
      value: liveCount !== null ? `${liveCount}/5` : '—',
      delta: healthLoading ? '…' : 'ping',
      color: liveCount === 5 ? emerald : liveCount === null ? muted : rose,
    },
    {
      label: 'Latency avg',
      value: avgLatency !== null ? `${avgLatency}ms` : '—',
      delta: 'p50',
      color: cyan,
    },
    {
      label: 'CPU node',
      value: pxNode ? `${pxNode.cpu_pct}%` : '—',
      delta: 'proxmox',
      color:
        pxNode && pxNode.cpu_pct >= 90 ? rose : pxNode && pxNode.cpu_pct >= 70 ? amber : violet,
    },
    {
      label: 'RAM node',
      value: pxNode ? `${pxNode.mem_pct}%` : '—',
      delta: pxNode ? `${pxNode.mem_used_fmt}/${pxNode.mem_total_fmt}` : 'proxmox',
      color:
        pxNode && pxNode.mem_pct >= 90 ? rose : pxNode && pxNode.mem_pct >= 70 ? amber : emerald,
    },
    {
      label: 'VMs actives',
      value: runningVMs !== null ? `${runningVMs}/${proxmox?.vms.length ?? 0}` : '—',
      delta: 'proxmox',
      color: amber,
    },
  ]

  const headerActions = (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      {liveCount !== null && (
        <span
          style={{
            padding: '4px 10px',
            borderRadius: 5,
            background: liveCount === 5 ? `${emerald}18` : `${rose}18`,
            color: liveCount === 5 ? emerald : rose,
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
            letterSpacing: '.1em',
            fontWeight: 700,
            border: `1px solid ${liveCount === 5 ? emerald : rose}30`,
          }}
        >
          {liveCount}/5 services live
        </span>
      )}
      {[
        { label: `${services.length} services`, color: muted },
        { label: 'self-host · Proxmox', color: muted },
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
      breadcrumb="Studio / Infrastructure"
      title="Infrastructure Control"
      subtitle="Proxmox · Coolify · Docker · Supabase"
      actions={headerActions}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* KPI strip */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(5, 1fr)',
            gap: 10,
          }}
        >
          {kpiList.map((k) => (
            <InfraKpi key={k.label} {...k} />
          ))}
        </div>

        {proxmoxError && (
          <div
            style={{
              padding: '10px 12px',
              borderRadius: 8,
              background: `${amber}12`,
              border: `1px solid ${amber}33`,
              color: amber,
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              lineHeight: 1.5,
            }}
          >
            Proxmox metrics indisponibles · {proxmoxError}
          </div>
        )}

        <DiagnosticsPanel
          diagnostics={diagnostics}
          error={diagnosticsError}
          isMobile={isMobile}
          pendingAction={diagnosticActionPending}
          actionResult={diagnosticActionResult}
          actionError={diagnosticActionError}
          onAction={runDiagnosticAction}
        />

        <InfraOpsJournalPanel history={opsHistory} error={opsHistoryError} isMobile={isMobile} />

        {/* Topology + Service inspector */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: isMobile ? '1fr' : '1fr 400px',
            gap: 14,
            alignItems: 'start',
          }}
        >
          {!isMobile && (
            <TopologyGraph
              selectedId={selectedId}
              onSelect={setSelectedId}
              health={health}
              services={services}
            />
          )}
          <ServiceInspector svc={selected} health={health} proxmox={proxmox} />
        </div>

        {/* Server rack */}
        <div
          style={{
            background: surface,
            border: `1px solid ${line}`,
            borderRadius: 14,
            padding: 14,
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'baseline',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: 8,
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
                Server rack · self-host
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
                proxmox cluster · 3 hosts · {services.length} services
              </div>
            </div>
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)',
              gap: 14,
            }}
          >
            {[
              { label: 'RACK-01', host: 'lan-01', svcs: services.slice(0, 3) },
              { label: 'RACK-02', host: 'lan-02', svcs: services.slice(3, 6) },
              { label: 'RACK-03', host: 'ext', svcs: services.slice(6) },
            ].map((rack) => (
              <div
                key={rack.label}
                style={{
                  background: surface2,
                  border: `1px solid ${line}`,
                  borderRadius: 10,
                  padding: 8,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 5,
                }}
              >
                <div
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                >
                  <span
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: 9,
                      color: muted,
                      letterSpacing: '.18em',
                      textTransform: 'uppercase',
                      fontWeight: 700,
                    }}
                  >
                    {rack.label}
                  </span>
                  <span
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: 8.5,
                      color: muted2,
                      letterSpacing: '.14em',
                    }}
                  >
                    {rack.host}
                  </span>
                </div>
                <div
                  style={{
                    height: 4,
                    borderRadius: 2,
                    background: bg,
                    border: `1px solid ${line}`,
                  }}
                />
                {rack.svcs.map((svc) => {
                  const hk = svc.healthKey as keyof HealthServices | null
                  const isLive = hk && health ? health[hk]?.ok : null
                  const dotCol = statusColor(isLive)
                  return (
                    <button
                      key={svc.id}
                      onClick={() => setSelectedId(svc.id)}
                      style={{
                        textAlign: 'left',
                        padding: '5px 8px',
                        borderRadius: 4,
                        background: svc.id === selectedId ? `${svc.color}16` : bg,
                        border:
                          svc.id === selectedId ? `1px solid ${svc.color}` : `1px solid ${line}`,
                        display: 'grid',
                        gridTemplateColumns: 'auto auto 1fr auto',
                        gap: 8,
                        alignItems: 'center',
                        cursor: 'pointer',
                        minHeight: 22,
                      }}
                    >
                      <span
                        style={{
                          width: 7,
                          height: 7,
                          borderRadius: '50%',
                          background: dotCol,
                          boxShadow: isLive ? `0 0 6px ${dotCol}` : 'none',
                        }}
                      />
                      <span
                        style={{
                          fontFamily: 'var(--font-mono)',
                          fontSize: 9,
                          color: svc.color,
                          letterSpacing: 1,
                          fontWeight: 800,
                        }}
                      >
                        {svc.short}
                      </span>
                      <span
                        style={{
                          fontSize: 10.5,
                          fontWeight: 600,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          color: text,
                        }}
                      >
                        {svc.label}
                      </span>
                      <span
                        style={{
                          fontFamily: 'var(--font-mono)',
                          fontSize: 9,
                          color: muted2,
                          letterSpacing: 1,
                        }}
                      >
                        1U
                      </span>
                    </button>
                  )
                })}
                {Array.from({ length: Math.max(0, 3 - rack.svcs.length + 1) }).map((_, i) => (
                  <div
                    key={i}
                    style={{
                      height: 16,
                      borderRadius: 2,
                      background: bg,
                      border: `1px dashed ${line}`,
                    }}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>

        {/* Event log + Deploys */}
        <div
          style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1.4fr 1fr', gap: 14 }}
        >
          <EventLog />
          <DeploysPanel />
        </div>
      </div>
    </CkShell>
  )
}
