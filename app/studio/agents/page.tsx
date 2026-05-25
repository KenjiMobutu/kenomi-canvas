'use client'
import React, { useMemo, useEffect, useState, useCallback } from 'react'
import {
  Check,
  CheckCircle2,
  Clock3,
  LayoutGrid,
  List,
  RefreshCw,
  ShieldAlert,
  Trash2,
  X,
  XCircle,
} from 'lucide-react'
import { CkShell } from '@/components/CkShell'
import { useIsMobile } from '@/lib/studio-utils'
import {
  surface,
  surface2,
  line,
  line2,
  text,
  muted,
  muted2,
  accent,
  emerald,
  amber,
  rose,
  cyan,
  violet,
} from '@/lib/ck-vars'
import { AGENTS_DATA, sparkPath, areaPath, useTick } from '@/lib/studio-utils'
import { createSupabaseBrowser } from '@/lib/supabase-browser'
import { useAuth } from '@/lib/auth-context'
import { toast } from 'sonner'
import type { PipelineRow } from '@/lib/pipeline-types'
import { isAgentUnlocked, AGENT_CHAIN } from '@/lib/pipeline-types'
import {
  buildApprovalQueue,
  type AutonomyActionView,
  type AutonomyApprovalView,
  type ApprovalQueueItem,
} from '@/lib/autonomy/approval-view-model'
import {
  buildActionList,
  buildJobList,
  type AutonomyJobView,
} from '@/lib/autonomy/action-view-model'
import {
  getAgentCommandRefreshPlan,
  type AgentCommandRefreshTrigger,
} from '@/lib/agent-command-refresh'
import {
  buildAgentActivitySeries,
  buildAgentRunMetrics,
  type AgentRunMetric,
  type AgentRunMetricInput,
} from '@/lib/agent-run-metrics'
import { useGamification } from '@/lib/use-gamification'
import { HERMES_MODELS } from '@/lib/model-families'

interface AgentConfig {
  model: string
  system_prompt: string
  temperature: number
  max_tokens: number
}

const DEFAULT_CONFIG: AgentConfig = {
  model: 'qwen3:8b',
  system_prompt: '',
  temperature: 0.7,
  max_tokens: 2048,
}
const DEFAULT_CONFIG_BY_AGENT: Record<string, AgentConfig> = {
}
const MODELS = [...HERMES_MODELS, 'qwen3:8b', 'qwen3:14b', 'claude-sonnet-4-6', 'gpt-4o-mini']

interface DbAgentState {
  paused: boolean
}

interface OrchestrationStatus {
  due: { scheduleId: string; agentId: string; blockedByApproval: boolean }[]
  executable: { scheduleId: string; agentId: string; blockedByApproval: boolean }[]
  blocked: { scheduleId: string; agentId: string; blockedByApproval: boolean }[]
  update_errors: { scheduleId: string; agentId: string; message: string }[]
}

interface AutonomyJobsPayload {
  ok: boolean
  jobs: AutonomyJobView[]
  actions: AutonomyActionView[]
  approvals: AutonomyApprovalView[]
  errors?: { section: string; message: string }[]
}

function TunePanel({
  agentId,
  agentColor,
  onClose,
}: {
  agentId: string
  agentColor: string
  onClose: () => void
}) {
  const { user } = useAuth()
  const [cfg, setCfg] = useState<AgentConfig>(DEFAULT_CONFIG)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!user) return
    setCfg(DEFAULT_CONFIG_BY_AGENT[agentId] ?? DEFAULT_CONFIG)
    const supabase = createSupabaseBrowser()
    let cancelled = false
    supabase
      .from('agent_configs')
      .select('*')
      .eq('user_id', user.id)
      .eq('agent_id', agentId)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return
        if (data)
          setCfg({
            model: data.model,
            system_prompt: data.system_prompt,
            temperature: data.temperature,
            max_tokens: data.max_tokens,
          })
      })
    return () => {
      cancelled = true
    }
  }, [agentId, user])

  async function save() {
    if (!user) return
    setSaving(true)
    const supabase = createSupabaseBrowser()
    const { error } = await supabase.from('agent_configs').upsert(
      {
        user_id: user.id,
        agent_id: agentId,
        ...cfg,
      },
      { onConflict: 'user_id,agent_id' }
    )
    setSaving(false)
    if (error) return toast.error(error.message)
    toast.success('Config sauvegardée')
    onClose()
  }

  return (
    <div
      style={{
        background: surface,
        border: `1px solid ${line2}`,
        borderRadius: 12,
        padding: 20,
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
        borderTop: `2px solid ${agentColor}`,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div
          style={{ fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 700, color: text }}
        >
          Configuration agent
        </div>
        <button
          onClick={onClose}
          style={{
            background: 'transparent',
            border: 'none',
            color: muted,
            cursor: 'pointer',
            fontSize: 16,
          }}
        >
          ✕
        </button>
      </div>

      <div>
        <div
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 9.5,
            color: muted,
            letterSpacing: '.14em',
            textTransform: 'uppercase',
            marginBottom: 6,
          }}
        >
          Modèle
        </div>
        <select
          value={cfg.model}
          onChange={(e) => setCfg((p) => ({ ...p, model: e.target.value }))}
          className="ck-select"
          style={{ width: '100%' }}
        >
          {MODELS.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </div>

      <div>
        <div
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 9.5,
            color: muted,
            letterSpacing: '.14em',
            textTransform: 'uppercase',
            marginBottom: 6,
          }}
        >
          System prompt
        </div>
        <textarea
          value={cfg.system_prompt}
          onChange={(e) => setCfg((p) => ({ ...p, system_prompt: e.target.value }))}
          rows={5}
          className="ck-input"
          placeholder="Tu es un agent spécialisé dans…"
          style={{
            width: '100%',
            resize: 'vertical',
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
          }}
        />
      </div>

      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 9.5,
              color: muted,
              letterSpacing: '.14em',
              textTransform: 'uppercase',
            }}
          >
            Température
          </span>
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              color: agentColor,
              fontWeight: 700,
            }}
          >
            {cfg.temperature.toFixed(2)}
          </span>
        </div>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={cfg.temperature}
          onChange={(e) => setCfg((p) => ({ ...p, temperature: parseFloat(e.target.value) }))}
          style={{ width: '100%', accentColor: agentColor }}
        />
      </div>

      <div>
        <div
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 9.5,
            color: muted,
            letterSpacing: '.14em',
            textTransform: 'uppercase',
            marginBottom: 6,
          }}
        >
          Max tokens
        </div>
        <input
          type="number"
          value={cfg.max_tokens}
          min={128}
          max={32768}
          step={128}
          onChange={(e) => setCfg((p) => ({ ...p, max_tokens: parseInt(e.target.value) || 2048 }))}
          className="ck-input"
          style={{ width: '100%' }}
        />
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={save}
          disabled={saving}
          style={{
            flex: 1,
            padding: '10px 12px',
            borderRadius: 8,
            background: agentColor,
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
          onClick={onClose}
          style={{
            padding: '10px 12px',
            borderRadius: 8,
            background: 'transparent',
            color: muted,
            border: `1px solid ${line}`,
            cursor: 'pointer',
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
          }}
        >
          Annuler
        </button>
      </div>
    </div>
  )
}

type AgentData = (typeof AGENTS_DATA)[0]
type AgentLevelView = { level: number; xpBar: number }
type AgentCard = AgentData & AgentLevelView

const QUEUE: Record<string, string[]> = {}

function minutesAgo(isoDate: string): string {
  return `${Math.round((Date.now() - new Date(isoDate).getTime()) / 60000)}m`
}

function StatBox({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div
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
        {label}
      </div>
      <div
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: 18,
          fontWeight: 800,
          color,
          marginTop: 2,
          letterSpacing: '-.02em',
        }}
      >
        {value}
      </div>
    </div>
  )
}

const AGENT_SIGIL_COLORS: Record<string, string> = {
  scout: '#22d3ee',
  validation: '#a78bfa',
  builder: '#34d399',
  payment: '#fbbf24',
  marketing: '#e879f9',
  decision: '#ff6a3d',
}
const AGENT_LABELS: Record<string, string> = {
  scout: 'SCT',
  validation: 'VAL',
  builder: 'BLD',
  payment: 'PAY',
  marketing: 'MKT',
  decision: 'DEC',
}

