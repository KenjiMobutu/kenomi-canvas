'use client'
import { useMemo, useEffect, useState, useCallback } from 'react'
import { CkShell } from '@/components/CkShell'
import {
  bg, surface, surface2, line, line2, text, muted, muted2,
  accent, emerald, amber, rose, cyan, violet, fuchsia,
} from '@/lib/ck-vars'
import { makeSpark, sparkPath, useIsMobile } from '@/lib/studio-utils'
import { createSupabaseBrowser } from '@/lib/supabase-browser'
import { useAuth } from '@/lib/auth-context'
import { toast } from 'sonner'

interface DbWorkflow {
  id: string; name: string; trigger_type: string; webhook_url: string
  enabled: boolean; run_count: number; last_run_at: string | null; created_at: string
}

interface AutoRun {
  id: string
  status: 'success' | 'error' | 'timeout'
  http_status: number | null
  duration_ms: number | null
  error_message: string | null
  triggered_at: string
}

interface N8nWorkflow {
  id: string
  name: string
  active: boolean
  createdAt: string
  updatedAt: string
}


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

function minutesAgo(date: Date): string {
  return `${Math.round((Date.now() - date.getTime()) / 60000)}m ago`
}

function WorkflowDAG({ workflow, runs }: { workflow: DbWorkflow | null; runs: AutoRun[] }) {
  const color = workflow?.enabled ? cyan : muted2
  const successCount = runs.filter(r => r.status === 'success').length
  const successPct = runs.length > 0 ? Math.round((successCount / runs.length) * 100) : null
  const avgDur = runs.length > 0 && runs.some(r => r.duration_ms !== null)
    ? Math.round(runs.filter(r => r.duration_ms !== null).reduce((s, r) => s + r.duration_ms!, 0) / runs.filter(r => r.duration_ms !== null).length)
    : null
  const lastRun = workflow?.last_run_at ? new Date(workflow.last_run_at) : null
  const lastRunLabel = lastRun ? minutesAgo(lastRun) : 'jamais'

  // Nœuds générés depuis le trigger_type du workflow réel
  const W = 800, H = 160, NODE_W = 130, NODE_H = 50
  const dagNodes = workflow ? [
    { id: 'trig', x: 60,  y: 55, label: workflow.trigger_type, type: 'trigger' },
    { id: 'wh',   x: 280, y: 55, label: workflow.webhook_url ? 'Webhook n8n' : 'Manuel', type: 'service' },
    { id: 'log',  x: 500, y: 55, label: 'automation_runs', type: 'out' },
  ] : []
  const dagEdges: [string, string][] = workflow ? [['trig', 'wh'], ['wh', 'log']] : []

  if (!workflow) {
    return (
      <div style={{
        background: surface, border: `1px solid ${line}`, borderRadius: 14,
        padding: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 200,
      }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: muted, textAlign: 'center' }}>
          Sélectionnez un workflow pour voir son DAG
        </div>
      </div>
    )
  }

  return (
    <div style={{
      background: surface, border: `1px solid ${line}`, borderRadius: 14,
      padding: 16, display: 'flex', flexDirection: 'column', gap: 12, overflow: 'hidden',
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 700, letterSpacing: '-.01em', color: text }}>{workflow.name}</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, color: muted2, letterSpacing: '.14em', textTransform: 'uppercase', marginTop: 2 }}>
            DAG · {workflow.trigger_type} · {workflow.webhook_url ? 'webhook actif' : 'pas de webhook'}
          </div>
        </div>
        <span style={{
          fontFamily: 'var(--font-mono)', fontSize: 9, padding: '3px 8px', borderRadius: 4,
          background: workflow.enabled ? `${emerald}22` : `${muted2}22`,
          color: workflow.enabled ? emerald : muted2, letterSpacing: 1, fontWeight: 700,
        }}>{workflow.enabled ? '● ACTIF' : '○ PAUSÉ'}</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
        <AuStatBox label="Runs"    value={String(workflow.run_count)} color={color} />
        <AuStatBox label="Success" value={successPct !== null ? `${successPct}%` : '—'} color={emerald} />
        <AuStatBox label="Avg dur" value={avgDur !== null ? `${avgDur}ms` : '—'} color={cyan} />
        <AuStatBox label="Last"    value={lastRunLabel} color={violet} />
      </div>

      <div style={{ flex: 1, minHeight: 160 }}>
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" style={{ width: '100%', height: '100%' }}>
          {dagEdges.map(([from, to], idx) => {
            const f = dagNodes.find(n => n.id === from)
            const t = dagNodes.find(n => n.id === to)
            if (!f || !t) return null
            const fx = f.x + NODE_W, fy = f.y + NODE_H / 2
            const tx = t.x, ty = t.y + NODE_H / 2
            const offset = (idx * 0.3) % 1
            return (
              <g key={idx}>
                <line x1={fx} y1={fy} x2={tx} y2={ty} stroke={color} strokeOpacity=".35" strokeWidth="1.2" strokeDasharray="3 5" />
                <circle r="3.5" fill={color}>
                  <animate attributeName="cx" from={fx} to={tx} dur="1.6s" begin={`${-offset * 1.6}s`} repeatCount="indefinite" />
                  <animate attributeName="cy" from={fy} to={ty} dur="1.6s" begin={`${-offset * 1.6}s`} repeatCount="indefinite" />
                </circle>
              </g>
            )
          })}
          {dagNodes.map(n => {
            const meta = TYPE_META[n.type] ?? { color: '#8a93a6', label: '' }
            const nodeColor = n.type === 'trigger' ? color : meta.color
            return (
              <g key={n.id} transform={`translate(${n.x}, ${n.y})`}>
                <rect width={NODE_W} height={NODE_H} rx="8" ry="8" fill={surface2} stroke={nodeColor} strokeOpacity=".7" strokeWidth="1" />
                <rect width="3" height={NODE_H} rx="2" ry="2" fill={nodeColor} />
                <text x="14" y="18" fontSize="8.5" fill={nodeColor} fontFamily="var(--font-mono)" letterSpacing="1.4" fontWeight="700">{meta.label}</text>
                <text x="14" y="34" fontSize="11" fill={text} fontFamily="var(--font-display)" fontWeight="600">{n.label}</text>
              </g>
            )
          })}
        </svg>
      </div>
    </div>
  )
}


