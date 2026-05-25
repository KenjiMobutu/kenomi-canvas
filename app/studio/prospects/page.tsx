'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Activity, Check, Clock3, Database, Mail, RefreshCw, Send, Target, X } from 'lucide-react'
import { toast } from 'sonner'
import { CkShell } from '@/components/CkShell'
import { useAuth } from '@/lib/auth-context'
import { useIsMobile } from '@/lib/studio-utils'
import { surface, surface2, line, line2, text, muted, muted2, accent, emerald, amber, cyan, rose } from '@/lib/ck-vars'
import type { ProspectApprovalStatus } from '@/lib/prospect/types'

type ProspectRow = {
  id: string
  source: string
  source_url: string | null
  company_name: string
  contact_name: string | null
  contact_email: string | null
  contact_role: string | null
  score: number
  band: 'hot' | 'warm' | 'cold'
  status: string
  summary?: string | null
  pain_points?: string[] | null
  cta?: string | null
  outreach_subject: string
  outreach_body: string
  crm_record_id: string | null
  last_contacted_at: string | null
  next_followup_at: string | null
  metadata: Record<string, unknown> | null
  approval_status: ProspectApprovalStatus
  outreach_action_id: string | null
  outreach_approval_id: string | null
  created_at: string
  updated_at: string
}

type ProspectSettings = {
  prospect_sources?: string[] | null
  prospect_outreach_email?: string | null
  prospect_crm_provider?: string | null
}

type ProspectSummary = {
  total: number
  hot: number
  warm: number
  cold: number
  readyToContact: number
  dueFollowups: number
  awaitingApproval: number
  approvedToSend: number
}

type ProspectApiPayload = {
  ok: boolean
  prospects: ProspectRow[]
  settings: ProspectSettings | null
  summary: ProspectSummary
  errors?: { section: string; message: string }[]
}

type JobsPayload = {
  ok: boolean
  jobs: Array<{
    id: string
    kind: string
    status: string
    attempt_count: number
    next_run_at: string
    locked_at: string | null
    last_error: string | null
    payload: Record<string, unknown>
    created_at: string
    updated_at: string
  }>
}

function Panel({
  title,
  icon,
  action,
  children,
}: {
  title: string
  icon: React.ReactNode
  action?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section
      style={{
        background: surface,
        border: `1px solid ${line}`,
        borderRadius: 12,
        overflow: 'hidden',
      }}
    >
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          padding: '14px 16px',
          background: surface2,
          borderBottom: `1px solid ${line}`,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          <span style={{ color: accent, display: 'flex' }}>{icon}</span>
          <h2
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 14,
              fontWeight: 800,
              color: text,
              letterSpacing: '-.01em',
              margin: 0,
            }}
          >
            {title}
          </h2>
        </div>
        {action}
      </header>
      <div style={{ padding: 16 }}>{children}</div>
    </section>
  )
}

function Chip({ label, tone = 'muted' }: { label: string; tone?: 'muted' | 'hot' | 'warm' | 'cold' }) {
  const color = tone === 'hot' ? rose : tone === 'warm' ? amber : tone === 'cold' ? cyan : muted
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '4px 8px',
        borderRadius: 999,
        border: `1px solid ${color}33`,
        background: `${color}12`,
        color,
        fontFamily: 'var(--font-mono)',
        fontSize: 9.5,
        letterSpacing: '.1em',
        textTransform: 'uppercase',
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </span>
  )
}

function bandTone(band: ProspectRow['band']): 'hot' | 'warm' | 'cold' {
  return band === 'hot' ? 'hot' : band === 'warm' ? 'warm' : 'cold'
}