function PipelineStatusBar({ pipeline }: { pipeline: PipelineRow | null }) {
  const outputByAgent: Record<string, string | null | undefined> = {
    scout: pipeline ? 'done' : null,
    validation: pipeline?.validation_output,
    builder: pipeline?.builder_output,
    payment: pipeline?.payment_output,
    marketing: pipeline?.marketing_output,
    decision: pipeline?.decision_output,
  }
  return (
    <div
      style={{
        background: surface,
        border: `1px solid ${line}`,
        borderRadius: 12,
        padding: '10px 16px',
        display: 'flex',
        alignItems: 'center',
        gap: 0,
      }}
    >
      <span
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 9,
          color: muted,
          letterSpacing: '.14em',
          textTransform: 'uppercase',
          marginRight: 14,
          flexShrink: 0,
        }}
      >
        Pipeline
      </span>
      {AGENT_CHAIN.map((id, i) => {
        const output = outputByAgent[id]
        const isDone = output != null
        const isRunning = pipeline?.current_agent === id
        const isNext =
          !isDone && !isRunning && pipeline?.status === 'approved' && isAgentUnlocked(id, pipeline)
        const agentColor = AGENT_SIGIL_COLORS[id] ?? muted2
        const labelColor = isDone ? emerald : isRunning ? cyan : isNext ? accent : muted2
        return (
          <div key={id} style={{ display: 'flex', alignItems: 'center' }}>
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 3,
                padding: '4px 10px',
              }}
            >
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: '50%',
                  background: isDone ? `${agentColor}22` : surface2,
                  border: `1.5px solid ${isDone || isRunning || isNext ? agentColor : line}`,
                  display: 'grid',
                  placeItems: 'center',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 8,
                  fontWeight: 800,
                  color: isDone || isRunning || isNext ? agentColor : muted2,
                }}
              >
                {isDone ? '✓' : isRunning ? '⟳' : AGENT_LABELS[id]}
              </div>
              <span
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 7.5,
                  color: labelColor,
                  letterSpacing: '.1em',
                }}
              >
                {AGENT_LABELS[id]}
              </span>
            </div>
            {i < AGENT_CHAIN.length - 1 && (
              <div
                style={{
                  width: 20,
                  height: 1,
                  background: isDone ? agentColor : line,
                  opacity: 0.5,
                }}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}

function PipelineValidationCard({
  pipeline,
  onApprove,
  onReject,
  loading,
}: {
  pipeline: PipelineRow
  onApprove: () => void
  onReject: () => void
  loading: boolean
}) {
  return (
    <div
      style={{
        background: surface,
        border: `2px solid ${cyan}`,
        borderRadius: 14,
        padding: 18,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          position: 'absolute',
          right: -20,
          top: -20,
          fontFamily: 'var(--font-display)',
          fontSize: 180,
          fontWeight: 800,
          color: cyan,
          opacity: 0.04,
          lineHeight: 1,
          pointerEvents: 'none',
          userSelect: 'none',
        }}
      >
        ◬
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 9,
            padding: '3px 8px',
            borderRadius: 4,
            background: `${cyan}22`,
            color: cyan,
            letterSpacing: 1.5,
            fontWeight: 800,
          }}
        >
          SCOUT · VALIDATION REQUISE
        </span>
      </div>
      <div
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: 22,
          fontWeight: 800,
          letterSpacing: '-.02em',
          color: text,
        }}
      >
        {pipeline.idea_title || 'Idée sans titre'}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        {(
          [
            { label: 'Niche', value: pipeline.idea_niche },
            { label: 'Marché', value: pipeline.idea_market },
            { label: 'Problème', value: pipeline.idea_problem },
            { label: 'Solution', value: pipeline.idea_solution },
          ] as { label: string; value: string }[]
        ).map(({ label, value }) => (
          <div
            key={label}
            style={{
              padding: '8px 10px',
              borderRadius: 8,
              background: surface2,
              border: `1px solid ${line}`,
            }}
          >
            <div
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 8.5,
                color: muted,
                letterSpacing: '.14em',
                textTransform: 'uppercase',
                marginBottom: 3,
              }}
            >
              {label}
            </div>
            <div style={{ fontSize: 12, color: text, lineHeight: 1.4 }}>{value || '—'}</div>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={onApprove}
          disabled={loading}
          style={{
            flex: 1,
            padding: '11px 14px',
            borderRadius: 8,
            background: loading ? `${emerald}55` : emerald,
            color: '#0b0d12',
            border: 'none',
            fontFamily: 'var(--font-display)',
            fontWeight: 800,
            fontSize: 13,
            letterSpacing: '.06em',
            cursor: loading ? 'not-allowed' : 'pointer',
            opacity: loading ? 0.7 : 1,
          }}
        >
          {loading ? '…' : '✓ Valider cette idée'}
        </button>
        <button
          onClick={onReject}
          disabled={loading}
          style={{
            padding: '11px 14px',
            borderRadius: 8,
            background: `${rose}18`,
            color: rose,
            border: `1px solid ${rose}44`,
            fontFamily: 'var(--font-mono)',
            fontWeight: 700,
            fontSize: 10,
            letterSpacing: '.14em',
            cursor: loading ? 'not-allowed' : 'pointer',
          }}
        >
          REJETER
        </button>
      </div>
    </div>
  )
}

const ACTION_LABELS: Record<string, string> = {
  scale_budget: 'Scale budget',
  stop_venture: 'Stop venture',
  publish_campaign: 'Publish campaign',
  create_checkout: 'Create checkout',
  deploy: 'Deploy',
  run_agent: 'Run agent',
  create_landing: 'Create landing',
}

const APPROVAL_COLORS: Record<string, string> = {
  pending: amber,
  approved: emerald,
  rejected: rose,
  expired: muted2,
}

function getActionLabel(actionType?: string): string {
  if (!actionType) return 'Action inconnue'
  return ACTION_LABELS[actionType] ?? actionType.replaceAll('_', ' ')
}

