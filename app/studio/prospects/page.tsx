'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Activity, Check, Clock3, Database, Mail, RefreshCw, Send, Target, X } from 'lucide-react'
import { toast } from 'sonner'
import { CkShell } from '@/components/CkShell'
import { useAuth } from '@/lib/auth-context'
import { useIsMobile } from '@/lib/studio-utils'
import { readProspectFiltersFromSearch } from '@/lib/studio/prospect-filters'
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
  cyan,
  rose,
} from '@/lib/ck-vars'
import type { ProspectApprovalStatus, ProspectOutreachKind } from '@/lib/prospect/types'
import { conversationEventTypes } from '@/lib/revenue/objections'

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
  offer_id?: string | null
  offer_variant?: string | null
  outreach_angle?: string | null
  message_family?: string
  message_key?: string
  last_contacted_at: string | null
  next_followup_at: string | null
  metadata: Record<string, unknown> | null
  approval_status: ProspectApprovalStatus
  pipeline_status: string
  outreach_action_id: string | null
  outreach_approval_id: string | null
  draft_provider: string | null
  draft_external_id: string | null
  latest_conversation_event_type?: string | null
  latest_conversation_event_value?: string | null
  latest_conversation_notes?: string | null
  latest_conversation_at?: string | null
  follow_up_count: number
  last_outreach_kind: ProspectOutreachKind
  last_follow_up_generated_at: string | null
  follow_up_version: number
  operator_notes?: string | null
  next_action?: string | null
  last_activity_at?: string | null
  tags?: string[] | null
  activity?: Array<{
    type: string
    actor?: string
    at?: string
    created_at?: string
    detail: string
  }>
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
  draftCreated: number
  sent: number
  replied: number
  won: number
  lost: number
  followUpDue: number
}

type ProspectApiPayload = {
  ok: boolean
  prospects: ProspectRow[]
  settings: ProspectSettings | null
  summary: ProspectSummary
  conversation?: {
    totalEvents: number
    blockers: Array<{ type: string; label: string; count: number }>
  }
  errors?: { section: string; message: string }[]
}

type OfferSnapshot = {
  id: string
  name: string
  category: string | null
  targetIcp: string | null
  totalProspects: number
  repliedProspects: number
  wonProspects: number
}