function RunsFeed({ runs, loading }: { runs: AutoRun[]; loading: boolean }) {
  const statusColor = (s: AutoRun['status']) =>
    s === 'success' ? '#34d399' : s === 'timeout' ? '#fbbf24' : '#fb7185'
  const statusLabel = (s: AutoRun['status']) =>
    s === 'success' ? '✓' : s === 'timeout' ? '⏱' : '✗'

  return (
    <div style={{
      background: surface, border: `1px solid ${line}`, borderRadius: 14, padding: 16,
    }}>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 700, color: text, marginBottom: 12 }}>
        Derniers runs
      </div>
      {loading ? (
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: muted }}>Chargement…</div>
      ) : runs.length === 0 ? (
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: muted }}>
          Aucun run enregistré. Déclenchez un workflow pour voir l&apos;historique.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {runs.map(r => (
            <div key={r.id} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '6px 10px', borderRadius: 8,
              background: surface2, border: `1px solid ${line}`,
            }}>
              <span style={{
                fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 700,
                color: statusColor(r.status), minWidth: 14, textAlign: 'center',
              }}>{statusLabel(r.status)}</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: muted, flex: 1 }}>
                {new Date(r.triggered_at).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}
              </span>
              {r.duration_ms !== null && (
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: muted }}>
                  {r.duration_ms}ms
                </span>
              )}
              {r.http_status !== null && (
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: muted }}>
                  HTTP {r.http_status}
                </span>
              )}
              {r.error_message && (
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: '#fb7185', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {r.error_message}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function ServiceHealth() {
  const [health, setHealth] = useState<Record<string, { ok: boolean; latencyMs?: number; error?: string }>>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/studio/services/health')
      .then(r => r.ok ? r.json() : {})
      .then(data => setHealth(data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const SERVICES_DISPLAY = [
    { id: 'ollama',   label: 'Ollama',   desc: 'LLM local' },
    { id: 'n8n',      label: 'n8n',      desc: 'Automations' },
    { id: 'supabase', label: 'Supabase', desc: 'Auth + DB + Storage', static: true },
    { id: 'coolify',  label: 'Coolify',  desc: 'Déploiement', static: true },
  ]

  return (
    <div style={{
      background: surface, border: `1px solid ${line}`, borderRadius: 14,
      padding: 14, display: 'flex', flexDirection: 'column', gap: 8,
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 700, letterSpacing: '-.01em', color: text }}>Service health</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, color: muted2, letterSpacing: '.14em', textTransform: 'uppercase', marginTop: 2 }}>live checks</div>
        </div>
        {loading && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, color: muted }}>⏳ Vérification…</span>}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        {SERVICES_DISPLAY.map(s => {
          const h = health[s.id]
          const isOk = s.static ? null : (h?.ok ?? null)
          const color = isOk === null ? muted : isOk ? emerald : rose
          const statusLabel = isOk === null ? (loading ? '…' : 'N/A') : isOk ? 'OK' : 'KO'
          return (
            <div key={s.id} style={{
              padding: 10, borderRadius: 8,
              background: surface2, border: `1px solid ${line}`,
              display: 'flex', flexDirection: 'column', gap: 4,
              borderLeft: `3px solid ${color}`,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: text }}>{s.label}</span>
                <span style={{
                  fontFamily: 'var(--font-mono)', fontSize: 9, padding: '2px 6px', borderRadius: 3,
                  background: `${color}22`, color, letterSpacing: 1, fontWeight: 700,
                }}>● {statusLabel}</span>
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, color: muted }}>
                {s.desc}
                {'latencyMs' in (h ?? {}) && ` · ${(h as { latencyMs: number }).latencyMs}ms`}
                {h?.error && ` · ${h.error}`}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}


function NewWorkflowForm({ onCreated, onClose }: { onCreated: () => void; onClose: () => void }) {
  const { user } = useAuth()
  const [name, setName] = useState('')
  const [triggerType, setTriggerType] = useState('Manual')
  const [webhookUrl, setWebhookUrl] = useState('')
  const [saving, setSaving] = useState(false)

  async function create() {
    if (!user || !name.trim()) return
    setSaving(true)
    const supabase = createSupabaseBrowser()
    const { error } = await supabase.from('automation_workflows').insert({
      user_id: user.id, name: name.trim(), trigger_type: triggerType, webhook_url: webhookUrl.trim(),
    })
    setSaving(false)
    if (error) return toast.error(error.message)
    toast.success('Workflow créé')
    onCreated()
    onClose()
  }

  return (
    <div style={{ marginBottom: 14, padding: 18, borderRadius: 12, background: surface, border: `1px solid ${line2}`, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 700, color: text }}>Nouveau workflow</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr .7fr 1.4fr', gap: 10 }}>
        <div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: muted, letterSpacing: '.14em', textTransform: 'uppercase', marginBottom: 4 }}>Nom</div>
          <input className="ck-input" value={name} onChange={e => setName(e.target.value)} placeholder="Mon workflow" style={{ width: '100%' }} autoFocus />
        </div>
        <div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: muted, letterSpacing: '.14em', textTransform: 'uppercase', marginBottom: 4 }}>Déclencheur</div>
          <select className="ck-select" value={triggerType} onChange={e => setTriggerType(e.target.value)} style={{ width: '100%' }}>
            {['Manual', 'Webhook', 'Schedule · 15m', 'Schedule · 1h', 'Schedule · 6h', 'Event'].map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: muted, letterSpacing: '.14em', textTransform: 'uppercase', marginBottom: 4 }}>Webhook URL (optionnel)</div>
          <input className="ck-input" value={webhookUrl} onChange={e => setWebhookUrl(e.target.value)} placeholder="https://n8n.kenomi.eu/webhook/…" style={{ width: '100%' }} />
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button onClick={onClose} style={{ padding: '8px 14px', borderRadius: 8, background: 'transparent', color: muted, border: `1px solid ${line}`, cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: 11 }}>Annuler</button>
        <button onClick={create} disabled={!name.trim() || saving} style={{ padding: '8px 16px', borderRadius: 8, background: name.trim() ? accent : surface2, color: name.trim() ? '#0b0d12' : muted, border: 'none', cursor: 'pointer', fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 12 }}>
          {saving ? '…' : '+ Créer'}
        </button>
      </div>
    </div>
  )
}