function compactDate(isoDate?: string | null): string {
  if (!isoDate) return '—'
  return new Date(isoDate).toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function ApprovalStatusIcon({ status }: { status: string }) {
  if (status === 'approved') return <CheckCircle2 size={14} />
  if (status === 'rejected') return <XCircle size={14} />
  return <Clock3 size={14} />
}

function ApprovalGatesPanel({
  queue,
  loading,
  resolvingKey,
  deletingKey,
  onResolve,
  onDelete,
  onRefresh,
}: {
  queue: ApprovalQueueItem[]
  loading: boolean
  resolvingKey: string | null
  deletingKey: string | null
  onResolve: (approvalId: string, decision: 'approved' | 'rejected') => void
  onDelete: (approvalId: string) => void
  onRefresh: () => void
}) {
  const [viewMode, setViewMode] = useState<'cards' | 'list'>('cards')
  const pendingCount = queue.filter((item) => item.isPending).length

  return (
    <div
      style={{
        background: surface,
        border: `1px solid ${pendingCount > 0 ? `${amber}66` : line}`,
        borderRadius: 14,
        padding: 16,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <div
            style={{
              width: 34,
              height: 34,
              borderRadius: 9,
              background: `${amber}16`,
              border: `1px solid ${amber}55`,
              color: amber,
              display: 'grid',
              placeItems: 'center',
              flexShrink: 0,
            }}
          >
            <ShieldAlert size={17} />
          </div>
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 14,
                fontWeight: 800,
                color: text,
                letterSpacing: '-.01em',
              }}
            >
              Approval Gates
            </div>
            <div
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 9.5,
                color: muted2,
                letterSpacing: '.12em',
                textTransform: 'uppercase',
                marginTop: 2,
              }}
            >
              {pendingCount} pending · {queue.length} total
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {(['cards', 'list'] as const).map((mode) => {
            const active = viewMode === mode
            const Icon = mode === 'cards' ? LayoutGrid : List
            return (
              <button
                key={mode}
                type="button"
                onClick={() => setViewMode(mode)}
                title={mode === 'cards' ? 'Vue cards' : 'Vue liste'}
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 8,
                  display: 'grid',
                  placeItems: 'center',
                  background: active ? `${amber}18` : surface2,
                  color: active ? amber : muted,
                  border: `1px solid ${active ? `${amber}45` : line2}`,
                  cursor: 'pointer',
                }}
              >
                <Icon size={14} />
              </button>
            )
          })}
          <button
            onClick={onRefresh}
            disabled={loading}
            title="Rafraîchir"
            style={{
              width: 34,
              height: 34,
              borderRadius: 8,
              display: 'grid',
              placeItems: 'center',
              background: surface2,
              color: loading ? muted2 : text,
              border: `1px solid ${line2}`,
              cursor: loading ? 'not-allowed' : 'pointer',
            }}
          >
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      {queue.length === 0 ? (
        <div
          style={{
            padding: '14px 12px',
            borderRadius: 10,
            background: surface2,
            border: `1px dashed ${line2}`,
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
            color: muted,
            letterSpacing: '.08em',
            textTransform: 'uppercase',
          }}
        >
          Aucun gate en attente
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns:
              viewMode === 'cards' ? 'repeat(auto-fit, minmax(260px, 1fr))' : '1fr',
            gap: 10,
          }}
        >
          {queue.map((item) => {
            const statusColor = APPROVAL_COLORS[item.approval.status] ?? muted2
            const actionInput = item.action?.input ?? {}
            const nextStep =
              typeof actionInput.next_step === 'string'
                ? actionInput.next_step
                : item.approval.reason
            const rationale =
              typeof actionInput.rationale === 'string' ? actionInput.rationale : null
            const approveKey = `${item.approval.id}:approved`
            const rejectKey = `${item.approval.id}:rejected`

            return (
              <div
                key={item.approval.id}
                style={{
                  background: surface2,
                  border: `1px solid ${item.isPending ? `${statusColor}55` : line}`,
                  borderRadius: 10,
                  padding: 12,
                  display: viewMode === 'cards' ? 'flex' : 'grid',
                  gridTemplateColumns:
                    viewMode === 'list'
                      ? 'minmax(180px, 1.1fr) minmax(220px, 2fr) auto'
                      : undefined,
                  alignItems: viewMode === 'list' ? 'center' : undefined,
                  flexDirection: 'column',
                  gap: 10,
                  minWidth: 0,
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: 10,
                    alignItems: 'flex-start',
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div
                      style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}
                    >
                      <span
                        style={{
                          fontFamily: 'var(--font-mono)',
                          fontSize: 8.5,
                          padding: '3px 7px',
                          borderRadius: 4,
                          background: `${statusColor}18`,
                          color: statusColor,
                          border: `1px solid ${statusColor}30`,
                          letterSpacing: '.14em',
                          textTransform: 'uppercase',
                          fontWeight: 800,
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 5,
                        }}
                      >
                        <ApprovalStatusIcon status={item.approval.status} />
                        {item.approval.status}
                      </span>
                      <span
                        style={{
                          fontFamily: 'var(--font-mono)',
                          fontSize: 9,
                          color: muted2,
                          letterSpacing: '.08em',
                        }}
                      >
                        {compactDate(item.approval.created_at)}
                      </span>
                    </div>
                    <div
                      style={{
                        fontFamily: 'var(--font-display)',
                        fontSize: 16,
                        color: text,
                        fontWeight: 800,
                        marginTop: 8,
                        letterSpacing: '-.01em',
                      }}
                    >
                      {getActionLabel(item.action?.action_type)}
                    </div>
                  </div>
                  {item.confidence !== null && (
                    <div style={{ flexShrink: 0, textAlign: 'right' }}>
                      <div
                        style={{
                          fontFamily: 'var(--font-mono)',
                          fontSize: 8.5,
                          color: muted2,
                          letterSpacing: '.12em',
                          textTransform: 'uppercase',
                        }}
                      >
                        conf
                      </div>
                      <div
                        style={{
                          fontFamily: 'var(--font-display)',
                          fontSize: 18,
                          color: cyan,
                          fontWeight: 800,
                        }}
                      >
                        {item.confidence}
                      </div>
                    </div>
                  )}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {item.budgetBreach && (
                    <div
                      style={{
                        padding: '8px 10px',
                        borderRadius: 7,
                        background: `${rose}14`,
                        border: `1px solid ${rose}40`,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        fontFamily: 'var(--font-mono)',
                        fontSize: 10,
                        color: rose,
                        letterSpacing: '.06em',
                      }}
                    >
                      <ShieldAlert size={12} />
                      <span style={{ fontWeight: 800, textTransform: 'uppercase' }}>
                        Budget cap : {item.budgetBreach.reason.replace(/_/g, ' ')}
                      </span>
                      {item.budgetBreach.detail && (
                        <span style={{ color: muted, fontWeight: 600 }}>
                          ({item.budgetBreach.detail})
                        </span>
                      )}
                    </div>
                  )}
                  {nextStep && (
                    <div style={{ fontSize: 12, color: text, lineHeight: 1.45 }}>{nextStep}</div>
                  )}
                  {rationale && (
                    <div
                      style={{
                        fontSize: 11,
                        color: muted,
                        lineHeight: 1.45,
                        borderLeft: `2px solid ${statusColor}`,
                        paddingLeft: 8,
                      }}
                    >
                      {rationale}
                    </div>
                  )}
                </div>

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: item.isPending ? '1fr 1fr 34px' : '1fr 34px',
                    gap: 8,
                  }}
                >
                  {item.isPending ? (
                    <>
                      <button
                        onClick={() => onResolve(item.approval.id, 'approved')}
                        disabled={resolvingKey !== null}
                        style={{
                          minHeight: 34,
                          borderRadius: 8,
                          border: `1px solid ${emerald}55`,
                          background: emerald,
                          color: '#0b0d12',
                          fontFamily: 'var(--font-display)',
                          fontSize: 11,
                          fontWeight: 800,
                          cursor: resolvingKey ? 'not-allowed' : 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 6,
                          opacity: resolvingKey ? 0.65 : 1,
                        }}
                      >
                        <Check size={14} />
                        {resolvingKey === approveKey ? '...' : 'Approve'}
                      </button>
                      <button
                        onClick={() => onResolve(item.approval.id, 'rejected')}
                        disabled={resolvingKey !== null}
                        style={{
                          minHeight: 34,
                          borderRadius: 8,
                          border: `1px solid ${rose}55`,
                          background: `${rose}16`,
                          color: rose,
                          fontFamily: 'var(--font-display)',
                          fontSize: 11,
                          fontWeight: 800,
                          cursor: resolvingKey ? 'not-allowed' : 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 6,
                          opacity: resolvingKey ? 0.65 : 1,
                        }}
                      >
                        <X size={14} />
                        {resolvingKey === rejectKey ? '...' : 'Reject'}
                      </button>
                      <button
                        onClick={() => onDelete(item.approval.id)}
                        disabled={deletingKey !== null || resolvingKey !== null}
                        title="Supprimer ce gate"
                        style={{
                          minHeight: 34,
                          borderRadius: 8,
                          border: `1px solid ${rose}55`,
                          background: `${rose}12`,
                          color: rose,
                          cursor: deletingKey || resolvingKey ? 'not-allowed' : 'pointer',
                          display: 'grid',
                          placeItems: 'center',
                          opacity: deletingKey || resolvingKey ? 0.65 : 1,
                        }}
                      >
                        {deletingKey === item.approval.id ? '…' : <Trash2 size={13} />}
                      </button>
                    </>
                  ) : (
                    <>
                      <div
                        style={{
                          minHeight: 34,
                          borderRadius: 8,
                          border: `1px solid ${line}`,
                          color: muted,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontFamily: 'var(--font-mono)',
                          fontSize: 9,
                          letterSpacing: '.14em',
                          textTransform: 'uppercase',
                        }}
                      >
                        action {item.action?.status ?? 'unknown'}
                      </div>
                      <button
                        onClick={() => onDelete(item.approval.id)}
                        disabled={deletingKey !== null || resolvingKey !== null}
                        title="Supprimer ce gate"
                        style={{
                          minHeight: 34,
                          borderRadius: 8,
                          border: `1px solid ${rose}55`,
                          background: `${rose}12`,
                          color: rose,
                          cursor: deletingKey || resolvingKey ? 'not-allowed' : 'pointer',
                          display: 'grid',
                          placeItems: 'center',
                          opacity: deletingKey || resolvingKey ? 0.65 : 1,
                        }}
                      >
                        {deletingKey === item.approval.id ? '…' : <Trash2 size={13} />}
                      </button>
                    </>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

type ObservabilityTab = 'jobs' | 'actions' | 'approvals'

function StatusPill({ status }: { status: string }) {
  const color =
    status === 'completed' || status === 'approved' || status === 'published'
      ? emerald
      : status === 'failed' || status === 'rejected'
        ? rose
        : status === 'blocked' || status === 'pending'
          ? amber
          : muted

  return (
    <span
      style={{
        fontFamily: 'var(--font-mono)',
        fontSize: 8.5,
        padding: '3px 7px',
        borderRadius: 4,
        background: `${color}18`,
        border: `1px solid ${color}35`,
        color,
        letterSpacing: '.12em',
        textTransform: 'uppercase',
        fontWeight: 800,
        whiteSpace: 'nowrap',
      }}
    >
      {status}
    </span>
  )
}

function AutonomyObservabilityPanel({
  jobs,
  actions,
  approvals,
  approvalQueue,
  operatingJobKey,
  onJobAction,
}: {
  jobs: AutonomyJobView[]
  actions: AutonomyActionView[]
  approvals: AutonomyApprovalView[]
  approvalQueue: ApprovalQueueItem[]
  operatingJobKey: string | null
  onJobAction: (jobId: string, type: 'retry_job' | 'cancel_job') => void
}) {
  const [tab, setTab] = useState<ObservabilityTab>('jobs')
  const jobItems = useMemo(() => buildJobList(jobs), [jobs])
  const actionItems = useMemo(() => buildActionList(actions), [actions])

  const tabs: Array<{ id: ObservabilityTab; label: string; count: number }> = [
    { id: 'jobs', label: 'Jobs', count: jobItems.length },
    { id: 'actions', label: 'Actions', count: actionItems.length },
    { id: 'approvals', label: 'Approvals', count: approvals.length },
  ]

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
          alignItems: 'center',
          justifyContent: 'space-between',
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
            }}
          >
            Autonomy Ops
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
            jobs · actions · approvals
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {tabs.map((item) => (
            <button
              key={item.id}
              onClick={() => setTab(item.id)}
              style={{
                minHeight: 30,
                padding: '5px 9px',
                borderRadius: 7,
                border: `1px solid ${tab === item.id ? line2 : line}`,
                background: tab === item.id ? surface2 : 'transparent',
                color: tab === item.id ? text : muted,
                fontFamily: 'var(--font-mono)',
                fontSize: 9,
                letterSpacing: '.12em',
                textTransform: 'uppercase',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              {item.label}
              <span style={{ color: item.count > 0 ? cyan : muted2 }}>{item.count}</span>
            </button>
          ))}
        </div>
      </div>

      {tab === 'jobs' && (
        <div style={{ display: 'grid', gap: 8 }}>
          {jobItems.length === 0 ? (
            <EmptyOpsRow label="Aucun job enregistré" />
          ) : (
            jobItems.slice(0, 8).map((job) => {
              const canRetry = job.status === 'failed' || job.status === 'cancelled'
              const canCancel = job.status === 'queued'
              const retryKey = `${job.id}:retry_job`
              const cancelKey = `${job.id}:cancel_job`

              return (
                <div key={job.id} style={opsRowStyle}>
                  <div style={{ minWidth: 0 }}>
                    <div style={opsTitleStyle}>{job.label}</div>
                    <div style={opsMetaStyle}>
                      retry {job.retryCount} · next {compactDate(job.nextRunAt)} ·{' '}
                      {job.lastError ?? 'no error'}
                    </div>
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'flex-end',
                      gap: 8,
                      flexWrap: 'wrap',
                    }}
                  >
                    {(canRetry || canCancel) && (
                      <div style={{ display: 'flex', gap: 6 }}>
                        {canRetry && (
                          <button
                            type="button"
                            onClick={() => onJobAction(job.id, 'retry_job')}
                            disabled={operatingJobKey !== null}
                            style={opsMiniButtonStyle(emerald, operatingJobKey !== null)}
                          >
                            <RefreshCw size={12} />
                            {operatingJobKey === retryKey ? '...' : 'Retry'}
                          </button>
                        )}
                        {canCancel && (
                          <button
                            type="button"
                            onClick={() => onJobAction(job.id, 'cancel_job')}
                            disabled={operatingJobKey !== null}
                            style={opsMiniButtonStyle(rose, operatingJobKey !== null)}
                          >
                            <X size={12} />
                            {operatingJobKey === cancelKey ? '...' : 'Cancel'}
                          </button>
                        )}
                      </div>
                    )}
                    <StatusPill status={job.status} />
                  </div>
                </div>
              )
            })
          )}
        </div>
      )}

      {tab === 'actions' && (
        <div style={{ display: 'grid', gap: 8 }}>
          {actionItems.length === 0 ? (
            <EmptyOpsRow label="Aucune action enregistrée" />
          ) : (
            actionItems.slice(0, 8).map((action) => (
              <div key={action.id} style={opsRowStyle}>
                <div style={{ minWidth: 0 }}>
                  <div style={opsTitleStyle}>{action.label}</div>
                  <div style={opsMetaStyle}>
                    risk {action.riskLevel} · {action.provider ?? 'provider —'} ·{' '}
                    {action.model ?? 'model —'} · {action.durationMs ?? '—'}ms
                    {action.lastError ? ` · ${action.lastError}` : ''}
                  </div>
                </div>
                <StatusPill status={action.status} />
              </div>
            ))
          )}
        </div>
      )}

      {tab === 'approvals' && (
        <div style={{ display: 'grid', gap: 8 }}>
          {approvalQueue.length === 0 ? (
            <EmptyOpsRow label="Aucune approbation enregistrée" />
          ) : (
            approvalQueue.slice(0, 8).map((item) => (
              <div key={item.approval.id} style={opsRowStyle}>
                <div style={{ minWidth: 0 }}>
                  <div style={opsTitleStyle}>{getActionLabel(item.action?.action_type)}</div>
                  <div style={opsMetaStyle}>
                    {compactDate(item.approval.created_at)} ·{' '}
                    {item.budgetBreach?.reason ?? item.approval.reason ?? 'no reason'}
                  </div>
                </div>
                <StatusPill status={item.approval.status} />
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}

const opsRowStyle: React.CSSProperties = {
  minHeight: 48,
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: 12,
  padding: '9px 10px',
  borderRadius: 9,
  background: surface2,
  border: `1px solid ${line}`,
}

const opsTitleStyle: React.CSSProperties = {
  fontFamily: 'var(--font-display)',
  fontSize: 12,
  fontWeight: 800,
  color: text,
  textTransform: 'capitalize',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
}

const opsMetaStyle: React.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 9,
  color: muted,
  marginTop: 3,
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
}

function opsMiniButtonStyle(color: string, disabled: boolean): React.CSSProperties {
  return {
    minHeight: 28,
    padding: '4px 8px',
    borderRadius: 7,
    border: `1px solid ${color}55`,
    background: `${color}14`,
    color,
    fontFamily: 'var(--font-display)',
    fontSize: 10,
    fontWeight: 800,
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.6 : 1,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
  }
}

function EmptyOpsRow({ label }: { label: string }) {
  return (
    <div
      style={{
        padding: '14px 12px',
        borderRadius: 9,
        background: surface2,
        border: `1px dashed ${line2}`,
        color: muted,
        fontFamily: 'var(--font-mono)',
        fontSize: 9.5,
        letterSpacing: '.12em',
        textTransform: 'uppercase',
      }}
    >
      {label}
    </div>
  )
}

function AgentInspector({
  agent,
  activity,
  queue,
  pipeline,
  setPipeline,
  runMetric,
  onRunComplete,
}: {
  agent: AgentCard
  activity: number[]
  queue: string[]
  pipeline: PipelineRow | null
  setPipeline: React.Dispatch<React.SetStateAction<PipelineRow | null>>
  runMetric: AgentRunMetric
  onRunComplete?: () => void
}) {
  const { user } = useAuth()
  const t = useTick(2400)
  const [tuneOpen, setTuneOpen] = useState(false)
  const [logsOpen, setLogsOpen] = useState(false)
  const [logs, setLogs] = useState<
    { prompt: string; response: string; duration_ms: number; created_at: string }[]
  >([])
  const [running, setRunning] = useState(false)
  const [dbState, setDbState] = useState<DbAgentState>({
    paused: false,
  })

  useEffect(() => {
    if (!user) return
    const supabase = createSupabaseBrowser()
    supabase
      .from('agent_configs')
      .select('paused')
      .eq('user_id', user.id)
      .eq('agent_id', agent.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data)
          setDbState({
            paused: data.paused ?? false,
          })
        else setDbState({ paused: false })
      })
  }, [agent.id, user])

  async function handleRun() {
    setRunning(true)
    try {
      const res = await fetch('/api/studio/agents/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId: agent.id }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || 'Erreur run agent')
      } else {
        toast.success(`${agent.name} — mission complète (${data.durationMs}ms)`)
        if (agent.id === 'scout' && data.pipeline) {
          setPipeline(data.pipeline as PipelineRow)
        }
        onRunComplete?.()
      }
    } catch {
      toast.error('Erreur réseau')
    } finally {
      setRunning(false)
    }
  }

  async function handlePause() {
    if (!user) return
    const supabase = createSupabaseBrowser()
    const newPaused = !dbState.paused
    const { error } = await supabase.from('agent_configs').upsert(
      {
        user_id: user.id,
        agent_id: agent.id,
        paused: newPaused,
      },
      { onConflict: 'user_id,agent_id' }
    )
    if (error) return toast.error(error.message)
    setDbState((s) => ({ ...s, paused: newPaused }))
    toast.success(newPaused ? `${agent.name} mis en pause` : `${agent.name} réactivé`)
  }

  async function handleLogs() {
    if (!user) return
    const supabase = createSupabaseBrowser()
    const { data } = await supabase
      .from('agent_runs')
      .select('prompt, response, duration_ms, created_at')
      .eq('user_id', user.id)
      .eq('agent_id', agent.id)
      .order('created_at', { ascending: false })
      .limit(10)
    setLogs(data ?? [])
    setLogsOpen(true)
  }

  const unlocked = isAgentUnlocked(agent.id, pipeline)
  const lockReason = !unlocked
    ? pipeline?.status === 'pending_validation'
      ? "Validez l'idée Scout d'abord"
      : "Attendez l'agent précédent"
    : ''

  return (
    <div
      style={{
        background: surface,
        border: `1px solid ${line}`,
        borderRadius: 14,
        padding: 18,
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
        borderTop: `3px solid ${agent.color}`,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          position: 'absolute',
          right: -30,
          bottom: -50,
          fontFamily: 'var(--font-display)',
          fontSize: 280,
          fontWeight: 800,
          color: agent.color,
          opacity: 0.05,
          lineHeight: 1,
          pointerEvents: 'none',
          userSelect: 'none',
        }}
      >
        {agent.sigil}
      </div>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, position: 'relative' }}>
        <div style={{ position: 'relative', width: 72, height: 72, flexShrink: 0 }}>
          <div
            style={{
              position: 'absolute',
              inset: 0,
              borderRadius: 14,
              background: `conic-gradient(from ${t * 360}deg, ${agent.color}, transparent 60%, ${agent.color})`,
              opacity: 0.7,
            }}
          />
          <div
            style={{
              position: 'absolute',
              inset: 3,
              borderRadius: 11,
              background: surface2,
              border: `1px solid ${agent.color}55`,
              display: 'grid',
              placeItems: 'center',
              fontFamily: 'var(--font-display)',
              fontWeight: 800,
              fontSize: 36,
              color: agent.color,
            }}
          >
            {agent.sigil}
          </div>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 10,
              color: muted,
              letterSpacing: '.14em',
              textTransform: 'uppercase',
            }}
          >
            {agent.code} · {agent.role}
          </div>
          <div
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 26,
              fontWeight: 800,
              letterSpacing: '-.02em',
              marginTop: 2,
              color: text,
            }}
          >
            {agent.name} Agent
          </div>
          <div style={{ fontSize: 12, color: muted, marginTop: 2 }}>{agent.tagline}</div>
        </div>
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            padding: '5px 10px',
            borderRadius: 4,
            flexShrink: 0,
            background: `${agent.color}1f`,
            color: agent.color,
            letterSpacing: 1.5,
            fontWeight: 800,
          }}
        >
          LV {agent.level}
        </span>
      </div>

      {/* XP bar */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 10,
              color: muted,
              letterSpacing: '.14em',
              textTransform: 'uppercase',
            }}
          >
            Experience
          </span>
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 10,
              color: muted2,
              letterSpacing: '.1em',
            }}
          >
            {Math.round(agent.xpBar * 1000)} / 1000 · next: LV {agent.level + 1}
          </span>
        </div>
        <div
          style={{
            height: 8,
            borderRadius: 4,
            background: surface2,
            border: `1px solid ${line}`,
            overflow: 'hidden',
            position: 'relative',
          }}
        >
          <div
            style={{
              width: `${agent.xpBar * 100}%`,
              height: '100%',
              background: `linear-gradient(90deg, ${agent.color}, var(--ck-accent-2))`,
              boxShadow: `0 0 10px ${agent.color}`,
            }}
          />
          <div
            style={{
              position: 'absolute',
              inset: 0,
              backgroundImage:
                'linear-gradient(45deg, rgba(255,255,255,.1) 25%, transparent 25%, transparent 50%, rgba(255,255,255,.1) 50%, rgba(255,255,255,.1) 75%, transparent 75%)',
              backgroundSize: '10px 10px',
              opacity: 0.35,
            }}
          />
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
        <StatBox label="Runs" value={String(runMetric.run_count)} color={agent.color} />
        <StatBox
          label="Status"
          value={dbState.paused ? 'PAUSÉ' : 'ACTIF'}
          color={dbState.paused ? '#fbbf24' : emerald}
        />
        <StatBox
          label="Last"
          value={runMetric.last_run_at ? minutesAgo(runMetric.last_run_at) : '—'}
          color={cyan}
        />
        <StatBox label="LV" value={String(agent.level)} color={violet} />
      </div>
      <div
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 9.5,
          color: muted2,
          letterSpacing: '.1em',
          textTransform: 'uppercase',
        }}
      >
        source agent_runs · {runMetric.run_count === 0 ? 'aucun run enregistré' : 'historique réel'}
        {runMetric.run_count > 0
          ? ` · ${runMetric.total_tokens.toLocaleString('fr-FR')} tokens · $${runMetric.cost_usd.toFixed(3)}`
          : ''}
      </div>

      {/* Activity sparkline */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 10,
              color: muted,
              letterSpacing: '.14em',
              textTransform: 'uppercase',
            }}
          >
            Activity · 24h
          </span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: agent.color }}>
            {runMetric.runs_24h} runs
          </span>
        </div>
        <svg
          viewBox="0 0 240 60"
          preserveAspectRatio="none"
          style={{ width: '100%', height: 64, display: 'block' }}
        >
          <defs>
            <linearGradient id={`ag-${agent.id}`} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={agent.color} stopOpacity=".45" />
              <stop offset="100%" stopColor={agent.color} stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={areaPath(activity, 240, 60, 2)} fill={`url(#ag-${agent.id})`} />
          <path
            d={sparkPath(activity, 240, 60, 2)}
            fill="none"
            stroke={agent.color}
            strokeWidth="1.6"
          />
        </svg>
      </div>

      {/* Mission queue */}
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
          Mission queue · 3 prochaines
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {queue.length === 0 ? (
            <div style={{ padding: '16px 10px', textAlign: 'center' }}>
              <p style={{ fontSize: 12, color: muted2 }}>Aucune mission en queue</p>
            </div>
          ) : (
            queue.map((q, i) => (
              <div
                key={i}
                style={{
                  padding: '8px 10px',
                  borderRadius: 8,
                  background: surface2,
                  border: `1px dashed ${line2}`,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                }}
              >
                <span
                  style={{
                    width: 18,
                    height: 18,
                    borderRadius: '50%',
                    border: `1.5px solid ${agent.color}`,
                    display: 'grid',
                    placeItems: 'center',
                    flexShrink: 0,
                    fontFamily: 'var(--font-mono)',
                    fontSize: 9.5,
                    color: agent.color,
                    fontWeight: 700,
                  }}
                >
                  {i + 1}
                </span>
                <span style={{ fontSize: 12, color: text, flex: 1 }}>{q}</span>
                <span
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 9,
                    color: muted2,
                    flexShrink: 0,
                  }}
                >
                  ETA {(i + 1) * 4}m
                </span>
              </div>
            ))
          )}
        </div>
      </div>

      {runMetric.run_count === 0 && (
        <div
          style={{
            padding: '10px 12px',
            borderRadius: 8,
            border: `1px dashed ${line2}`,
            background: surface2,
            color: muted,
            fontSize: 12,
            lineHeight: 1.5,
          }}
        >
          Aucun run réel pour cet agent. Lancez une mission pour créer une ligne dans agent_runs.
        </div>
      )}

      {/* Controls */}
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={handleRun}
          disabled={running || dbState.paused || !unlocked}
          title={lockReason}
          style={{
            flex: 1,
            padding: '10px 12px',
            borderRadius: 8,
            background: running || dbState.paused || !unlocked ? `${agent.color}55` : agent.color,
            color: '#0b0d12',
            border: 'none',
            fontFamily: 'var(--font-display)',
            fontWeight: 800,
            fontSize: 12,
            letterSpacing: '.05em',
            cursor: running || dbState.paused || !unlocked ? 'not-allowed' : 'pointer',
            opacity: running || dbState.paused || !unlocked ? 0.7 : 1,
          }}
        >
          {running ? '⏳ Running…' : !unlocked ? `🔒 ${lockReason}` : '▶ Run mission'}
        </button>
        <button
          onClick={handlePause}
          style={{
            padding: '10px 12px',
            borderRadius: 8,
            background: dbState.paused ? '#fbbf2422' : surface2,
            color: dbState.paused ? '#fbbf24' : text,
            border: `1px solid ${dbState.paused ? '#fbbf2455' : line2}`,
            fontFamily: 'var(--font-mono)',
            fontWeight: 700,
            fontSize: 10,
            letterSpacing: '.14em',
            cursor: 'pointer',
          }}
        >
          {dbState.paused ? 'RESUME' : 'PAUSE'}
        </button>
        <button
          onClick={handleLogs}
          style={{
            padding: '10px 12px',
            borderRadius: 8,
            background: logsOpen ? `${agent.color}22` : surface2,
            color: logsOpen ? agent.color : text,
            border: `1px solid ${logsOpen ? `${agent.color}55` : line2}`,
            fontFamily: 'var(--font-mono)',
            fontWeight: 700,
            fontSize: 10,
            letterSpacing: '.14em',
            cursor: 'pointer',
          }}
        >
          LOGS
        </button>
        <button
          onClick={() => setTuneOpen((o) => !o)}
          style={{
            padding: '10px 12px',
            borderRadius: 8,
            background: tuneOpen ? agent.color + '22' : surface2,
            color: tuneOpen ? agent.color : text,
            border: `1px solid ${tuneOpen ? agent.color + '55' : line2}`,
            fontFamily: 'var(--font-mono)',
            fontWeight: 700,
            fontSize: 10,
            letterSpacing: '.14em',
            cursor: 'pointer',
          }}
        >
          TUNE
        </button>
      </div>

      {logsOpen && (
        <div
          style={{
            background: surface2,
            border: `1px solid ${line}`,
            borderRadius: 10,
            padding: 14,
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 10,
                color: muted,
                letterSpacing: '.14em',
                textTransform: 'uppercase',
              }}
            >
              Derniers logs · {agent.name}
            </span>
            <button
              onClick={() => setLogsOpen(false)}
              style={{ background: 'transparent', border: 'none', color: muted, cursor: 'pointer' }}
            >
              ✕
            </button>
          </div>
          {logs.length === 0 ? (
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: muted2 }}>
              Aucun log — déclenchez une mission d&apos;abord.
            </div>
          ) : (
            logs.map((l, i) => (
              <div
                key={i}
                style={{
                  padding: '8px 10px',
                  borderRadius: 8,
                  background: surface,
                  border: `1px solid ${line}`,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6,
                }}
              >
                <div
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 9,
                    color: muted,
                    letterSpacing: 1,
                    textTransform: 'uppercase',
                  }}
                >
                  {new Date(l.created_at).toLocaleString('fr-FR', {
                    dateStyle: 'short',
                    timeStyle: 'short',
                  })}{' '}
                  · {l.duration_ms}ms
                </div>
                <div
                  style={{
                    fontSize: 11,
                    color: muted,
                    fontFamily: 'var(--font-mono)',
                    overflow: 'hidden',
                    display: '-webkit-box',
                    WebkitLineClamp: 2 as React.CSSProperties['WebkitLineClamp'],
                    WebkitBoxOrient: 'vertical' as React.CSSProperties['WebkitBoxOrient'],
                  }}
                >
                  ▶ {l.prompt}
                </div>
                <div
                  style={{
                    fontSize: 12,
                    color: text,
                    lineHeight: 1.5,
                    overflow: 'hidden',
                    display: '-webkit-box',
                    WebkitLineClamp: 3 as React.CSSProperties['WebkitLineClamp'],
                    WebkitBoxOrient: 'vertical' as React.CSSProperties['WebkitBoxOrient'],
                    borderLeft: `2px solid ${agent.color}`,
                    paddingLeft: 8,
                  }}
                >
                  {l.response}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {tuneOpen && (
        <TunePanel agentId={agent.id} agentColor={agent.color} onClose={() => setTuneOpen(false)} />
      )}
    </div>
  )
}