type OffersApiPayload = {
  ok: boolean
  offers: OfferSnapshot[]
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

function Chip({
  label,
  tone = 'muted',
}: {
  label: string
  tone?: 'muted' | 'hot' | 'warm' | 'cold'
}) {
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

function followUpLabel(kind: ProspectOutreachKind) {
  return kind === 'follow_up_1'
    ? 'F/U 1'
    : kind === 'follow_up_2'
      ? 'F/U 2'
      : kind === 'follow_up_3'
        ? 'F/U 3'
        : 'Initial'
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

function conversationLabel(value: string | null | undefined) {
  return value ? value.replaceAll('_', ' ') : 'no truth'
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
  const [statusFilter, setStatusFilter] = useState('all')
  const [bandFilter, setBandFilter] = useState('all')
  const [sourceFilter, setSourceFilter] = useState('all')
  const [tagFilter, setTagFilter] = useState('')
  const [searchFilter, setSearchFilter] = useState('')
  const [crmDrafts, setCrmDrafts] = useState<
    Record<
      string,
      {
        notes: string
        nextAction: string
        tags: string
        offerId: string
        offerVariant: string
        outreachAngle: string
      }
    >
  >({})
  const [conversationDrafts, setConversationDrafts] = useState<
    Record<
      string,
      {
        eventType: string
        eventValue: string
        notes: string
      }
    >
  >({})
  const [offers, setOffers] = useState<OfferSnapshot[]>([])
  const [prompt, setPrompt] = useState(
    'Trouve un prospect qualifié sur les sources configurées et rédige un message de prospection prêt à envoyer.'
  )

  useEffect(() => {
    if (typeof window === 'undefined') return
    const next = readProspectFiltersFromSearch(window.location.search)
    setStatusFilter(next.statusFilter)
    setSourceFilter(next.sourceFilter)
    setBandFilter(next.bandFilter)
    setTagFilter(next.tagFilter)
    setSearchFilter(next.searchFilter)
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    let nextError: string | null = null
    try {
      const prospectsUrl = new URL('/api/studio/prospects', window.location.origin)
      if (statusFilter !== 'all') prospectsUrl.searchParams.set('status', statusFilter)
      if (bandFilter !== 'all') prospectsUrl.searchParams.set('band', bandFilter)
      if (sourceFilter !== 'all') prospectsUrl.searchParams.set('source', sourceFilter)
      if (tagFilter.trim()) prospectsUrl.searchParams.set('tag', tagFilter.trim().toLowerCase())
      if (searchFilter.trim()) prospectsUrl.searchParams.set('q', searchFilter.trim())

      const [refreshRes, prospectsRes, jobsRes, offersRes] = await Promise.all([
        fetch('/api/studio/prospects/refresh', {
          method: 'POST',
          cache: 'no-store',
        }),
        fetch(prospectsUrl.toString(), { cache: 'no-store' }),
        fetch('/api/studio/autonomy/jobs?agent_id=prospect', { cache: 'no-store' }),
        fetch('/api/studio/revenue/offers', { cache: 'no-store' }),
      ])

      const prospectsJson = (await prospectsRes.json()) as ProspectApiPayload
      const jobsJson = (await jobsRes.json()) as JobsPayload
      const offersJson = (await offersRes.json()) as OffersApiPayload

      setPayload(prospectsJson)
      setJobsPayload(jobsJson)
      setOffers(Array.isArray(offersJson.offers) ? offersJson.offers : [])
      setCrmDrafts(
        Object.fromEntries(
          (prospectsJson.prospects ?? []).map((prospect) => [
            prospect.id,
            {
              notes: typeof prospect.operator_notes === 'string' ? prospect.operator_notes : '',
              nextAction: typeof prospect.next_action === 'string' ? prospect.next_action : '',
              tags: Array.isArray(prospect.tags) ? prospect.tags.join(', ') : '',
              offerId: typeof prospect.offer_id === 'string' ? prospect.offer_id : '',
              offerVariant: typeof prospect.offer_variant === 'string' ? prospect.offer_variant : '',
              outreachAngle: typeof prospect.outreach_angle === 'string' ? prospect.outreach_angle : '',
            },
          ])
        )
      )
      setConversationDrafts(
        Object.fromEntries(
          (prospectsJson.prospects ?? []).map((prospect) => [
            prospect.id,
            {
              eventType:
                typeof prospect.latest_conversation_event_type === 'string'
                  ? prospect.latest_conversation_event_type
                  : '',
              eventValue:
                typeof prospect.latest_conversation_event_value === 'string'
                  ? prospect.latest_conversation_event_value
                  : '',
              notes:
                typeof prospect.latest_conversation_notes === 'string'
                  ? prospect.latest_conversation_notes
                  : '',
            },
          ])
        )
      )

      if (!prospectsRes.ok) {
        nextError =
          prospectsJson.errors?.map((item) => `${item.section}: ${item.message}`).join(' · ') ??
          'Impossible de charger les prospects'
      }
      if (!refreshRes.ok && !nextError) {
        nextError = 'Impossible de rafraîchir les relances Prospect'
      }
      if (!jobsRes.ok && !nextError) {
        nextError = 'Impossible de charger les jobs Prospect'
      }
      if (!offersRes.ok && !nextError) {
        nextError = 'Impossible de charger les offers revenue'
      }
    } catch (loadError) {
      nextError = loadError instanceof Error ? loadError.message : String(loadError)
    } finally {
      setError(nextError)
      setLoading(false)
    }
  }, [bandFilter, searchFilter, sourceFilter, statusFilter, tagFilter])

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
    draftCreated: 0,
    sent: 0,
    replied: 0,
    won: 0,
    lost: 0,
    followUpDue: 0,
  }
  const conversation = payload?.conversation ?? {
    totalEvents: 0,
    blockers: [] as Array<{ type: string; label: string; count: number }>,
  }

  const topProspects = useMemo(() => prospects.slice(0, 8), [prospects])
  const recentJobs = useMemo(() => jobs.slice(0, 6), [jobs])
  const sources = settings?.prospect_sources?.length
    ? settings.prospect_sources
    : ['linkedin', 'malt', 'upwork']

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

  async function updateProspectStage(
    prospectId: string,
    status: 'sent' | 'replied' | 'won' | 'lost'
  ) {
    const key = `${prospectId}:${status}`
    setApprovalPendingKey(key)
    setError(null)
    try {
      const conversationDraft = conversationDrafts[prospectId]
      const res = await fetch('/api/studio/prospects', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          id: prospectId,
          status,
          conversation_event_type: conversationDraft?.eventType || undefined,
          conversation_event_value: conversationDraft?.eventValue || null,
          conversation_notes: conversationDraft?.notes || null,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Prospect transition failed')
      toast.success(`Prospect marked ${status}`)
      await load()
    } catch (updateError) {
      const message = updateError instanceof Error ? updateError.message : String(updateError)
      setError(message)
      toast.error(message)
    } finally {
      setApprovalPendingKey(null)
    }
  }

  async function saveConversationTruth(prospectId: string) {
    const draft = conversationDrafts[prospectId]
    if (!draft?.eventType) {
      toast.error('Select a conversation truth first')
      return
    }

    const key = `${prospectId}:conversation`
    setApprovalPendingKey(key)
    setError(null)
    try {
      const res = await fetch('/api/studio/prospects/objections', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          prospect_id: prospectId,
          event_type: draft.eventType,
          event_value: draft.eventValue || null,
          notes: draft.notes || null,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Conversation truth update failed')
      toast.success('Conversation truth saved')
      await load()
    } catch (saveError) {
      const message = saveError instanceof Error ? saveError.message : String(saveError)
      setError(message)
      toast.error(message)
    } finally {
      setApprovalPendingKey(null)
    }
  }

  async function runProspectAction(
    prospectId: string,
    action: 'mark_follow_up_sent' | 'skip_follow_up' | 'regenerate_follow_up'
  ) {
    const key = `${prospectId}:${action}`
    setApprovalPendingKey(key)
    setError(null)
    try {
      const res = await fetch('/api/studio/prospects', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: prospectId, action }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Prospect follow-up action failed')
      toast.success(
        action === 'mark_follow_up_sent'
          ? 'Follow-up marked sent'
          : action === 'skip_follow_up'
            ? 'Follow-up skipped'
            : 'Follow-up regenerated'
      )
      await load()
    } catch (actionError) {
      const message = actionError instanceof Error ? actionError.message : String(actionError)
      setError(message)
      toast.error(message)
    } finally {
      setApprovalPendingKey(null)
    }
  }

  async function saveProspectCrm(prospectId: string) {
    const draft = crmDrafts[prospectId]
    if (!draft) return

    const key = `${prospectId}:crm`
    setApprovalPendingKey(key)
    setError(null)
    try {
      const res = await fetch('/api/studio/prospects', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          id: prospectId,
          operator_notes: draft.notes,
          next_action: draft.nextAction,
          tags: draft.tags
            .split(',')
            .map((tag) => tag.trim())
            .filter(Boolean),
          offer_id: draft.offerId || null,
          offer_variant: draft.offerVariant || null,
          outreach_angle: draft.outreachAngle || null,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'CRM update failed')
      toast.success('CRM updated')
      await load()
    } catch (updateError) {
      const message = updateError instanceof Error ? updateError.message : String(updateError)
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
      <Chip label={`${summary.draftCreated} drafted`} tone="cold" />
      <Chip label={`${summary.followUpDue} due`} tone="warm" />
      <Chip label={`${summary.won} won`} tone="hot" />
      <Chip label={`${offers.length} offers`} tone="cold" />
      <Chip label={`${conversation.totalEvents} truths`} tone="cold" />
      {conversation.blockers.slice(0, 2).map((blocker) => (
        <Chip key={blocker.type} label={`${blocker.label} ${blocker.count}`} tone="warm" />
      ))}
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
                  { label: 'Drafted', value: summary.draftCreated, color: cyan },
                  { label: 'Won', value: summary.won, color: emerald },
                  { label: 'Lost', value: summary.lost, color: rose },
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

          <Panel
            title="Runtime"
            icon={<Activity size={16} />}
            action={<Chip label={`${jobs.length} jobs`} tone="cold" />}
          >
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
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: 10,
                        }}
                      >
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
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: isMobile ? '1fr' : 'repeat(5, minmax(0, 1fr))',
                gap: 10,
              }}
            >
              <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 9,
                    color: muted2,
                    letterSpacing: '.14em',
                    textTransform: 'uppercase',
                  }}
                >
                  Status
                </span>
                <select
                  className="ck-input"
                  value={statusFilter}
                  onChange={(event) => setStatusFilter(event.target.value)}
                >
                  {[
                    'all',
                    'awaiting_approval',
                    'approved_to_send',
                    'draft_created',
                    'sent',
                    'replied',
                    'won',
                    'lost',
                    'follow_up_due',
                  ].map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 9,
                    color: muted2,
                    letterSpacing: '.14em',
                    textTransform: 'uppercase',
                  }}
                >
                  Band
                </span>
                <select
                  className="ck-input"
                  value={bandFilter}
                  onChange={(event) => setBandFilter(event.target.value)}
                >
                  {['all', 'hot', 'warm', 'cold'].map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 9,
                    color: muted2,
                    letterSpacing: '.14em',
                    textTransform: 'uppercase',
                  }}
                >
                  Source
                </span>
                <select
                  className="ck-input"
                  value={sourceFilter}
                  onChange={(event) => setSourceFilter(event.target.value)}
                >
                  {['all', ...sources].map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 9,
                    color: muted2,
                    letterSpacing: '.14em',
                    textTransform: 'uppercase',
                  }}
                >
                  Tag
                </span>
                <input
                  className="ck-input"
                  value={tagFilter}
                  onChange={(event) => setTagFilter(event.target.value)}
                  placeholder="saas"
                />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 9,
                    color: muted2,
                    letterSpacing: '.14em',
                    textTransform: 'uppercase',
                  }}
                >
                  Search
                </span>
                <input
                  className="ck-input"
                  value={searchFilter}
                  onChange={(event) => setSearchFilter(event.target.value)}
                  placeholder="company or note"
                />
              </label>
            </div>

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
                    <div
                      style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}
                    >
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
                      <div
                        style={{
                          fontFamily: 'var(--font-mono)',
                          fontSize: 9,
                          color: muted2,
                          letterSpacing: '.14em',
                          textTransform: 'uppercase',
                        }}
                      >
                        Outreach
                      </div>
                      <div style={{ fontSize: 12, color: text, fontWeight: 700 }}>
                        {prospect.outreach_subject}
                      </div>
                      <div
                        style={{
                          fontSize: 11,
                          color: muted,
                          lineHeight: 1.55,
                          whiteSpace: 'pre-wrap',
                        }}
                      >
                        {prospect.outreach_body}
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <Chip label={`status ${prospect.status}`} tone={bandTone(prospect.band)} />
                      <Chip label={`pipeline ${prospect.pipeline_status}`} tone="cold" />
                      <Chip
                        label={approvalLabel(prospect.approval_status)}
                        tone={approvalTone(prospect.approval_status)}
                      />
                      <Chip label={followUpLabel(prospect.last_outreach_kind)} tone="cold" />
                      <Chip label={`next ${fmtDate(prospect.next_followup_at)}`} tone="cold" />
                      <Chip label={prospect.crm_record_id ? 'synced' : 'local'} tone="cold" />
                      {prospect.offer_id ? (
                        <Chip
                          label={`offer ${offers.find((offer) => offer.id === prospect.offer_id)?.name ?? 'assigned'}`}
                          tone="cold"
                        />
                      ) : null}
                      {prospect.message_family ? (
                        <Chip label={`message ${prospect.message_family}`} tone="cold" />
                      ) : null}
                      {prospect.latest_conversation_event_type ? (
                        <Chip
                          label={`truth ${conversationLabel(prospect.latest_conversation_event_type)}`}
                          tone="warm"
                        />
                      ) : null}
                      {prospect.tags?.map((tag) => (
                        <Chip key={`${prospect.id}:${tag}`} label={`tag ${tag}`} tone="cold" />
                      ))}
                      <Chip
                        label={
                          prospect.draft_provider && prospect.draft_external_id
                            ? `draft ${prospect.draft_provider}`
                            : 'no draft'
                        }
                        tone="cold"
                      />
                    </div>

                    <div
                      style={{
                        padding: 10,
                        borderRadius: 8,
                        border: `1px solid ${line}`,
                        background: surface,
                        display: 'grid',
                        gridTemplateColumns: '1fr',
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
                        CRM
                      </div>
                      <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <span style={{ fontSize: 11, color: muted }}>Notes</span>
                        <textarea
                          rows={3}
                          className="ck-input"
                          value={crmDrafts[prospect.id]?.notes ?? ''}
                          onChange={(event) =>
                            setCrmDrafts((current) => ({
                              ...current,
                              [prospect.id]: {
                                notes: event.target.value,
                                nextAction:
                                  current[prospect.id]?.nextAction ?? prospect.next_action ?? '',
                                tags:
                                  current[prospect.id]?.tags ??
                                  (Array.isArray(prospect.tags) ? prospect.tags.join(', ') : ''),
                                offerId:
                                  current[prospect.id]?.offerId ??
                                  (typeof prospect.offer_id === 'string' ? prospect.offer_id : ''),
                                offerVariant:
                                  current[prospect.id]?.offerVariant ??
                                  (typeof prospect.offer_variant === 'string' ? prospect.offer_variant : ''),
                                outreachAngle:
                                  current[prospect.id]?.outreachAngle ??
                                  (typeof prospect.outreach_angle === 'string' ? prospect.outreach_angle : ''),
                              },
                            }))
                          }
                        />
                      </label>
                      <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <span style={{ fontSize: 11, color: muted }}>Next action</span>
                        <input
                          className="ck-input"
                          value={crmDrafts[prospect.id]?.nextAction ?? ''}
                          onChange={(event) =>
                            setCrmDrafts((current) => ({
                              ...current,
                              [prospect.id]: {
                                notes: current[prospect.id]?.notes ?? prospect.operator_notes ?? '',
                                nextAction: event.target.value,
                                tags:
                                  current[prospect.id]?.tags ??
                                  (Array.isArray(prospect.tags) ? prospect.tags.join(', ') : ''),
                                offerId:
                                  current[prospect.id]?.offerId ??
                                  (typeof prospect.offer_id === 'string' ? prospect.offer_id : ''),
                                offerVariant:
                                  current[prospect.id]?.offerVariant ??
                                  (typeof prospect.offer_variant === 'string' ? prospect.offer_variant : ''),
                                outreachAngle:
                                  current[prospect.id]?.outreachAngle ??
                                  (typeof prospect.outreach_angle === 'string' ? prospect.outreach_angle : ''),
                              },
                            }))
                          }
                        />
                      </label>
                      <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <span style={{ fontSize: 11, color: muted }}>Tags</span>
                        <input
                          className="ck-input"
                          value={crmDrafts[prospect.id]?.tags ?? ''}
                          onChange={(event) =>
                            setCrmDrafts((current) => ({
                              ...current,
                              [prospect.id]: {
                                notes: current[prospect.id]?.notes ?? prospect.operator_notes ?? '',
                                nextAction:
                                  current[prospect.id]?.nextAction ?? prospect.next_action ?? '',
                                tags: event.target.value,
                                offerId:
                                  current[prospect.id]?.offerId ??
                                  (typeof prospect.offer_id === 'string' ? prospect.offer_id : ''),
                                offerVariant:
                                  current[prospect.id]?.offerVariant ??
                                  (typeof prospect.offer_variant === 'string' ? prospect.offer_variant : ''),
                                outreachAngle:
                                  current[prospect.id]?.outreachAngle ??
                                  (typeof prospect.outreach_angle === 'string' ? prospect.outreach_angle : ''),
                              },
                            }))
                          }
                        />
                      </label>
                      <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <span style={{ fontSize: 11, color: muted }}>Offer</span>
                        <select
                          className="ck-input"
                          value={crmDrafts[prospect.id]?.offerId ?? ''}
                          onChange={(event) =>
                            setCrmDrafts((current) => ({
                              ...current,
                              [prospect.id]: {
                                notes: current[prospect.id]?.notes ?? prospect.operator_notes ?? '',
                                nextAction:
                                  current[prospect.id]?.nextAction ?? prospect.next_action ?? '',
                                tags:
                                  current[prospect.id]?.tags ??
                                  (Array.isArray(prospect.tags) ? prospect.tags.join(', ') : ''),
                                offerId: event.target.value,
                                offerVariant:
                                  current[prospect.id]?.offerVariant ??
                                  (typeof prospect.offer_variant === 'string' ? prospect.offer_variant : ''),
                                outreachAngle:
                                  current[prospect.id]?.outreachAngle ??
                                  (typeof prospect.outreach_angle === 'string' ? prospect.outreach_angle : ''),
                              },
                            }))
                          }
                        >
                          <option value="">No offer</option>
                          {offers.map((offer) => (
                            <option key={offer.id} value={offer.id}>
                              {offer.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <span style={{ fontSize: 11, color: muted }}>Offer variant</span>
                        <input
                          className="ck-input"
                          value={crmDrafts[prospect.id]?.offerVariant ?? ''}
                          onChange={(event) =>
                            setCrmDrafts((current) => ({
                              ...current,
                              [prospect.id]: {
                                notes: current[prospect.id]?.notes ?? prospect.operator_notes ?? '',
                                nextAction:
                                  current[prospect.id]?.nextAction ?? prospect.next_action ?? '',
                                tags:
                                  current[prospect.id]?.tags ??
                                  (Array.isArray(prospect.tags) ? prospect.tags.join(', ') : ''),
                                offerId:
                                  current[prospect.id]?.offerId ??
                                  (typeof prospect.offer_id === 'string' ? prospect.offer_id : ''),
                                offerVariant: event.target.value,
                                outreachAngle:
                                  current[prospect.id]?.outreachAngle ??
                                  (typeof prospect.outreach_angle === 'string' ? prospect.outreach_angle : ''),
                              },
                            }))
                          }
                        />
                      </label>
                      <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <span style={{ fontSize: 11, color: muted }}>Outreach angle</span>
                        <input
                          className="ck-input"
                          value={crmDrafts[prospect.id]?.outreachAngle ?? ''}
                          onChange={(event) =>
                            setCrmDrafts((current) => ({
                              ...current,
                              [prospect.id]: {
                                notes: current[prospect.id]?.notes ?? prospect.operator_notes ?? '',
                                nextAction:
                                  current[prospect.id]?.nextAction ?? prospect.next_action ?? '',
                                tags:
                                  current[prospect.id]?.tags ??
                                  (Array.isArray(prospect.tags) ? prospect.tags.join(', ') : ''),
                                offerId:
                                  current[prospect.id]?.offerId ??
                                  (typeof prospect.offer_id === 'string' ? prospect.offer_id : ''),
                                offerVariant:
                                  current[prospect.id]?.offerVariant ??
                                  (typeof prospect.offer_variant === 'string' ? prospect.offer_variant : ''),
                                outreachAngle: event.target.value,
                              },
                            }))
                          }
                        />
                      </label>
                      <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <span style={{ fontSize: 11, color: muted }}>Conversation truth</span>
                        <select
                          className="ck-input"
                          value={conversationDrafts[prospect.id]?.eventType ?? ''}
                          onChange={(event) =>
                            setConversationDrafts((current) => ({
                              ...current,
                              [prospect.id]: {
                                eventType: event.target.value,
                                eventValue:
                                  current[prospect.id]?.eventValue ??
                                  (typeof prospect.latest_conversation_event_value === 'string'
                                    ? prospect.latest_conversation_event_value
                                    : ''),
                                notes:
                                  current[prospect.id]?.notes ??
                                  (typeof prospect.latest_conversation_notes === 'string'
                                    ? prospect.latest_conversation_notes
                                    : ''),
                              },
                            }))
                          }
                        >
                          <option value="">No truth yet</option>
                          {conversationEventTypes.map((type) => (
                            <option key={type} value={type}>
                              {conversationLabel(type)}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <span style={{ fontSize: 11, color: muted }}>Signal / reason</span>
                        <input
                          className="ck-input"
                          value={conversationDrafts[prospect.id]?.eventValue ?? ''}
                          onChange={(event) =>
                            setConversationDrafts((current) => ({
                              ...current,
                              [prospect.id]: {
                                eventType:
                                  current[prospect.id]?.eventType ??
                                  (typeof prospect.latest_conversation_event_type === 'string'
                                    ? prospect.latest_conversation_event_type
                                    : ''),
                                eventValue: event.target.value,
                                notes:
                                  current[prospect.id]?.notes ??
                                  (typeof prospect.latest_conversation_notes === 'string'
                                    ? prospect.latest_conversation_notes
                                    : ''),
                              },
                            }))
                          }
                        />
                      </label>
                      <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <span style={{ fontSize: 11, color: muted }}>Conversation notes</span>
                        <textarea
                          rows={2}
                          className="ck-input"
                          value={conversationDrafts[prospect.id]?.notes ?? ''}
                          onChange={(event) =>
                            setConversationDrafts((current) => ({
                              ...current,
                              [prospect.id]: {
                                eventType:
                                  current[prospect.id]?.eventType ??
                                  (typeof prospect.latest_conversation_event_type === 'string'
                                    ? prospect.latest_conversation_event_type
                                    : ''),
                                eventValue:
                                  current[prospect.id]?.eventValue ??
                                  (typeof prospect.latest_conversation_event_value === 'string'
                                    ? prospect.latest_conversation_event_value
                                    : ''),
                                notes: event.target.value,
                              },
                            }))
                          }
                        />
                      </label>
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          gap: 8,
                          flexWrap: 'wrap',
                        }}
                      >
                        <div
                          style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: muted2 }}
                        >
                          Last activity {fmtDate(prospect.last_activity_at ?? null)}
                        </div>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          <button
                            type="button"
                            onClick={() => void saveConversationTruth(prospect.id)}
                            disabled={approvalPendingKey !== null}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 8,
                              minHeight: 32,
                              padding: '6px 11px',
                              borderRadius: 8,
                              border: `1px solid ${amber}35`,
                              background: `${amber}14`,
                              color: amber,
                              fontFamily: 'var(--font-mono)',
                              fontSize: 10,
                              letterSpacing: '.12em',
                              textTransform: 'uppercase',
                              cursor: approvalPendingKey ? 'wait' : 'pointer',
                            }}
                          >
                            <Mail size={13} />
                            {approvalPendingKey === `${prospect.id}:conversation`
                              ? 'Saving...'
                              : 'Save truth'}
                          </button>
                          <button
                            type="button"
                            onClick={() => void saveProspectCrm(prospect.id)}
                            disabled={approvalPendingKey !== null}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 8,
                              minHeight: 32,
                              padding: '6px 11px',
                              borderRadius: 8,
                              border: `1px solid ${cyan}35`,
                              background: `${cyan}14`,
                              color: cyan,
                              fontFamily: 'var(--font-mono)',
                              fontSize: 10,
                              letterSpacing: '.12em',
                              textTransform: 'uppercase',
                              cursor: approvalPendingKey ? 'wait' : 'pointer',
                            }}
                          >
                            <Clock3 size={13} />
                            {approvalPendingKey === `${prospect.id}:crm` ? 'Saving...' : 'Save CRM'}
                          </button>
                        </div>
                      </div>
                    </div>

                    {prospect.outreach_approval_id &&
                    prospect.approval_status === 'awaiting_approval' ? (
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <button
                          type="button"
                          onClick={() =>
                            void resolveApproval(prospect.outreach_approval_id!, 'approved')
                          }
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
                          {approvalPendingKey === `${prospect.outreach_approval_id}:approved`
                            ? '...'
                            : 'Approve'}
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            void resolveApproval(prospect.outreach_approval_id!, 'rejected')
                          }
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
                          {approvalPendingKey === `${prospect.outreach_approval_id}:rejected`
                            ? '...'
                            : 'Reject'}
                        </button>
                      </div>
                    ) : null}

                    {prospect.pipeline_status === 'draft_created' ? (
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <button
                          type="button"
                          onClick={() => void updateProspectStage(prospect.id, 'sent')}
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
                          <Send size={13} />
                          {approvalPendingKey === `${prospect.id}:sent` ? '...' : 'Mark sent'}
                        </button>
                      </div>
                    ) : null}

                    {prospect.pipeline_status === 'sent' ? (
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <button
                          type="button"
                          onClick={() => void updateProspectStage(prospect.id, 'replied')}
                          disabled={approvalPendingKey !== null}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 8,
                            minHeight: 32,
                            padding: '6px 11px',
                            borderRadius: 8,
                            border: `1px solid ${accent}35`,
                            background: `${accent}14`,
                            color: accent,
                            fontFamily: 'var(--font-mono)',
                            fontSize: 10,
                            letterSpacing: '.12em',
                            textTransform: 'uppercase',
                            cursor: approvalPendingKey ? 'wait' : 'pointer',
                          }}
                        >
                          <Mail size={13} />
                          {approvalPendingKey === `${prospect.id}:replied` ? '...' : 'Mark replied'}
                        </button>
                        <button
                          type="button"
                          onClick={() => void updateProspectStage(prospect.id, 'lost')}
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
                          {approvalPendingKey === `${prospect.id}:lost` ? '...' : 'Mark lost'}
                        </button>
                      </div>
                    ) : null}

                    {prospect.pipeline_status === 'follow_up_due' ? (
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <button
                          type="button"
                          onClick={() => void runProspectAction(prospect.id, 'mark_follow_up_sent')}
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
                          <Send size={13} />
                          {approvalPendingKey === `${prospect.id}:mark_follow_up_sent`
                            ? '...'
                            : 'Mark follow-up sent'}
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            void runProspectAction(prospect.id, 'regenerate_follow_up')
                          }
                          disabled={approvalPendingKey !== null}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 8,
                            minHeight: 32,
                            padding: '6px 11px',
                            borderRadius: 8,
                            border: `1px solid ${cyan}35`,
                            background: `${cyan}14`,
                            color: cyan,
                            fontFamily: 'var(--font-mono)',
                            fontSize: 10,
                            letterSpacing: '.12em',
                            textTransform: 'uppercase',
                            cursor: approvalPendingKey ? 'wait' : 'pointer',
                          }}
                        >
                          <RefreshCw size={13} />
                          {approvalPendingKey === `${prospect.id}:regenerate_follow_up`
                            ? '...'
                            : 'Regenerate'}
                        </button>
                        <button
                          type="button"
                          onClick={() => void runProspectAction(prospect.id, 'skip_follow_up')}
                          disabled={approvalPendingKey !== null}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 8,
                            minHeight: 32,
                            padding: '6px 11px',
                            borderRadius: 8,
                            border: `1px solid ${amber}35`,
                            background: `${amber}14`,
                            color: amber,
                            fontFamily: 'var(--font-mono)',
                            fontSize: 10,
                            letterSpacing: '.12em',
                            textTransform: 'uppercase',
                            cursor: approvalPendingKey ? 'wait' : 'pointer',
                          }}
                        >
                          <Clock3 size={13} />
                          {approvalPendingKey === `${prospect.id}:skip_follow_up` ? '...' : 'Skip'}
                        </button>
                      </div>
                    ) : null}

                    {prospect.pipeline_status === 'replied' ? (
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <button
                          type="button"
                          onClick={() => void updateProspectStage(prospect.id, 'won')}
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
                          {approvalPendingKey === `${prospect.id}:won` ? '...' : 'Mark won'}
                        </button>
                      </div>
                    ) : null}

                    {Array.isArray(prospect.activity) && prospect.activity.length > 0 ? (
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
                        <div
                          style={{
                            fontFamily: 'var(--font-mono)',
                            fontSize: 9,
                            color: muted2,
                            letterSpacing: '.14em',
                            textTransform: 'uppercase',
                          }}
                        >
                          Activity
                        </div>
                        {prospect.activity.slice(-4).map((event) => (
                          <div
                            key={`${event.type}:${event.at ?? event.created_at ?? 'unknown'}`}
                            style={{
                              fontFamily: 'var(--font-mono)',
                              fontSize: 10.5,
                              color: muted,
                              lineHeight: 1.45,
                            }}
                          >
                            {fmtDate(event.at ?? event.created_at ?? null)} · {event.detail}
                          </div>
                        ))}
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