function DbWorkflowsList({ workflows, selectedId, onSelect, onToggle, onDelete, onRun }: {
  workflows: DbWorkflow[]; selectedId: string | null; onSelect: (id: string) => void
  onToggle: (id: string, enabled: boolean) => void; onDelete: (id: string) => void; onRun: (id: string) => void
}) {
  return (
    <div style={{ background: surface, border: `1px solid ${line}`, borderRadius: 14, padding: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 2 }}>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 700, letterSpacing: '-.01em', color: text }}>Mes workflows</div>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, color: muted2, letterSpacing: '.14em' }}>{workflows.length} total</span>
      </div>
      {workflows.length === 0 && (
        <div style={{ padding: '32px 16px', textAlign: 'center' }}>
          <p style={{ fontSize: 13, color: muted2 }}>Aucun workflow. Créez-en un.</p>
        </div>
      )}
      {workflows.map(w => {
        const active = w.id === selectedId
        const color = w.enabled ? cyan : muted2
        return (
          <div key={w.id} onClick={() => onSelect(w.id)} style={{
            padding: 10, borderRadius: 10, cursor: 'pointer',
            background: active ? surface2 : bg,
            border: active ? `1.5px solid ${cyan}` : `1px solid ${line}`,
            display: 'flex', flexDirection: 'column', gap: 6,
            boxShadow: active ? `0 0 0 3px ${cyan}1c` : 'none',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: w.enabled ? emerald : muted2, flexShrink: 0 }} />
              <span style={{ flex: 1, fontSize: 12.5, fontWeight: 700, color: text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{w.name}</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, padding: '2px 6px', borderRadius: 3, background: `${color}18`, color, letterSpacing: 1 }}>{w.trigger_type.toUpperCase()}</span>
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: muted, letterSpacing: '.1em' }}>
              {w.run_count} runs · {w.last_run_at ? new Date(w.last_run_at).toLocaleDateString('fr-FR') : 'jamais exécuté'}
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={e => { e.stopPropagation(); onRun(w.id) }} style={{
                flex: 1, padding: '5px 8px', borderRadius: 6, border: 'none', cursor: 'pointer',
                background: cyan + '20', color: cyan, fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 9.5, letterSpacing: '.1em',
              }}>▶ RUN</button>
              <button onClick={e => { e.stopPropagation(); onToggle(w.id, !w.enabled) }} style={{
                padding: '5px 8px', borderRadius: 6, border: `1px solid ${line}`, cursor: 'pointer',
                background: 'transparent', color: w.enabled ? amber : emerald, fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 9.5,
              }}>{w.enabled ? 'PAUSE' : 'ENABLE'}</button>
              <button onClick={e => { e.stopPropagation(); onDelete(w.id) }} style={{
                padding: '5px 8px', borderRadius: 6, border: `1px solid ${line}`, cursor: 'pointer',
                background: 'transparent', color: rose, fontFamily: 'var(--font-mono)', fontSize: 9.5,
              }}>🗑</button>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function N8nWorkflowsList({ workflows, loading, error }: { workflows: N8nWorkflow[]; loading: boolean; error: string | null }) {
  if (error?.includes('Non configuré') || error?.includes('URL')) return null
  return (
    <div style={{ background: surface, border: `1px solid ${line}`, borderRadius: 14, padding: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 2 }}>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 700, letterSpacing: '-.01em', color: text }}>Workflows n8n</div>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, color: muted2, letterSpacing: '.14em' }}>
          {loading ? '…' : error ? '⚠ erreur' : `${workflows.length} total`}
        </span>
      </div>
      {loading && <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: muted }}>Chargement…</div>}
      {error && !error.includes('Non configuré') && (
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#fb7185' }}>{error}</div>
      )}
      {!loading && !error && workflows.length === 0 && (
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: muted }}>Aucun workflow n8n. Configurez l&apos;URL n8n dans Settings.</div>
      )}
      {workflows.map(w => (
        <div key={w.id} style={{
          padding: 10, borderRadius: 10,
          background: surface2, border: `1px solid ${line}`,
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: w.active ? emerald : muted2, flexShrink: 0 }} />
          <span style={{ flex: 1, fontSize: 12.5, fontWeight: 700, color: text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{w.name}</span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, padding: '2px 6px', borderRadius: 3, background: w.active ? `${emerald}18` : `${muted2}18`, color: w.active ? emerald : muted2, letterSpacing: 1 }}>
            {w.active ? 'ACTIF' : 'INACTIF'}
          </span>
        </div>
      ))}
    </div>
  )
}