function RosterTile({
  agent,
  idx,
  active,
  onClick,
}: {
  agent: AgentCard
  idx: number
  active: boolean
  onClick: () => void
}) {
  const t = useTick(2200 + idx * 350)
  const pulse = 0.3 + Math.abs(Math.sin(t * Math.PI * 2)) * 0.7
  return (
    <button
      onClick={onClick}
      style={{
        position: 'relative',
        background: active ? `${agent.color}10` : surface,
        border: active ? `1.5px solid ${agent.color}` : `1px solid ${line}`,
        borderRadius: 12,
        padding: 12,
        overflow: 'hidden',
        textAlign: 'left',
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        boxShadow: active ? `0 0 0 4px ${agent.color}1c` : 'none',
        transition: 'border-color .15s, box-shadow .15s',
      }}
    >
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: 0,
          height: 2,
          background: agent.color,
          opacity: active ? 1 : 0.6,
        }}
      />
      <div
        style={{
          position: 'absolute',
          right: -8,
          bottom: -16,
          fontFamily: 'var(--font-display)',
          fontSize: 100,
          fontWeight: 800,
          color: agent.color,
          opacity: 0.07,
          lineHeight: 1,
          pointerEvents: 'none',
          userSelect: 'none',
        }}
      >
        {agent.sigil}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, position: 'relative' }}>
        <div style={{ position: 'relative', width: 34, height: 34, flexShrink: 0 }}>
          <div
            style={{
              position: 'absolute',
              inset: 0,
              borderRadius: 8,
              background: `conic-gradient(from 0deg, ${agent.color}, transparent 60%, ${agent.color})`,
              opacity: 0.7 * pulse,
            }}
          />
          <div
            style={{
              position: 'absolute',
              inset: 2,
              borderRadius: 6,
              background: surface,
              border: `1px solid ${agent.color}55`,
              display: 'grid',
              placeItems: 'center',
              fontFamily: 'var(--font-display)',
              fontWeight: 800,
              fontSize: 16,
              color: agent.color,
            }}
          >
            {agent.sigil}
          </div>
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 4,
            }}
          >
            <span
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 13,
                fontWeight: 800,
                letterSpacing: '-.01em',
                color: active ? agent.color : text,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {agent.name}
            </span>
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 9,
                padding: '2px 6px',
                borderRadius: 3,
                background: active ? agent.color : `${agent.color}22`,
                color: active ? '#0b0d12' : agent.color,
                fontWeight: 800,
                flexShrink: 0,
              }}
            >
              LV {agent.level}
            </span>
          </div>
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 9,
              color: active ? text : muted,
              letterSpacing: 1,
              marginTop: 2,
            }}
          >
            {agent.code} · {agent.model}
          </div>
        </div>
      </div>

      <div style={{ height: 4, borderRadius: 2, background: surface2, overflow: 'hidden' }}>
        <div style={{ width: `${agent.xpBar * 100}%`, height: '100%', background: agent.color }} />
      </div>

      <div
        style={{
          padding: '6px 8px',
          borderRadius: 6,
          background: surface2,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
        }}
      >
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: agent.color,
            flexShrink: 0,
          }}
        />
        <span
          style={{
            fontSize: 11,
            color: active ? text : muted,
            fontWeight: active ? 700 : 400,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {agent.role}
        </span>
      </div>
    </button>
  )
}