function fmtDate(value: string | null) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat('fr-FR', {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

export default function ProspectPage() {
  const { user } = useAuth()
  const isMobile = useIsMobile()
  const [payload, setPayload] = useState<ProspectApiPayload | null>(null)
  const [jobsPayload, setJobsPayload] = useState<JobsPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState(false)
  const [approvalPendingKey, setApprovalPendingKey] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [prompt, setPrompt] = useState(
    'Trouve un prospect qualifié sur les sources configurées et rédige un message de prospection prêt à envoyer.'
  )

  const load = useCallback(async () => {
    setLoading(true)
    let nextError: string | null = null
    try {
      const [prospectsRes, jobsRes] = await Promise.all([
        fetch('/api/studio/prospects', { cache: 'no-store' }),
        fetch('/api/studio/autonomy/jobs?agent_id=prospect', { cache: 'no-store' }),
      ])

      const prospectsJson = (await prospectsRes.json()) as ProspectApiPayload
      const jobsJson = (await jobsRes.json()) as JobsPayload

      setPayload(prospectsJson)
      setJobsPayload(jobsJson)

      if (!prospectsRes.ok) {
        nextError =
          prospectsJson.errors?.map((item) => `${item.section}: ${item.message}`).join(' · ') ??
            'Impossible de charger les prospects'
      }
      if (!jobsRes.ok && !nextError) {
        nextError = 'Impossible de charger les jobs Prospect'
      }
    } catch (loadError) {
      nextError = loadError instanceof Error ? loadError.message : String(loadError)
    } finally {
      setError(nextError)
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!user) return
    void load()
  }, [load, user])

  const prospects = payload?.prospects ?? []
  const jobs = jobsPayload?.jobs ?? []
  const settings = payload?.settings ?? null
  const summary = payload?.summary ?? {
    total: 0,
    hot: 0,
    warm: 0,
    cold: 0,
    readyToContact: 0,
    dueFollowups: 0,
    awaitingApproval: 0,
    approvedToSend: 0,
  }

  const topProspects = useMemo(() => prospects.slice(0, 8), [prospects])
  const recentJobs = useMemo(() => jobs.slice(0, 6), [jobs])
  const sources = settings?.prospect_sources?.length ? settings.prospect_sources : ['linkedin', 'malt', 'upwork']

  async function runProspect() {
    setRunning(true)
    setError(null)
    try {
      const res = await fetch('/api/studio/prospects/run', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ prompt }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Prospect run failed')
      toast.success('Prospect mis en file')
      await load()
    } catch (runError) {
      const message = runError instanceof Error ? runError.message : String(runError)
      setError(message)
      toast.error(message)
    } finally {
      setRunning(false)
    }
  }

  async function resolveApproval(approvalId: string, decision: 'approved' | 'rejected') {
    const key = `${approvalId}:${decision}`
    setApprovalPendingKey(key)
    setError(null)
    try {
      const res = await fetch('/api/studio/autonomy/jobs', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ approvalId, decision }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Approval resolution failed')
      toast.success(decision === 'approved' ? 'Draft approved' : 'Draft rejected')
      await load()
    } catch (resolveError) {
      const message = resolveError instanceof Error ? resolveError.message : String(resolveError)
      setError(message)
      toast.error(message)
    } finally {
      setApprovalPendingKey(null)
    }
  }

  function approvalTone(status: ProspectApprovalStatus): 'muted' | 'hot' | 'warm' | 'cold' {
    if (status === 'awaiting_approval') return 'warm'
    if (status === 'approved_to_send') return 'hot'
    if (status === 'rejected') return 'hot'
    return 'cold'
  }

  function approvalLabel(status: ProspectApprovalStatus): string {
    if (status === 'awaiting_approval') return 'awaiting approval'
    if (status === 'approved_to_send') return 'approved to send'
    if (status === 'rejected') return 'rejected'
    return 'no approval'
  }

  const headerActions = (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      <Chip label={`${summary.total} leads`} tone="cold" />
      <Chip label={`${summary.hot} hot`} tone="hot" />
      <Chip label={`${summary.awaitingApproval} awaiting`} tone="warm" />
      <Chip label={`${summary.approvedToSend} approved`} tone="hot" />
      <button
        type="button"
        onClick={() => void load()}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          minHeight: 34,
          padding: '7px 12px',
          borderRadius: 8,
          border: `1px solid ${line2}`,
          background: surface2,
          color: text,
          fontFamily: 'var(--font-mono)',
          fontSize: 10,
          letterSpacing: '.12em',
          textTransform: 'uppercase',
          cursor: 'pointer',
        }}
      >
        <RefreshCw size={13} />
        Refresh
      </button>
      <button
        type="button"
        onClick={() => void runProspect()}
        disabled={running}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          minHeight: 34,
          padding: '7px 12px',
          borderRadius: 8,
          border: `1px solid ${emerald}35`,
          background: running ? surface2 : `${emerald}14`,
          color: running ? muted2 : emerald,
          fontFamily: 'var(--font-mono)',
          fontSize: 10,
          letterSpacing: '.12em',
          textTransform: 'uppercase',
          cursor: running ? 'wait' : 'pointer',
        }}
      >
        <Send size={13} />
        {running ? 'Running...' : 'Run prospect'}
      </button>
    </div>
  )

  return (
    <CkShell
      breadcrumb="Studio / Prospects"
      title="Prospect Command"
      subtitle="Acquisition loop, scoring, outreach drafts, and CRM state"
      actions={headerActions}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {error && (
          <div
            style={{
              padding: '10px 12px',
              borderRadius: 8,
              background: `${rose}12`,
              border: `1px solid ${rose}30`,
              color: rose,
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
            }}
          >
            {error}
          </div>
        )}

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: isMobile ? '1fr' : '1.35fr .95fr',
            gap: 14,
            alignItems: 'start',
          }}
        >
          <Panel
            title="Queue"
            icon={<Target size={16} />}
            action={<Chip label={loading ? 'syncing' : 'live'} tone="cold" />}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: isMobile ? '1fr' : 'repeat(4, 1fr)',
                  gap: 10,
                }}
              >
                {[
                  { label: 'Total', value: summary.total, color: text },
                  { label: 'Hot', value: summary.hot, color: rose },
                  { label: 'Due', value: summary.dueFollowups, color: amber },
                  { label: 'Ready', value: summary.readyToContact, color: emerald },
                  { label: 'Awaiting', value: summary.awaitingApproval, color: amber },
                ].map((card) => (
                  <div
                    key={card.label}
                    style={{
                      padding: 12,
                      borderRadius: 10,
                      border: `1px solid ${line}`,
                      background: surface2,
                      minWidth: 0,
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
                      {card.label}
                    </div>
                    <div
                      style={{
                        marginTop: 6,
                        color: card.color,
                        fontFamily: 'var(--font-display)',
                        fontSize: 24,
                        lineHeight: 1,
                        fontWeight: 800,
                      }}
                    >
                      {card.value}
                    </div>
                  </div>
                ))}
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: isMobile ? '1fr' : '1.2fr .8fr',
                  gap: 10,
                }}
              >
                <label
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 6,
                    fontFamily: 'var(--font-mono)',
                    fontSize: 10,
                    color: muted,
                    letterSpacing: '.12em',
                    textTransform: 'uppercase',
                  }}
                >
                  Prompt
                  <textarea
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    rows={4}
                    className="ck-input"
                    style={{
                      resize: 'vertical',
                      fontFamily: 'var(--font-mono)',
                      fontSize: 11,
                    }}
                  />
                </label>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div
                    style={{
                      padding: 12,
                      borderRadius: 10,
                      border: `1px solid ${line}`,
                      background: surface2,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 8,
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
                      Sources
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {sources.map((source) => (
                        <Chip key={source} label={source} tone="cold" />
                      ))}
                    </div>
                  </div>

                  <div
                    style={{
                      padding: 12,
                      borderRadius: 10,
                      border: `1px solid ${line}`,
                      background: surface2,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 10,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Mail size={14} color={cyan} />
                      <div
                        style={{
                          fontFamily: 'var(--font-mono)',
                          fontSize: 9,
                          color: muted2,
                          letterSpacing: '.14em',
                          textTransform: 'uppercase',
                        }}
                      >
                        CRM
                      </div>
                    </div>
                    <div style={{ fontSize: 12, color: text }}>
                      {settings?.prospect_crm_provider ?? 'supabase'}
                    </div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: muted }}>
                      {settings?.prospect_outreach_email || 'No outreach email configured'}
                    </div>
                    <div
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: 9.5,
                        color: muted2,
                        letterSpacing: '.08em',
                        lineHeight: 1.4,
                      }}
                    >
                      {settings?.prospect_sources?.length
                        ? 'Configured sources only.'
                        : 'Defaulting to public acquisition sources.'}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </Panel>

          <Panel title="Runtime" icon={<Activity size={16} />} action={<Chip label={`${jobs.length} jobs`} tone="cold" />}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {recentJobs.length === 0 ? (
                <div
                  style={{
                    padding: 12,
                    borderRadius: 10,
                    border: `1px dashed ${line2}`,
                    color: muted2,
                    fontFamily: 'var(--font-mono)',
                    fontSize: 11,
                  }}
                >
                  Aucun job Prospect encore lancé.
                </div>
              ) : (
                recentJobs.map((job) => {
                  const statusColor =
                    job.status === 'completed'
                      ? emerald
                      : job.status === 'running'
                        ? amber
                        : job.status === 'failed'
                          ? rose
                          : muted

                  return (
                    <div
                      key={job.id}
                      style={{
                        padding: 12,
                        borderRadius: 10,
                        border: `1px solid ${line}`,
                        background: surface2,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 6,
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                        <strong style={{ fontSize: 12, color: text }}>job {job.id}</strong>
                        <span
                          style={{
                            fontFamily: 'var(--font-mono)',
                            fontSize: 9.5,
                            letterSpacing: '.12em',
                            textTransform: 'uppercase',
                            color: statusColor,
                          }}
                        >
                          {job.status}
                        </span>
                      </div>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: muted }}>
                        Attempt {job.attempt_count} · next {fmtDate(job.next_run_at)}
                      </div>
                      {job.last_error && (
                        <div
                          style={{
                            fontFamily: 'var(--font-mono)',
                            fontSize: 10.5,
                            color: rose,
                            lineHeight: 1.45,
                          }}
                        >
                          {job.last_error}
                        </div>
                      )}
                    </div>
                  )
                })
              )}
            </div>
          </Panel>
        </div>

        <Panel
          title="Prospects"
          icon={<Database size={16} />}
          action={<Chip label={loading ? 'loading' : `${topProspects.length} shown`} tone="cold" />}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {topProspects.length === 0 ? (
              <div
                style={{
                  padding: 14,
                  borderRadius: 10,
                  border: `1px dashed ${line2}`,
                  color: muted2,
                  fontFamily: 'var(--font-mono)',
                  fontSize: 11,
                }}
              >
                Aucun prospect enregistré pour le moment.
              </div>
            ) : (
              topProspects.map((prospect) => (
                <article
                  key={prospect.id}
                  style={{
                    padding: 14,
                    borderRadius: 10,
                    border: `1px solid ${line}`,
                    background: surface2,
                    display: 'grid',
                    gridTemplateColumns: isMobile ? '1fr' : '1.3fr .9fr',
                    gap: 12,
                  }}
                >
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <h3
                        style={{
                          margin: 0,
                          fontFamily: 'var(--font-display)',
                          fontSize: 16,
                          fontWeight: 800,
                          color: text,
                          letterSpacing: '-.01em',
                        }}
                      >
                        {prospect.company_name}
                      </h3>
                      <Chip label={prospect.source} tone={bandTone(prospect.band)} />
                      <Chip label={`${prospect.score}/100`} tone={bandTone(prospect.band)} />
                    </div>
                    <div style={{ color: muted, fontSize: 12, lineHeight: 1.5 }}>
                      {prospect.summary ?? prospect.outreach_body}
                    </div>
                    <div
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: 11,
                        color: muted2,
                        lineHeight: 1.5,
                      }}
                    >
                      {prospect.contact_name ? `${prospect.contact_name} · ` : ''}
                      {prospect.contact_role ? `${prospect.contact_role} · ` : ''}
                      {prospect.contact_email ?? 'no contact email'}
                    </div>
                  </div>

                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 8,
                      minWidth: 0,
                    }}
                  >
                    <div
                      style={{
                        padding: 10,
                        borderRadius: 8,
                        border: `1px solid ${line}`,
                        background: surface,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 6,
                      }}
                    >
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: muted2, letterSpacing: '.14em', textTransform: 'uppercase' }}>
                        Outreach
                      </div>
                      <div style={{ fontSize: 12, color: text, fontWeight: 700 }}>
                        {prospect.outreach_subject}
                      </div>
                      <div style={{ fontSize: 11, color: muted, lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>
                        {prospect.outreach_body}
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <Chip label={`status ${prospect.status}`} tone={bandTone(prospect.band)} />
                      <Chip label={approvalLabel(prospect.approval_status)} tone={approvalTone(prospect.approval_status)} />
                      <Chip label={`next ${fmtDate(prospect.next_followup_at)}`} tone="cold" />
                      <Chip label={prospect.crm_record_id ? 'synced' : 'local'} tone="cold" />
                    </div>

                    {prospect.outreach_approval_id && prospect.approval_status === 'awaiting_approval' ? (
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <button
                          type="button"
                          onClick={() => void resolveApproval(prospect.outreach_approval_id!, 'approved')}
                          disabled={approvalPendingKey !== null}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 8,
                            minHeight: 32,
                            padding: '6px 11px',
                            borderRadius: 8,
                            border: `1px solid ${emerald}35`,
                            background: `${emerald}14`,
                            color: emerald,
                            fontFamily: 'var(--font-mono)',
                            fontSize: 10,
                            letterSpacing: '.12em',
                            textTransform: 'uppercase',
                            cursor: approvalPendingKey ? 'wait' : 'pointer',
                          }}
                        >
                          <Check size={13} />
                          {approvalPendingKey === `${prospect.outreach_approval_id}:approved` ? '...' : 'Approve'}
                        </button>
                        <button
                          type="button"
                          onClick={() => void resolveApproval(prospect.outreach_approval_id!, 'rejected')}
                          disabled={approvalPendingKey !== null}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 8,
                            minHeight: 32,
                            padding: '6px 11px',
                            borderRadius: 8,
                            border: `1px solid ${rose}35`,
                            background: `${rose}14`,
                            color: rose,
                            fontFamily: 'var(--font-mono)',
                            fontSize: 10,
                            letterSpacing: '.12em',
                            textTransform: 'uppercase',
                            cursor: approvalPendingKey ? 'wait' : 'pointer',
                          }}
                        >
                          <X size={13} />
                          {approvalPendingKey === `${prospect.outreach_approval_id}:rejected` ? '...' : 'Reject'}
                        </button>
                      </div>
                    ) : null}
                  </div>
                </article>
              ))
            )}
          </div>
        </Panel>
      </div>
    </CkShell>
  )
}