export default function AutomationsPage() {
  const { user } = useAuth()
  const isMobile = useIsMobile()
  const [dbWorkflows, setDbWorkflows] = useState<DbWorkflow[]>([])
  const [showNew, setShowNew] = useState(false)
  const [dbSelectedId, setDbSelectedId] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [runs, setRuns] = useState<AutoRun[]>([])
  const [runsLoading, setRunsLoading] = useState(false)
  const [n8nWorkflows, setN8nWorkflows] = useState<N8nWorkflow[]>([])
  const [n8nLoading, setN8nLoading] = useState(false)
  const [n8nError, setN8nError] = useState<string | null>(null)

  const selectedWorkflow = dbWorkflows.find(w => w.id === dbSelectedId) ?? null

  const loadRuns = useCallback(async (workflowId: string) => {
    setRunsLoading(true)
    try {
      const res = await fetch(`/api/studio/automations/runs?workflow_id=${encodeURIComponent(workflowId)}`)
      if (!res.ok) {
        setRuns([])
        const err = await res.json().catch(() => ({}))
        toast.error(err.error || 'Erreur chargement des runs')
        return
      }
      setRuns(await res.json())
    } catch {
      setRuns([])
      toast.error('Erreur réseau')
    } finally {
      setRunsLoading(false)
    }
  }, [])

  async function loadWorkflows() {
    if (!user) return
    const supabase = createSupabaseBrowser()
    const { data, error } = await supabase
      .from('automation_workflows')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
    if (error) { toast.error(error.message); return }
    setDbWorkflows((data as DbWorkflow[]) || [])
  }
  useEffect(() => { if (user) loadWorkflows() }, [user]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setN8nLoading(true)
    fetch('/api/studio/n8n/workflows')
      .then(r => {
        if (!r.ok) return r.json().then((e: { error?: string }) => { throw new Error(e.error || 'Erreur n8n') })
        return r.json()
      })
      .then((data: N8nWorkflow[]) => setN8nWorkflows(data))
      .catch((e: Error) => setN8nError(e.message))
      .finally(() => setN8nLoading(false))
  }, [])

  async function toggleWorkflow(id: string, enabled: boolean) {
    if (!user) return
    const supabase = createSupabaseBrowser()
    const { error } = await supabase
      .from('automation_workflows')
      .update({ enabled })
      .eq('id', id)
      .eq('user_id', user.id)
    if (error) { toast.error(error.message); return }
    setDbWorkflows(wf => wf.map(w => w.id === id ? { ...w, enabled } : w))
  }

  async function deleteWorkflow(id: string) {
    if (!user) return
    const supabase = createSupabaseBrowser()
    const { error } = await supabase
      .from('automation_workflows')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id)
    if (error) { toast.error(error.message); return }
    if (dbSelectedId === id) setDbSelectedId(null)
    toast.success('Workflow supprimé')
    setConfirmDelete(null)
    loadWorkflows()
  }

  useEffect(() => {
    if (!confirmDelete) return
    const id = confirmDelete
    toast('Supprimer ce workflow ?', {
      description: 'Cette action est irréversible.',
      action: { label: 'Supprimer', onClick: () => deleteWorkflow(id) },
      cancel: { label: 'Annuler', onClick: () => setConfirmDelete(null) },
    })
  }, [confirmDelete]) // eslint-disable-line react-hooks/exhaustive-deps

  async function runWorkflow(id: string) {
    const res = await fetch('/api/studio/automations/trigger', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      toast.error(err.error || 'Erreur déclenchement')
    } else {
      toast.success('Workflow déclenché !')
      loadWorkflows()
      loadRuns(id)
    }
  }

  const totalRuns = dbWorkflows.reduce((s, w) => s + w.run_count, 0)
  const activeCount = dbWorkflows.filter(w => w.enabled).length
  const pausedCount = dbWorkflows.filter(w => !w.enabled).length

  const successRuns = runs.filter(r => r.status === 'success')
  const successPct = runs.length > 0 ? Math.round((successRuns.length / runs.length) * 100) : null
  const runsWithDur = runs.filter(r => r.duration_ms !== null)
  const avgDur = runsWithDur.length > 0
    ? Math.round(runsWithDur.reduce((s, r) => s + r.duration_ms!, 0) / runsWithDur.length)
    : null

  const KPI_LIST = [
    { label: 'Total runs', value: String(totalRuns),          delta: '—',                    color: cyan    },
    { label: 'Success',    value: successPct !== null ? `${successPct}%` : '—', delta: dbSelectedId ? `${runs.length} runs` : 'sélect. wf', color: emerald },
    { label: 'Avg durée',  value: avgDur !== null ? `${avgDur}ms` : '—',        delta: dbSelectedId ? `${runsWithDur.length} mesures` : 'sélect. wf', color: violet  },
    { label: 'En queue',   value: '—',                        delta: '—',                    color: amber   },
    { label: 'Workflows',  value: String(dbWorkflows.length), delta: `${pausedCount} paused`, color: fuchsia },
  ]

  const headerActions = (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      <button onClick={() => setShowNew(n => !n)} style={{
        padding: '8px 14px', borderRadius: 999,
        background: accent, color: '#0b0d12', border: 'none', cursor: 'pointer',
        fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 12, letterSpacing: '.04em',
      }}>+ New workflow</button>
      {[
        { label: `${dbWorkflows.length} workflows`, color: muted },
        { label: `${activeCount} actifs`,  color: emerald },
        { label: `${totalRuns} runs`,      color: cyan },
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

        {showNew && <NewWorkflowForm onCreated={loadWorkflows} onClose={() => setShowNew(false)} />}

        {/* KPI strip */}
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(5, 1fr)', gap: 10 }}>
          {KPI_LIST.map(k => <AuKpi key={k.label} {...k} />)}
        </div>

        {/* DAG + workflows list */}
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 420px', gap: 14, alignItems: 'start' }}>
          <WorkflowDAG workflow={selectedWorkflow} runs={runs} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <DbWorkflowsList
              workflows={dbWorkflows}
              selectedId={dbSelectedId}
              onSelect={(id) => { setDbSelectedId(id); loadRuns(id) }}
              onToggle={toggleWorkflow}
              onDelete={setConfirmDelete}
              onRun={runWorkflow}
            />
            <N8nWorkflowsList workflows={n8nWorkflows} loading={n8nLoading} error={n8nError} />
          </div>
        </div>

        {/* Runs feed + service health */}
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1.4fr 1fr', gap: 14 }}>
          <RunsFeed runs={runs} loading={runsLoading} />
          <ServiceHealth />
        </div>
      </div>
    </CkShell>
  )
}