function AddAgentTile() {
  return (
    <button
      style={{
        background: 'transparent',
        border: `1.5px dashed ${line2}`,
        borderRadius: 12,
        padding: 12,
        color: muted,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        gap: 8,
        minHeight: 140,
      }}
    >
      <div
        style={{
          width: 32,
          height: 32,
          borderRadius: '50%',
          border: `1.5px dashed ${line2}`,
          display: 'grid',
          placeItems: 'center',
        }}
      >
        <svg width="14" height="14" viewBox="0 0 14 14">
          <path
            d="M7 1 V13 M1 7 H13"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        </svg>
      </div>
      <span
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 10,
          letterSpacing: '.14em',
          textTransform: 'uppercase',
        }}
      >
        Recruter agent
      </span>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: muted2 }}>
        +1 slot dispo
      </span>
    </button>
  )
}

function RunsTimeline({ runs }: { runs: AgentRunMetricInput[] }) {
  const rows = AGENTS_DATA.map((agent) => {
    const items = runs
      .filter((run) => run.agent_id === agent.id)
      .sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at))
      .slice(-18)
      .map((run) => ({
        id: run.id ?? `${run.agent_id}-${run.created_at}`,
        w: Math.max(4, Math.min(22, (run.duration_ms ?? 400) / 100)),
        ok: !run.fallback_triggered,
      }))
    return { agent, items }
  })

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
      {rows.slice(0, AGENTS_DATA.length).map((row) => (
        <div
          key={row.agent.id}
          style={{
            display: 'grid',
            gridTemplateColumns: '100px 1fr',
            gap: 10,
            alignItems: 'center',
          }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span
              style={{
                width: 16,
                height: 16,
                borderRadius: 4,
                border: `1px solid ${row.agent.color}`,
                display: 'grid',
                placeItems: 'center',
                flexShrink: 0,
                fontFamily: 'var(--font-display)',
                fontWeight: 800,
                fontSize: 10,
                color: row.agent.color,
                background: `${row.agent.color}10`,
              }}
            >
              {row.agent.sigil}
            </span>
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 10,
                color: row.agent.color,
                letterSpacing: 1,
                fontWeight: 700,
              }}
            >
              {row.agent.code}
            </span>
          </span>
          <div style={{ height: 12, display: 'flex', gap: 3, alignItems: 'stretch' }}>
            {row.items.length === 0 ? (
              <div
                style={{
                  flex: 1,
                  border: `1px dashed ${line}`,
                  borderRadius: 2,
                  opacity: 0.6,
                }}
              />
            ) : (
              row.items.map((it) => (
                <div
                  key={it.id}
                  style={{
                    flex: it.w,
                    background: it.ok ? row.agent.color : rose,
                    opacity: it.ok ? 0.4 + (it.w / 22) * 0.6 : 0.6,
                    borderRadius: 2,
                  }}
                />
              ))
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

export default function AgentsPage() {
  const { user } = useAuth()
  const isMobile = useIsMobile()
  const [selectedId, setSelectedId] = useState('scout')
  const [pipeline, setPipeline] = useState<PipelineRow | null>(null)
  const [agentRuns, setAgentRuns] = useState<AgentRunMetricInput[]>([])
  const [orchestration, setOrchestration] = useState<OrchestrationStatus | null>(null)
  const [autonomyJobs, setAutonomyJobs] = useState<AutonomyJobView[]>([])
  const [autonomyActions, setAutonomyActions] = useState<AutonomyActionView[]>([])
  const [autonomyApprovals, setAutonomyApprovals] = useState<AutonomyApprovalView[]>([])
  const [autonomyLoading, setAutonomyLoading] = useState(false)
  const [resolvingApprovalKey, setResolvingApprovalKey] = useState<string | null>(null)
  const [deletingApprovalKey, setDeletingApprovalKey] = useState<string | null>(null)
  const [operatingJobKey, setOperatingJobKey] = useState<string | null>(null)
  const [validating, setValidating] = useState(false)

  const loadAgentRuns = useCallback(async () => {
    if (!user) return
    const supabase = createSupabaseBrowser()
    const { data, error } = await supabase
      .from('agent_runs')
      .select(
        'id, agent_id, duration_ms, created_at, fallback_triggered, total_tokens, cost_usd, provider, model'
      )
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(500)
    if (error) {
      toast.error(error.message)
      return
    }
    setAgentRuns((data ?? []) as AgentRunMetricInput[])
  }, [user])

  useEffect(() => {
    void loadAgentRuns()
  }, [loadAgentRuns])

  useEffect(() => {
    let cancelled = false
    async function loadPipeline() {
      try {
        const res = await fetch('/api/studio/agents/pipeline')
        if (res.ok) {
          const data = (await res.json()) as { pipeline: PipelineRow | null }
          if (!cancelled) setPipeline(data.pipeline)
        }
      } catch {
        /* silencieux */
      }
    }
    loadPipeline()
    return () => {
      cancelled = true
    }
  }, [])

  const loadOrchestration = useCallback(async () => {
    const res = await fetch('/api/studio/agents/orchestrate', { method: 'POST' })
    if (!res.ok) return
    const data = (await res.json()) as OrchestrationStatus
    setOrchestration(data)
  }, [])

  const loadAutonomyState = useCallback(async () => {
    setAutonomyLoading(true)
    try {
      const res = await fetch('/api/studio/autonomy/jobs')
      const data = (await res.json()) as AutonomyJobsPayload
      if (!res.ok && res.status !== 207) {
        toast.error(data.errors?.[0]?.message || 'Erreur chargement autonomy')
        return
      }
      setAutonomyJobs(data.jobs ?? [])
      setAutonomyActions(data.actions ?? [])
      setAutonomyApprovals(data.approvals ?? [])
    } catch {
      toast.error('Erreur réseau autonomy')
    } finally {
      setAutonomyLoading(false)
    }
  }, [])

  const refreshCommandState = useCallback(
    async (trigger: AgentCommandRefreshTrigger) => {
      const plan = getAgentCommandRefreshPlan(trigger)
      await Promise.all([
        plan.runOrchestration ? loadOrchestration() : Promise.resolve(),
        plan.loadAutonomyState ? loadAutonomyState() : Promise.resolve(),
      ])
    },
    [loadAutonomyState, loadOrchestration]
  )

  useEffect(() => {
    if (!user) return
    const timeout = window.setTimeout(() => {
      void refreshCommandState('initial-load')
    }, 0)
    return () => window.clearTimeout(timeout)
  }, [refreshCommandState, user])

  async function handleApprovalResolution(approvalId: string, decision: 'approved' | 'rejected') {
    const key = `${approvalId}:${decision}`
    setResolvingApprovalKey(key)
    try {
      const res = await fetch('/api/studio/autonomy/jobs', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approvalId, decision }),
      })
      const data = (await res.json().catch(() => ({}))) as {
        error?: string
        result?: { actionType?: string; executed?: boolean }
      }
      if (!res.ok) {
        toast.error(data.error || 'Erreur approval')
        return
      }
      toast.success(
        decision === 'approved'
          ? `Approval validée · ${data.result?.actionType ?? 'action'}`
          : 'Approval rejetée'
      )
      await loadAutonomyState()
    } catch {
      toast.error('Erreur réseau approval')
    } finally {
      setResolvingApprovalKey(null)
    }
  }

  async function handleApprovalDelete(approvalId: string) {
    setDeletingApprovalKey(approvalId)
    try {
      const res = await fetch('/api/studio/autonomy/jobs', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approvalId }),
      })
      const data = (await res.json().catch(() => ({}))) as {
        message?: string
        error?: string
      }
      if (!res.ok) {
        toast.error(data.error || data.message || 'Suppression gate impossible')
        return
      }
      toast.success(data.message || 'Gate supprimé')
      await loadAutonomyState()
    } catch {
      toast.error('Erreur réseau suppression gate')
    } finally {
      setDeletingApprovalKey(null)
    }
  }

  async function handleJobAction(jobId: string, type: 'retry_job' | 'cancel_job') {
    const key = `${jobId}:${type}`
    setOperatingJobKey(key)
    try {
      const res = await fetch('/api/studio/autonomy/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, jobId }),
      })
      const data = (await res.json().catch(() => ({}))) as {
        message?: string
        error?: string
      }
      if (!res.ok) {
        toast.error(data.message || data.error || 'Action job impossible')
        return
      }
      toast.success(data.message || (type === 'retry_job' ? 'Job remis en file' : 'Job annulé'))
      await loadAutonomyState()
    } catch {
      toast.error('Erreur réseau job')
    } finally {
      setOperatingJobKey(null)
    }
  }

  async function handleApprove() {
    if (!pipeline) return
    setValidating(true)
    try {
      const res = await fetch('/api/studio/agents/pipeline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'approve', pipelineId: pipeline.id }),
      })
      const data = (await res.json()) as { ok?: boolean; ventureId?: string; error?: string }
      if (!res.ok) return toast.error(data.error || 'Erreur validation')
      toast.success('Venture créée · les agents sont débloqués')
      setPipeline((p) => (p ? { ...p, status: 'approved' } : p))
    } finally {
      setValidating(false)
    }
  }

  async function handleReject() {
    if (!pipeline) return
    setValidating(true)
    try {
      const res = await fetch('/api/studio/agents/pipeline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reject', pipelineId: pipeline.id }),
      })
      if (res.ok) {
        toast.success('Idée rejetée · relancez Scout pour une nouvelle idée')
        setPipeline(null)
      }
    } finally {
      setValidating(false)
    }
  }

  const selected = AGENTS_DATA.find((a) => a.id === selectedId) ?? AGENTS_DATA[0]
  const { agentLevels } = useGamification()
  const levelMap = useMemo(
    () =>
      new Map(
        agentLevels.map((agentLevel) => [
          agentLevel.id,
          { level: agentLevel.level, xpBar: agentLevel.xpBar },
        ])
      ),
    [agentLevels]
  )
  const agents = useMemo<AgentCard[]>(
    () =>
      AGENTS_DATA.map((agent) => {
        const derived = levelMap.get(agent.id)
        return {
          ...agent,
          level: derived?.level ?? 0,
          xpBar: derived?.xpBar ?? 0,
        }
      }),
    [levelMap]
  )
  const selectedAgent = agents.find((agent) => agent.id === selected.id) ?? agents[0]
  const runMetrics = useMemo(
    () =>
      buildAgentRunMetrics(
        agentRuns,
        agents.map((agent) => agent.id)
      ),
    [agentRuns, agents]
  )
  const selectedRunMetric = runMetrics[selectedAgent.id] ?? {
    agent_id: selectedAgent.id,
    run_count: 0,
    runs_24h: 0,
    last_run_at: null,
    avg_duration_ms: null,
    fallback_count: 0,
    total_tokens: 0,
    cost_usd: 0,
    providers: [],
    last_model: null,
  }
  const activity = useMemo(
    () => buildAgentActivitySeries(agentRuns, selectedId),
    [agentRuns, selectedId]
  )
  const queue = QUEUE[selectedId] ?? []
  const approvalQueue = useMemo(
    () =>
      buildApprovalQueue({
        approvals: autonomyApprovals,
        actions: autonomyActions,
      }),
    [autonomyApprovals, autonomyActions]
  )
  const pendingApprovalCount = approvalQueue.filter((item) => item.isPending).length

  const throughput = agents.map((a) => {
    const metric = runMetrics[a.id]
    return {
      ...a,
      runs: metric?.run_count ?? 0,
      last: metric?.last_run_at ? minutesAgo(metric.last_run_at) : '—',
      avg:
        metric?.avg_duration_ms !== null && metric?.avg_duration_ms !== undefined
          ? `${Math.round((metric.avg_duration_ms ?? 0) / 100) / 10}s`
          : '—',
    }
  })
  const maxRuns = Math.max(1, ...throughput.map((t) => t.runs))

  const headerActions = (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      {[
        { label: `${AGENTS_DATA.length} agents`, color: muted },
        { label: `${AGENTS_DATA.length - 1} live`, color: emerald },
        ...(orchestration
          ? [
              { label: `DUE ${orchestration.due.length}`, color: muted },
              { label: `READY ${orchestration.executable.length}`, color: cyan },
              { label: `GATED ${orchestration.blocked.length}`, color: rose },
            ]
          : []),
        {
          label: `APPROVALS ${pendingApprovalCount}`,
          color: pendingApprovalCount > 0 ? amber : muted,
        },
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
      breadcrumb="Studio / Agents"
      title="Fleet Command"
      subtitle={`${AGENTS_DATA.length} agents · missions autonomes`}
      actions={headerActions}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <PipelineStatusBar pipeline={pipeline} />

        {pipeline?.status === 'pending_validation' && (
          <PipelineValidationCard
            pipeline={pipeline}
            onApprove={handleApprove}
            onReject={handleReject}
            loading={validating}
          />
        )}

        <ApprovalGatesPanel
          queue={approvalQueue}
          loading={autonomyLoading}
          resolvingKey={resolvingApprovalKey}
          deletingKey={deletingApprovalKey}
          onResolve={handleApprovalResolution}
          onDelete={handleApprovalDelete}
          onRefresh={loadAutonomyState}
        />

        <AutonomyObservabilityPanel
          jobs={autonomyJobs}
          actions={autonomyActions}
          approvals={autonomyApprovals}
          approvalQueue={approvalQueue}
          operatingJobKey={operatingJobKey}
          onJobAction={handleJobAction}
        />

        <button
          type="button"
          onClick={() => refreshCommandState('manual-evaluate')}
          style={{
            alignSelf: 'flex-start',
            minHeight: 34,
            padding: '7px 11px',
            borderRadius: 8,
            border: `1px solid ${cyan}45`,
            background: `${cyan}12`,
            color: cyan,
            fontFamily: 'var(--font-mono)',
            fontSize: 9.5,
            letterSpacing: '.12em',
            textTransform: 'uppercase',
            fontWeight: 800,
            cursor: 'pointer',
          }}
        >
          Évaluer schedules
        </button>

        {/* Main 2-col */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: isMobile ? '1fr' : '480px 1fr',
            gap: 14,
            alignItems: 'start',
          }}
        >
          {/* Left: AgentInspector */}
            <AgentInspector
            agent={selectedAgent}
            activity={activity}
            queue={queue}
            pipeline={pipeline}
            setPipeline={setPipeline}
            runMetric={selectedRunMetric}
            onRunComplete={() => {
              void loadAgentRuns()
              void refreshCommandState('manual-evaluate')
            }}
          />

          {/* Right: Roster + Throughput */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* Roster */}
            <div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'baseline',
                  justifyContent: 'space-between',
                  marginBottom: 8,
                }}
              >
                <span
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontSize: 14,
                    fontWeight: 700,
                    letterSpacing: '-.01em',
                    color: text,
                  }}
                >
                  Roster
                </span>
                <span
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 9.5,
                    color: muted2,
                    letterSpacing: '.14em',
                    textTransform: 'uppercase',
                  }}
                >
                  click pour inspecter
                </span>
              </div>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)',
                  gap: 10,
                }}
              >
                {agents.map((a, i) => (
                  <RosterTile
                    key={a.id}
                    agent={a}
                    idx={i}
                    active={a.id === selectedId}
                    onClick={() => setSelectedId(a.id)}
                  />
                ))}
                <AddAgentTile />
              </div>
            </div>

            {/* Throughput chart */}
            <div
              style={{
                background: surface,
                border: `1px solid ${line}`,
                borderRadius: 14,
                padding: 16,
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'baseline',
                  justifyContent: 'space-between',
                  marginBottom: 14,
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
                    Throughput · 24h
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
                    runs réels · dernier run · latence · source agent_runs
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  {['24h', '7j', '30j'].map((label, i) => (
                    <button
                      key={label}
                      style={{
                        padding: '4px 8px',
                        borderRadius: 4,
                        fontFamily: 'var(--font-mono)',
                        fontSize: 9,
                        letterSpacing: '.14em',
                        border: `1px solid ${line}`,
                        background: i === 0 ? accent : surface2,
                        color: i === 0 ? '#0b0d12' : muted,
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {throughput.map((row, i) => (
                  <div
                    key={row.id}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '110px 1fr 60px 60px 50px',
                      gap: 12,
                      alignItems: 'center',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                      <span
                        style={{
                          width: 22,
                          height: 22,
                          borderRadius: 5,
                          border: `1px solid ${row.color}`,
                          display: 'grid',
                          placeItems: 'center',
                          flexShrink: 0,
                          fontFamily: 'var(--font-display)',
                          fontWeight: 800,
                          fontSize: 13,
                          color: row.color,
                          background: `${row.color}10`,
                        }}
                      >
                        {AGENTS_DATA[i].sigil}
                      </span>
                      <span
                        style={{
                          fontSize: 12,
                          fontWeight: 600,
                          color: text,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {row.name}
                      </span>
                    </div>
                    <div
                      style={{
                        height: 12,
                        background: surface2,
                        borderRadius: 3,
                        position: 'relative',
                        overflow: 'hidden',
                        border: `1px solid ${line}`,
                      }}
                    >
                      <div
                        style={{
                          width: `${(row.runs / maxRuns) * 100}%`,
                          height: '100%',
                          background: `linear-gradient(90deg, ${row.color}, ${row.color}aa)`,
                        }}
                      />
                      <div
                        style={{
                          position: 'absolute',
                          inset: 0,
                          backgroundImage:
                            'linear-gradient(90deg, rgba(255,255,255,.08) 1px, transparent 1px)',
                          backgroundSize: '20px 100%',
                        }}
                      />
                    </div>
                    <span
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: 11,
                        color: row.color,
                        fontWeight: 700,
                        textAlign: 'right',
                      }}
                    >
                      {row.runs}
                    </span>
                    <span
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: 11,
                        color: muted,
                        textAlign: 'right',
                      }}
                    >
                      {row.last}
                    </span>
                    <span
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: 11,
                        color: muted,
                        textAlign: 'right',
                      }}
                    >
                      {row.avg}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Bottom: Runs timeline */}
        <div
          style={{
            background: surface,
            border: `1px solid ${line}`,
            borderRadius: 14,
            padding: 14,
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            minHeight: 168,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
            <div
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 13,
                fontWeight: 700,
                letterSpacing: '-.01em',
                color: text,
              }}
            >
              Recent runs · agent timeline
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              {['all', ...AGENTS_DATA.slice(0, 5).map((a) => a.code)].map((label, i) => (
                <span
                  key={label}
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 9,
                    padding: '3px 7px',
                    borderRadius: 4,
                    letterSpacing: '.14em',
                    border: `1px solid ${line}`,
                    background: i === 0 ? surface2 : 'transparent',
                    color: i === 0 ? text : muted,
                  }}
                >
                  {label}
                </span>
              ))}
            </div>
          </div>
          <RunsTimeline runs={agentRuns} />
        </div>
      </div>
    </CkShell>
  )
}
