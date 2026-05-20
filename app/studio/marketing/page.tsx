'use client'
import { useEffect, useMemo, useState, useCallback } from 'react'
import { toast } from 'sonner'
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
  accent,
  emerald,
  amber,
  cyan,
  violet,
  fuchsia,
  rose,
} from '@/lib/ck-vars'
import {
  AGENTS_DATA,
  makeSpark,
  sparkPath,
  areaPath,
  useTick,
  useIsMobile,
} from '@/lib/studio-utils'
import {
  CheckCircle2,
  Clapperboard,
  Link2,
  Play,
  RefreshCw,
  Save,
  Send,
  WalletCards,
  XCircle,
} from 'lucide-react'
import { getStatusColor } from '@/components/studio/StatusBadge'
import { EmptyState } from '@/components/studio/EmptyState'
import { getMissingMarketingDraftsAction } from '@/lib/autonomy/supervised-loop-state'
import {
  adaptDraftToChannel,
  type MarketingChannelId,
} from '@/lib/marketing/channel-adapter'

interface CampaignDraft {
  id: string
  venture_id: string | null
  channel: string
  content: string
  status: 'draft' | 'blocked' | 'approved' | 'published' | 'failed' | 'rejected'
  metadata: Record<string, unknown>
  published_at?: string | null
  provider_run_id?: string | null
  last_error?: string | null
  created_at: string
  updated_at: string
}

interface MarketingVenture {
  id: string
  name: string | null
  nom: string | null
  slug: string | null
  stage: string | null
  statut: string | null
  score: number | null
  lifecycle_status?: string | null
  created_at: string
}

interface PublishApprovalRow {
  approval: { id: string; action_id: string; status: string; created_at: string }
  action: {
    id: string
    venture_id?: string | null
    action_type: string
    status: string
    input: Record<string, unknown> | null
  } | null
  isPending: boolean
}

interface MarketingProviderStatus {
  publisher: {
    mode: 'n8n' | 'mock'
    label: string
    canPublishLive: boolean
    reason: string
    channels: string[]
  }
  video: {
    mode: 'n8n' | 'mock'
    label: string
    canGenerate: boolean
    requiresApproval: boolean
    reason: string
  }
}

// Note: les couleurs des statuts viennent désormais de components/studio/StatusBadge
// (getStatusColor) pour éviter la duplication.

interface Channel {
  id: MarketingChannelId
  label: string
  icon: string
  color: string
  reach: string
  ctr: string
  drafts: number
  status: string
  waveSeed: number
}

const CHANNELS: readonly Channel[] = [
  {
    id: 'linkedin',
    label: 'LinkedIn',
    icon: 'in',
    color: '#22d3ee',
    reach: '—',
    ctr: '—',
    drafts: 0,
    status: 'Inactif',
    waveSeed: 7,
  },
  {
    id: 'tiktok',
    label: 'TikTok',
    icon: '▶',
    color: '#e879f9',
    reach: '—',
    ctr: '—',
    drafts: 0,
    status: 'Inactif',
    waveSeed: 11,
  },
  {
    id: 'instagram',
    label: 'Instagram',
    icon: '◎',
    color: '#fb7185',
    reach: '—',
    ctr: '—',
    drafts: 0,
    status: 'À connecter',
    waveSeed: 13,
  },
  {
    id: 'youtube',
    label: 'YouTube',
    icon: '▶',
    color: '#f87171',
    reach: '—',
    ctr: '—',
    drafts: 0,
    status: 'À connecter',
    waveSeed: 17,
  },
  {
    id: 'reddit',
    label: 'Reddit',
    icon: 'r/',
    color: '#fb923c',
    reach: '—',
    ctr: '—',
    drafts: 0,
    status: 'À connecter',
    waveSeed: 29,
  },
  {
    id: 'seo',
    label: 'SEO',
    icon: 'Σ',
    color: '#34d399',
    reach: '—',
    ctr: '—',
    drafts: 0,
    status: 'Inactif',
    waveSeed: 19,
  },
  {
    id: 'newsletter',
    label: 'Newsletter',
    icon: '✉',
    color: '#fbbf24',
    reach: '—',
    ctr: '—',
    drafts: 0,
    status: 'Inactif',
    waveSeed: 23,
  },
]

const CAL_ITEMS: { day: number; ch: string; title: string; time: string }[] = []

function asText(value: unknown, fallback = '—') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback
}

function ventureName(venture: MarketingVenture | null | undefined) {
  return asText(venture?.name ?? venture?.nom, 'Venture sans nom')
}

function draftTitle(draft: CampaignDraft) {
  return asText(draft.metadata?.title, draft.content.slice(0, 72))
}

function draftFormat(draft: CampaignDraft) {
  return asText(draft.metadata?.format, draft.channel)
}

function draftCta(draft: CampaignDraft) {
  return asText(draft.metadata?.cta, 'CTA à préciser')
}

function isVideoDraft(draft: CampaignDraft) {
  const kind = asText(draft.metadata?.asset_kind, '').toLowerCase()
  const channel = draft.channel.toLowerCase()
  return kind.includes('video') || kind.includes('short') || channel.includes('tiktok')
}

function draftMatchesChannel(draft: CampaignDraft, channelId: string) {
  const channel = draft.channel.toLowerCase()
  if (channelId === 'newsletter')
    return ['news', 'newsletter', 'email'].some((k) => channel.includes(k))
  if (channelId === 'tiktok') {
    return ['tiktok', 'short', 'youtube'].some((k) => channel.includes(k))
  }
  if (channelId === 'instagram') return ['instagram', 'reel'].some((k) => channel.includes(k))
  if (channelId === 'youtube') return ['youtube', 'short'].some((k) => channel.includes(k))
  return channel.includes(channelId)
}

function approvalVentureId(row: PublishApprovalRow) {
  const inputVentureId = row.action?.input?.venture_id
  return row.action?.venture_id ?? (typeof inputVentureId === 'string' ? inputVentureId : null)
}

function MkKpi({
  label,
  value,
  delta,
  color,
}: {
  label: string
  value: string
  delta: string
  color: string
}) {
  const spark = useMemo(() => makeSpark(28, 40, 14, label.length * 7), [label])
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
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
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
      <svg
        viewBox="0 0 100 22"
        preserveAspectRatio="none"
        style={{ width: '100%', height: 20, marginTop: 4, display: 'block' }}
      >
        <path d={sparkPath(spark, 100, 22, 1)} fill="none" stroke={color} strokeWidth="1.4" />
      </svg>
    </div>
  )
}

function ChannelCard({
  channel,
  active,
  onClick,
}: {
  channel: Channel
  active: boolean
  onClick: () => void
}) {
  const wave = useMemo(() => makeSpark(36, 50, 22, channel.waveSeed), [channel.waveSeed])
  return (
    <button
      onClick={onClick}
      style={{
        textAlign: 'left',
        padding: 12,
        borderRadius: 12,
        background: active ? surface2 : bg,
        border: active ? `1.5px solid ${channel.color}` : `1px solid ${line}`,
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        position: 'relative',
        overflow: 'hidden',
        boxShadow: active ? `0 0 0 4px ${channel.color}1c` : 'none',
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
          background: channel.color,
          opacity: active ? 1 : 0.6,
        }}
      />

      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: 8,
            background: `${channel.color}1a`,
            border: `1px solid ${channel.color}55`,
            display: 'grid',
            placeItems: 'center',
            fontFamily: 'var(--font-display)',
            fontWeight: 800,
            fontSize: 14,
            color: channel.color,
          }}
        >
          {channel.icon}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 14,
              fontWeight: 700,
              letterSpacing: '-.01em',
              color: text,
            }}
          >
            {channel.label}
          </div>
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 9,
              color: muted,
              letterSpacing: 1,
              textTransform: 'uppercase',
            }}
          >
            {channel.status} · {channel.drafts} drafts
          </div>
        </div>
        <span
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            fontFamily: 'var(--font-mono)',
            fontSize: 9,
            letterSpacing: 1,
            color: channel.color,
            fontWeight: 700,
            flexShrink: 0,
          }}
        >
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: channel.color }} />
          {channel.status === 'À connecter' ? 'OFF' : 'LIVE'}
        </span>
      </div>

      <svg
        viewBox="0 0 200 40"
        preserveAspectRatio="none"
        style={{ width: '100%', height: 40, display: 'block' }}
      >
        <defs>
          <linearGradient id={`ch-${channel.id}`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={channel.color} stopOpacity=".5" />
            <stop offset="100%" stopColor={channel.color} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={areaPath(wave, 200, 40, 2)} fill={`url(#ch-${channel.id})`} />
        <path
          d={sparkPath(wave, 200, 40, 2)}
          fill="none"
          stroke={channel.color}
          strokeWidth="1.4"
        />
      </svg>

      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <div>
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 9,
              color: muted2,
              letterSpacing: '.14em',
              textTransform: 'uppercase',
            }}
          >
            Reach 7j
          </div>
          <div
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 18,
              fontWeight: 800,
              color: channel.color,
              marginTop: 2,
              letterSpacing: '-.02em',
            }}
          >
            {channel.reach}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 9,
              color: muted2,
              letterSpacing: '.14em',
              textTransform: 'uppercase',
            }}
          >
            CTR
          </div>
          <div
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 18,
              fontWeight: 800,
              color: emerald,
              marginTop: 2,
              letterSpacing: '-.02em',
            }}
          >
            {channel.ctr}
          </div>
        </div>
      </div>
    </button>
  )
}

function MarketingAgentInspector({
  channel,
  venture,
  drafts,
  onRun,
  running,
}: {
  channel: Channel
  venture: MarketingVenture | null
  drafts: CampaignDraft[]
  onRun: () => void
  running: boolean
}) {
  const t = useTick(2500)
  const pulse = 0.3 + Math.abs(Math.sin(t * Math.PI * 2)) * 0.7
  const agent = AGENTS_DATA.find((a) => a.id === 'marketing')!
  const channelDrafts = drafts.filter((draft) => draftMatchesChannel(draft, channel.id)).slice(0, 3)
  return (
    <div
      style={{
        background: surface,
        border: `1px solid ${line}`,
        borderRadius: 14,
        padding: 16,
        borderTop: `3px solid ${agent.color}`,
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
          bottom: -30,
          fontFamily: 'var(--font-display)',
          fontSize: 200,
          fontWeight: 800,
          color: agent.color,
          opacity: 0.06,
          lineHeight: 1,
          pointerEvents: 'none',
          userSelect: 'none',
        }}
      >
        {agent.sigil}
      </div>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, position: 'relative' }}>
        <div style={{ position: 'relative', width: 50, height: 50, flexShrink: 0 }}>
          <div
            style={{
              position: 'absolute',
              inset: 0,
              borderRadius: 10,
              background: `conic-gradient(from 0deg, ${agent.color}, transparent 60%, ${agent.color})`,
              opacity: 0.8 * pulse,
            }}
          />
          <div
            style={{
              position: 'absolute',
              inset: 3,
              borderRadius: 8,
              background: surface2,
              border: `1px solid ${agent.color}55`,
              display: 'grid',
              placeItems: 'center',
              fontFamily: 'var(--font-display)',
              fontWeight: 800,
              fontSize: 24,
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
              fontSize: 9.5,
              color: muted,
              letterSpacing: '.14em',
              textTransform: 'uppercase',
            }}
          >
            MKT · Distribution
          </div>
          <div
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 17,
              fontWeight: 800,
              letterSpacing: '-.02em',
              color: text,
            }}
          >
            {agent.name} Agent
          </div>
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 9,
              color: muted2,
              letterSpacing: '.1em',
              textTransform: 'uppercase',
              marginTop: 2,
            }}
          >
            {ventureName(venture)}
          </div>
        </div>
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
            padding: '3px 7px',
            borderRadius: 4,
            background: `${agent.color}22`,
            color: agent.color,
            fontWeight: 800,
            letterSpacing: 1.5,
            flexShrink: 0,
          }}
        >
          LV {agent.level}
        </span>
      </div>

      {/* Draft queue */}
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
          Drafts en cours · {channel.label}
        </div>
        {channelDrafts.length === 0 ? (
          <div style={{ padding: '16px 10px', textAlign: 'center' }}>
            <p style={{ fontSize: 12, color: muted2 }}>Aucun draft · lancez une campagne</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {channelDrafts.map((draft) => (
              <div
                key={draft.id}
                style={{
                  background: bg,
                  border: `1px solid ${line}`,
                  borderRadius: 8,
                  padding: 9,
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 8,
                  }}
                >
                  <span
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: 8.5,
                      color: channel.color,
                      letterSpacing: '.12em',
                      textTransform: 'uppercase',
                      fontWeight: 800,
                    }}
                  >
                    {draftFormat(draft)}
                  </span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 8.5, color: muted2 }}>
                    {draft.status}
                  </span>
                </div>
                <div style={{ marginTop: 5, fontSize: 12, color: text, lineHeight: 1.35 }}>
                  {draftTitle(draft)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* A/B arena */}
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
          A/B test
        </div>
        <div style={{ padding: '16px 10px', textAlign: 'center' }}>
          <p style={{ fontSize: 12, color: muted2 }}>Aucun test actif</p>
        </div>
      </div>

      <button
        onClick={onRun}
        disabled={running || !venture}
        style={{
          marginTop: 'auto',
          padding: '10px 14px',
          borderRadius: 8,
          background: agent.color,
          color: '#0b0d12',
          border: 'none',
          fontFamily: 'var(--font-display)',
          fontWeight: 800,
          fontSize: 12,
          letterSpacing: '.06em',
          cursor: running || !venture ? 'not-allowed' : 'pointer',
          opacity: running || !venture ? 0.6 : 1,
        }}
      >
        ▶ {running ? 'Génération...' : 'Générer posts + vidéos'}
      </button>
    </div>
  )
}

function Calendar() {
  const today = new Date()
  const todayIdx = today.getDay() === 0 ? 6 : today.getDay() - 1
  const DAYS = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today)
    d.setDate(today.getDate() - todayIdx + i)
    return d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric' }).toUpperCase()
  })
  return (
    <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6 }}>
      {DAYS.map((d, i) => {
        const isToday = i === todayIdx
        return (
          <div key={d} style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <div
              style={{
                padding: '5px 8px',
                borderRadius: 6,
                background: isToday ? accent : surface2,
                color: isToday ? '#0b0d12' : muted,
                fontFamily: 'var(--font-mono)',
                fontSize: 10,
                letterSpacing: '.14em',
                textTransform: 'uppercase',
                fontWeight: 700,
                textAlign: 'center',
                border: `1px solid ${line}`,
              }}
            >
              {d}
              {isToday ? ' · today' : ''}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {CAL_ITEMS.filter((it) => it.day === i).map((it, j) => {
                const ch = CHANNELS.find((c) => c.id === it.ch)!
                return (
                  <div
                    key={j}
                    style={{
                      padding: '5px 8px',
                      borderRadius: 5,
                      background: `${ch.color}10`,
                      border: `1px solid ${ch.color}33`,
                      borderLeft: `2.5px solid ${ch.color}`,
                    }}
                  >
                    <div
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: 8.5,
                        color: ch.color,
                        letterSpacing: '.1em',
                        fontWeight: 700,
                      }}
                    >
                      {it.time} · {ch.label.toUpperCase()}
                    </div>
                    <div style={{ fontSize: 11, color: text, marginTop: 1, lineHeight: 1.25 }}>
                      {it.title}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function LinkedInMock() {
  return (
    <div
      style={{
        width: '100%',
        maxWidth: 260,
        padding: 10,
        borderRadius: 10,
        background: surface2,
        border: `1px solid ${line}`,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div
          style={{
            width: 28,
            height: 28,
            borderRadius: '50%',
            background: 'conic-gradient(from 0deg, #ff6a3d, #ffd166, #34d399, #22d3ee, #ff6a3d)',
            flexShrink: 0,
          }}
        />
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: text }}>Kenomi · 2nd</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8.5, color: muted }}>
            AI Venture Studio · 2h
          </div>
        </div>
      </div>
      <div style={{ fontSize: 11, marginTop: 8, lineHeight: 1.4, color: text }}>
        <b>3 signaux qui disent qu&apos;une niche est prête à payer pour de l&apos;IA.</b>
        <br />
        On a testé 12 ventures. Voici la grille que Validation Agent applique.
      </div>
      <div style={{ display: 'flex', gap: 4, marginTop: 10 }}>
        {(['#22d3ee', '#34d399', '#a78bfa', '#fbbf24'] as const).map((c, i) => (
          <div
            key={i}
            style={{
              flex: 1,
              height: 28,
              borderRadius: 4,
              background: `repeating-linear-gradient(135deg, ${c}40 0 6px, transparent 6px 12px)`,
              border: `1px solid ${line}`,
            }}
          />
        ))}
      </div>
      <div
        style={{
          display: 'flex',
          gap: 12,
          marginTop: 8,
          fontFamily: 'var(--font-mono)',
          fontSize: 9,
          color: muted,
        }}
      >
        <span>♥ 184</span>
        <span>💬 22</span>
        <span>↗ 6</span>
      </div>
    </div>
  )
}

function TikTokMock() {
  return (
    <div
      style={{
        width: 130,
        height: 220,
        borderRadius: 18,
        background: 'linear-gradient(160deg, #1a0b1f, #0b0d12)',
        border: `1px solid ${line}`,
        padding: 10,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
      }}
    >
      <div
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 8,
          color: '#e879f9',
          letterSpacing: '.14em',
        }}
      >
        ● REC · 0:08
      </div>
      <div
        style={{
          background:
            'repeating-linear-gradient(45deg, rgba(232,121,249,.15) 0 8px, transparent 8px 18px)',
          flex: 1,
          marginTop: 6,
          marginBottom: 6,
          borderRadius: 4,
          display: 'grid',
          placeItems: 'center',
          color: '#e879f9',
          fontFamily: 'var(--font-mono)',
          fontSize: 9,
          letterSpacing: 2,
        }}
      >
        HOOK · 0-3s
      </div>
      <div style={{ fontSize: 10, fontWeight: 700, color: '#fff' }}>
        &quot;J&apos;ai posé 1 question à 12 founders&quot;
      </div>
      <div
        style={{
          display: 'flex',
          gap: 8,
          fontFamily: 'var(--font-mono)',
          fontSize: 9,
          color: 'rgba(255,255,255,.8)',
          marginTop: 4,
        }}
      >
        <span>♥ 2.4k</span>
        <span>💬 184</span>
      </div>
    </div>
  )
}

function SeoMock() {
  return (
    <div style={{ width: '100%', maxWidth: 260 }}>
      <div
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 9,
          color: emerald,
          letterSpacing: '.14em',
        }}
      >
        kenomi.studio › alternatives
      </div>
      <div
        style={{ fontSize: 13, fontWeight: 700, color: '#60a5fa', marginTop: 4, lineHeight: 1.3 }}
      >
        10 alternatives à Typeform pour SaaS B2B (2026)
      </div>
      <div style={{ fontSize: 10, color: muted, marginTop: 4, lineHeight: 1.4 }}>
        Comparatif des meilleures alternatives — pricing, intégrations, conditional logic. Mis à
        jour pour les founders et ops.
      </div>
      <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
        {['typeform', 'tally', 'kenomi', 'fillout'].map((k) => (
          <span
            key={k}
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 8.5,
              padding: '2px 6px',
              borderRadius: 3,
              background: surface2,
              color: muted,
              letterSpacing: 1,
            }}
          >
            {k}
          </span>
        ))}
      </div>
      <div style={{ marginTop: 8, display: 'flex', justifyContent: 'space-between' }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: emerald }}>
          DA 42 · 14 backlinks
        </span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: muted2 }}>
          3 200 imp/mo
        </span>
      </div>
    </div>
  )
}

function NewsletterMock() {
  return (
    <div
      style={{
        width: '100%',
        maxWidth: 260,
        padding: 12,
        borderRadius: 8,
        background: 'linear-gradient(180deg, #fbbf2418, transparent)',
        border: '1px solid #fbbf2444',
      }}
    >
      <div
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 9,
          color: amber,
          letterSpacing: '.18em',
        }}
      >
        KENOMI · ISSUE 17
      </div>
      <div
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: 16,
          fontWeight: 800,
          letterSpacing: '-.02em',
          marginTop: 6,
          lineHeight: 1.15,
          color: text,
        }}
      >
        On a pivoté Legal Intake en 23 jours.
      </div>
      <div style={{ fontSize: 10.5, color: muted, marginTop: 6, lineHeight: 1.5 }}>
        Le sequencing du Decision Agent. 3 datapoints qui ont fait la différence. Le nouveau
        positionnement HR Ops.
      </div>
      <button
        style={{
          marginTop: 10,
          width: '100%',
          padding: '7px 10px',
          borderRadius: 4,
          background: amber,
          color: '#0b0d12',
          border: 'none',
          fontFamily: 'var(--font-display)',
          fontWeight: 800,
          fontSize: 10,
          letterSpacing: '.1em',
          cursor: 'pointer',
        }}
      >
        LIRE LE BUILD LOG →
      </button>
    </div>
  )
}

const ASSET_ETA: Record<MarketingChannelId, string> = {
  linkedin: '8 min',
  tiktok: '14 min',
  instagram: '12 min',
  youtube: '18 min',
  reddit: '7 min',
  seo: '22 min',
  newsletter: '9 min',
}

function AssetPreview({
  channel,
  active,
  selectedDraft,
  adaptedDraft,
  connected,
  onClick,
  onConnect,
  onSave,
  saving,
}: {
  channel: Channel
  active: boolean
  selectedDraft: CampaignDraft | null
  adaptedDraft: ReturnType<typeof adaptDraftToChannel> | null
  connected: boolean
  onClick: () => void
  onConnect: () => void
  onSave: () => void
  saving: boolean
}) {
  const displayTitle =
    typeof adaptedDraft?.metadata.title === 'string'
      ? adaptedDraft.metadata.title
      : selectedDraft
        ? draftTitle(selectedDraft)
        : channel.label
  const displayContent =
    adaptedDraft?.content ?? 'Sélectionne un draft, puis choisis ce canal pour générer le bon format.'
  const displayFormat =
    typeof adaptedDraft?.metadata.format === 'string' ? adaptedDraft.metadata.format : 'preview'
  const displayCta = typeof adaptedDraft?.metadata.cta === 'string' ? adaptedDraft.metadata.cta : 'CTA'
  const videoHook =
    typeof adaptedDraft?.metadata.video === 'object' &&
    adaptedDraft.metadata.video !== null &&
    'hook' in adaptedDraft.metadata.video &&
    typeof adaptedDraft.metadata.video.hook === 'string'
      ? adaptedDraft.metadata.video.hook
      : displayTitle

  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        textAlign: 'left',
        background: surface,
        border: active ? `1.5px solid ${channel.color}` : `1px solid ${line}`,
        borderRadius: 14,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        cursor: 'pointer',
        boxShadow: active ? `0 0 0 4px ${channel.color}18` : 'none',
      }}
    >
      <div
        style={{
          padding: '10px 14px',
          borderBottom: `1px solid ${line}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div>
          <div
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 12.5,
              fontWeight: 700,
              letterSpacing: '-.01em',
              color: text,
            }}
          >
            {channel.label} · {displayFormat}
          </div>
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 9,
              color: muted2,
              letterSpacing: '.14em',
              textTransform: 'uppercase',
              marginTop: 2,
            }}
          >
            {connected ? 'Connecté' : 'Canal à connecter'} · est. {ASSET_ETA[channel.id]}
          </div>
        </div>
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 9,
            padding: '3px 6px',
            borderRadius: 3,
            background: active ? `${channel.color}22` : surface2,
            color: active ? channel.color : muted,
            letterSpacing: 1,
          }}
        >
          {active ? 'cible' : connected ? 'live' : 'connect'}
        </span>
      </div>
      <div
        style={{
          flex: 1,
          padding: 14,
          display: 'grid',
          placeItems: 'center',
          background: bg,
          minHeight: 220,
        }}
      >
        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <ChannelPreviewMock
            channelId={channel.id}
            color={channel.color}
            title={displayTitle}
            content={displayContent}
            cta={displayCta}
            videoHook={videoHook}
          />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation()
              onConnect()
            }}
            style={{
              minHeight: 32,
              borderRadius: 7,
              background: connected ? surface2 : `${channel.color}22`,
              color: connected ? muted : channel.color,
              border: `1px solid ${connected ? line2 : `${channel.color}55`}`,
              fontFamily: 'var(--font-display)',
              fontSize: 11,
              fontWeight: 800,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 5,
            }}
          >
            <Link2 size={12} /> {connected ? 'Connecté' : 'Connecter'}
          </button>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation()
              onSave()
            }}
            disabled={!adaptedDraft || saving}
            style={{
              minHeight: 32,
              borderRadius: 7,
              background: channel.color,
              color: '#0b0d12',
              border: 'none',
              fontFamily: 'var(--font-display)',
              fontSize: 11,
              fontWeight: 800,
              cursor: !adaptedDraft || saving ? 'not-allowed' : 'pointer',
              opacity: !adaptedDraft || saving ? 0.55 : 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 5,
            }}
          >
            <Save size={12} /> {saving ? '...' : 'Adapter'}
          </button>
        </div>
        </div>
      </div>
    </button>
  )
}

function ChannelPreviewMock({
  channelId,
  color,
  title,
  content,
  cta,
  videoHook,
}: {
  channelId: MarketingChannelId
  color: string
  title: string
  content: string
  cta: string
  videoHook: string
}) {
  const cleanContent = content.replace(/\s+/g, ' ').slice(0, 170)
  const isVideo = ['tiktok', 'instagram', 'youtube'].includes(channelId)

  if (isVideo) {
    return (
      <div
        style={{
          width: 138,
          height: 224,
          borderRadius: 18,
          background:
            channelId === 'youtube'
              ? 'linear-gradient(160deg, #210b0b, #0b0d12)'
              : 'linear-gradient(160deg, #1a0b1f, #0b0d12)',
          border: `1px solid ${color}55`,
          padding: 10,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          margin: '0 auto',
        }}
      >
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8, color, letterSpacing: '.14em' }}>
          ● {channelId.toUpperCase()} · 0:08
        </div>
        <div
          style={{
            background: `repeating-linear-gradient(45deg, ${color}22 0 8px, transparent 8px 18px)`,
            flex: 1,
            marginTop: 7,
            marginBottom: 7,
            borderRadius: 5,
            display: 'grid',
            placeItems: 'center',
            color,
            fontFamily: 'var(--font-mono)',
            fontSize: 9,
            letterSpacing: 1.5,
            textAlign: 'center',
            padding: 8,
          }}
        >
          HOOK · 0-3s
        </div>
        <div style={{ fontSize: 10, fontWeight: 800, color: '#fff', lineHeight: 1.25 }}>
          “{videoHook.slice(0, 68)}”
        </div>
        <div
          style={{
            display: 'flex',
            gap: 8,
            fontFamily: 'var(--font-mono)',
            fontSize: 9,
            color: 'rgba(255,255,255,.8)',
            marginTop: 5,
          }}
        >
          <span>{channelId === 'youtube' ? '▶' : '♥'} 2.4k</span>
          <span>↗ CTA</span>
        </div>
      </div>
    )
  }

  if (channelId === 'seo') {
    return (
      <div style={{ width: '100%', maxWidth: 260 }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color, letterSpacing: '.14em' }}>
          kenomi.studio › {title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 26)}
        </div>
        <div style={{ fontSize: 13, fontWeight: 800, color: '#60a5fa', marginTop: 4, lineHeight: 1.3 }}>
          {title}
        </div>
        <div style={{ fontSize: 10, color: muted, marginTop: 4, lineHeight: 1.4 }}>{cleanContent}</div>
        <div style={{ marginTop: 8, display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color }}>SEO · intent</span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: muted2 }}>{cta}</span>
        </div>
      </div>
    )
  }

  if (channelId === 'newsletter') {
    return (
      <div
        style={{
          width: '100%',
          maxWidth: 260,
          padding: 12,
          borderRadius: 8,
          background: `linear-gradient(180deg, ${color}18, transparent)`,
          border: `1px solid ${color}44`,
        }}
      >
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color, letterSpacing: '.18em' }}>
          KENOMI · LAUNCH
        </div>
        <div
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 16,
            fontWeight: 800,
            marginTop: 6,
            lineHeight: 1.15,
            color: text,
          }}
        >
          {title}
        </div>
        <div style={{ fontSize: 10.5, color: muted, marginTop: 6, lineHeight: 1.5 }}>{cleanContent}</div>
        <div
          style={{
            marginTop: 10,
            width: '100%',
            padding: '7px 10px',
            borderRadius: 4,
            background: color,
            color: '#0b0d12',
            fontFamily: 'var(--font-display)',
            fontWeight: 800,
            fontSize: 10,
            letterSpacing: '.1em',
            textAlign: 'center',
          }}
        >
          {cta}
        </div>
      </div>
    )
  }

  return (
    <div
      style={{
        width: '100%',
        maxWidth: 260,
        padding: 10,
        borderRadius: 10,
        background: surface2,
        border: `1px solid ${line}`,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div
          style={{
            width: 28,
            height: 28,
            borderRadius: channelId === 'reddit' ? '50%' : 7,
            background: color,
            flexShrink: 0,
          }}
        />
        <div>
          <div style={{ fontSize: 11, fontWeight: 800, color: text }}>
            {channelId === 'reddit' ? 'r/startups' : 'Kenomi · 2nd'}
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8.5, color: muted }}>
            {channelId.toUpperCase()} · now
          </div>
        </div>
      </div>
      <div style={{ fontSize: 11, marginTop: 8, lineHeight: 1.4, color: text }}>
        <b>{title}</b>
        <br />
        {cleanContent}
      </div>
      <div style={{ display: 'flex', gap: 4, marginTop: 10 }}>
        {[color, '#34d399', '#a78bfa', '#fbbf24'].map((c, i) => (
          <div
            key={i}
            style={{
              flex: 1,
              height: 28,
              borderRadius: 4,
              background: `repeating-linear-gradient(135deg, ${c}40 0 6px, transparent 6px 12px)`,
              border: `1px solid ${line}`,
            }}
          />
        ))}
      </div>
      <div style={{ display: 'flex', gap: 12, marginTop: 8, fontFamily: 'var(--font-mono)', fontSize: 9, color: muted }}>
        <span>♥ 184</span>
        <span>💬 22</span>
        <span>↗ {cta.slice(0, 16)}</span>
      </div>
    </div>
  )
}

const KPI_LIST = [
  { label: 'Reach 24h', value: '—', delta: '—', color: cyan },
  { label: 'Avg CTR', value: '—', delta: '—', color: emerald },
  { label: 'Engagement', value: '—', delta: '—', color: violet },
  { label: 'Drafts queue', value: '—', delta: '—', color: amber },
  { label: 'A/B wins', value: '—', delta: '—', color: fuchsia },
]

export default function MarketingPage() {
  const [selChannel, setSelChannel] = useState<(typeof CHANNELS)[number]['id']>('linkedin')
  const isMobile = useIsMobile()
  const agent = AGENTS_DATA.find((a) => a.id === 'marketing')!

  const [drafts, setDrafts] = useState<CampaignDraft[]>([])
  const [ventures, setVentures] = useState<MarketingVenture[]>([])
  const [selectedVentureId, setSelectedVentureId] = useState<string | null>(null)
  const [publishApprovals, setPublishApprovals] = useState<PublishApprovalRow[]>([])
  const [draftsLoading, setDraftsLoading] = useState(true)
  const [resolvingKey, setResolvingKey] = useState<string | null>(null)
  const [repairRunning, setRepairRunning] = useState(false)
  const [selectedDraftId, setSelectedDraftId] = useState<string | null>(null)
  const [targetChannel, setTargetChannel] = useState<MarketingChannelId>('linkedin')
  const [connectedChannelIds, setConnectedChannelIds] = useState<MarketingChannelId[]>([
    'linkedin',
    'tiktok',
    'seo',
    'newsletter',
  ])
  const [savingAdaptation, setSavingAdaptation] = useState(false)
  const [providerStatus, setProviderStatus] = useState<MarketingProviderStatus | null>(null)
  const [budgetAmountEur, setBudgetAmountEur] = useState(25)
  const [budgetReason, setBudgetReason] = useState('Tester acquisition et mesurer ROI attribuable')
  const [budgetSubmitting, setBudgetSubmitting] = useState(false)
  const [videoGeneratingId, setVideoGeneratingId] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setDraftsLoading(true)
    try {
      const [draftsRes, jobsRes, providerRes] = await Promise.all([
        fetch('/api/studio/marketing/drafts'),
        fetch('/api/studio/autonomy/jobs'),
        fetch('/api/studio/marketing/provider-status'),
      ])
      const draftsJson = await draftsRes.json().catch(() => ({}))
      const jobsJson = await jobsRes.json().catch(() => ({}))
      const providerJson = await providerRes.json().catch(() => null)
      if (Array.isArray(draftsJson?.drafts)) setDrafts(draftsJson.drafts as CampaignDraft[])
      if (providerJson?.publisher && providerJson?.video) {
        setProviderStatus(providerJson as MarketingProviderStatus)
      }
      if (Array.isArray(draftsJson?.ventures)) {
        const nextVentures = draftsJson.ventures as MarketingVenture[]
        setVentures(nextVentures)
        setSelectedVentureId((current) => {
          if (current && nextVentures.some((venture) => venture.id === current)) return current
          return nextVentures[0]?.id ?? null
        })
      }
      const approvals = Array.isArray(jobsJson?.approvals) ? jobsJson.approvals : []
      const actions = Array.isArray(jobsJson?.actions) ? jobsJson.actions : []
      const actionsById = new Map(actions.map((a: { id: string }) => [a.id, a]))
      const publishRows: PublishApprovalRow[] = approvals
        .map((a: { id: string; action_id: string; status: string; created_at: string }) => ({
          approval: a,
          action: (actionsById.get(a.action_id) as PublishApprovalRow['action']) ?? null,
          isPending: a.status === 'pending',
        }))
        .filter((row: PublishApprovalRow) => row.action?.action_type === 'publish_campaign')
      setPublishApprovals(publishRows)
    } catch {
      toast.error('Impossible de charger les drafts marketing')
    } finally {
      setDraftsLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  async function resolveApproval(approvalId: string, decision: 'approved' | 'rejected') {
    const key = `${approvalId}:${decision}`
    setResolvingKey(key)
    try {
      const res = await fetch('/api/studio/autonomy/jobs', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approvalId, decision }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'erreur inconnue' }))
        toast.error(err.error ?? 'Échec de la résolution')
        return
      }
      toast.success(decision === 'approved' ? 'Campagne approuvée et publiée' : 'Campagne rejetée')
      await refresh()
    } finally {
      setResolvingKey(null)
    }
  }

  async function runMarketingRepair() {
    if (!missingDraftAction?.agentId || !selectedVenture) return
    setRepairRunning(true)
    try {
      const res = await fetch('/api/studio/agents/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentId: missingDraftAction.agentId,
          ventureId: selectedVenture.id,
          prompt: `Crée les assets marketing revenue-first pour la venture "${ventureName(selectedVenture)}" (${selectedVenture.slug ?? 'sans slug'}). Génère des posts adaptés par canal et au moins une vidéo faceless IA avec hook, voiceover, scènes, captions et CTA vers la landing/checkout. Contexte opérationnel : ${missingDraftAction.detail}`,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(data.error ?? 'Impossible de lancer Marketing')
        return
      }
      toast.success(`Marketing lancé (${data.durationMs ?? 0}ms)`)
      await refresh()
    } finally {
      setRepairRunning(false)
    }
  }

  async function saveDraftAdaptation() {
    if (!selectedDraft || !adaptedDraft) {
      toast.error('Sélectionne un draft à adapter')
      return
    }
    setSavingAdaptation(true)
    try {
      const res = await fetch('/api/studio/marketing/drafts', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          draftId: selectedDraft.id,
          channel: adaptedDraft.channel,
          content: adaptedDraft.content,
          metadata: adaptedDraft.metadata,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(data.error ?? 'Impossible d’adapter le draft')
        return
      }
      toast.success(`Draft adapté pour ${CHANNELS.find((c) => c.id === adaptedDraft.channel)?.label}`)
      await refresh()
    } finally {
      setSavingAdaptation(false)
    }
  }

  async function requestMarketingBudget() {
    if (!selectedVenture) {
      toast.error('Sélectionne une venture')
      return
    }
    setBudgetSubmitting(true)
    try {
      const res = await fetch('/api/studio/marketing/budget', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ventureId: selectedVenture.id,
          amountEur: budgetAmountEur,
          channel: targetChannel,
          reason: budgetReason,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(data.error ?? 'Impossible de demander le budget')
        return
      }
      toast.success('Budget marketing envoyé en approval')
      await refresh()
    } finally {
      setBudgetSubmitting(false)
    }
  }

  async function generateFacelessVideo(draftId: string) {
    setVideoGeneratingId(draftId)
    try {
      const res = await fetch('/api/studio/marketing/video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ draftId }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(data.error ?? 'Provider vidéo indisponible')
        return
      }
      toast.success(`Vidéo ${data.video?.provider ?? 'IA'} ${data.video?.status ?? 'prête'}`)
      await refresh()
    } finally {
      setVideoGeneratingId(null)
    }
  }

  const selectedVenture = ventures.find((venture) => venture.id === selectedVentureId) ?? null
  const selectedDrafts = useMemo(
    () => (selectedVentureId ? drafts.filter((draft) => draft.venture_id === selectedVentureId) : []),
    [drafts, selectedVentureId]
  )
  const selectedDraft = selectedDrafts.find((draft) => draft.id === selectedDraftId) ?? null
  const adaptedDraft = selectedDraft ? adaptDraftToChannel(selectedDraft, targetChannel) : null
  useEffect(() => {
    setSelectedDraftId((current) => {
      if (current && selectedDrafts.some((draft) => draft.id === current)) return current
      return selectedDrafts[0]?.id ?? null
    })
  }, [selectedDrafts])
  const selectedPublishApprovals = useMemo(
    () =>
      selectedVentureId
        ? publishApprovals.filter((row) => approvalVentureId(row) === selectedVentureId)
        : [],
    [publishApprovals, selectedVentureId]
  )
  const pendingPublishCount = selectedPublishApprovals.filter((r) => r.isPending).length
  const missingDraftAction = getMissingMarketingDraftsAction({
    draftCount: selectedDrafts.length,
    pendingApprovalCount: pendingPublishCount,
  })
  const videoDrafts = selectedDrafts.filter(isVideoDraft)
  const publishedDrafts = selectedDrafts.filter((draft) => draft.status === 'published')
  const channelCards = useMemo(
    () =>
      CHANNELS.map((channel) => {
        const channelDrafts = selectedDrafts.filter((draft) => draftMatchesChannel(draft, channel.id))
        const connected = connectedChannelIds.includes(channel.id)
        return {
          ...channel,
          drafts: channelDrafts.length,
          status: !connected
            ? 'À connecter'
            : channelDrafts.some((draft) => draft.status === 'published')
              ? 'Publié'
              : channelDrafts.length > 0
                ? 'Draft'
                : 'Connecté',
        }
      }),
    [connectedChannelIds, selectedDrafts]
  )
  const activeChannel = channelCards.find((c) => c.id === selChannel)!
  const draftsByStatus = useMemo(() => {
    const acc: Record<CampaignDraft['status'], CampaignDraft[]> = {
      draft: [],
      blocked: [],
      approved: [],
      published: [],
      failed: [],
      rejected: [],
    }
    selectedDrafts.forEach((d) => {
      acc[d.status]?.push(d)
    })
    return acc
  }, [selectedDrafts])

  const headerActions = (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      <button
        type="button"
        onClick={runMarketingRepair}
        disabled={repairRunning || !selectedVenture}
        style={{
          padding: '8px 14px',
          borderRadius: 999,
          background: agent.color,
          color: '#0b0d12',
          border: 'none',
          cursor: repairRunning || !selectedVenture ? 'not-allowed' : 'pointer',
          fontFamily: 'var(--font-display)',
          fontWeight: 800,
          fontSize: 12,
          letterSpacing: '.04em',
          opacity: repairRunning || !selectedVenture ? 0.6 : 1,
        }}
      >
        {repairRunning ? 'Génération...' : '+ Posts & vidéos'}
      </button>
      {[{ label: `${ventures.length} ventures`, color: muted }].map(({ label, color }) => (
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
      breadcrumb="Studio / Marketing"
      title="Marketing Lab"
      subtitle="LinkedIn · TikTok · SEO · Newsletter"
      actions={headerActions}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div
          style={{
            background: surface,
            border: `1px solid ${line}`,
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
                  fontWeight: 800,
                  color: text,
                  letterSpacing: '-.01em',
                }}
              >
                Ventures marketing
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
                une landing · un checkout · posts et vidéos faceless par venture
              </div>
            </div>
            {selectedVenture && (
              <span
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 9.5,
                  color: agent.color,
                  letterSpacing: '.12em',
                  textTransform: 'uppercase',
                }}
              >
                sélection · {selectedDrafts.length} drafts · {videoDrafts.length} vidéos
              </span>
            )}
          </div>

          {ventures.length === 0 && !draftsLoading ? (
            <EmptyState>
              <span>Aucune venture disponible. Crée ou valide une venture avant le marketing.</span>
            </EmptyState>
          ) : (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fit, minmax(240px, 1fr))',
                gap: 10,
              }}
            >
              {ventures.map((venture) => {
                const ventureDrafts = drafts.filter((draft) => draft.venture_id === venture.id)
                const venturePublished = ventureDrafts.filter((draft) => draft.status === 'published')
                const ventureVideos = ventureDrafts.filter(isVideoDraft)
                const active = venture.id === selectedVentureId
                return (
                  <button
                    key={venture.id}
                    type="button"
                    onClick={() => setSelectedVentureId(venture.id)}
                    style={{
                      textAlign: 'left',
                      background: active ? surface2 : bg,
                      border: active ? `1.5px solid ${agent.color}` : `1px solid ${line}`,
                      borderRadius: 10,
                      padding: 12,
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 8,
                      boxShadow: active ? `0 0 0 4px ${agent.color}18` : 'none',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 8,
                      }}
                    >
                      <div style={{ minWidth: 0 }}>
                        <div
                          style={{
                            fontFamily: 'var(--font-display)',
                            fontSize: 15,
                            fontWeight: 800,
                            color: text,
                            letterSpacing: '-.01em',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {ventureName(venture)}
                        </div>
                        <div
                          style={{
                            fontFamily: 'var(--font-mono)',
                            fontSize: 9,
                            color: muted2,
                            letterSpacing: '.12em',
                            textTransform: 'uppercase',
                            marginTop: 2,
                          }}
                        >
                          /{venture.slug ?? 'slug-manquant'} · score {venture.score ?? 0}
                        </div>
                      </div>
                      <span
                        style={{
                          fontFamily: 'var(--font-mono)',
                          fontSize: 8.5,
                          padding: '3px 6px',
                          borderRadius: 4,
                          background: active ? `${agent.color}22` : surface2,
                          color: active ? agent.color : muted,
                          border: `1px solid ${active ? `${agent.color}44` : line2}`,
                          letterSpacing: '.12em',
                          textTransform: 'uppercase',
                          fontWeight: 800,
                          flexShrink: 0,
                        }}
                      >
                        {venture.lifecycle_status ?? venture.statut ?? venture.stage ?? 'draft'}
                      </span>
                    </div>
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(3, 1fr)',
                        gap: 6,
                      }}
                    >
                      {[
                        ['drafts', ventureDrafts.length],
                        ['publiés', venturePublished.length],
                        ['vidéos', ventureVideos.length],
                      ].map(([label, value]) => (
                        <div
                          key={label}
                          style={{
                            background: surface,
                            border: `1px solid ${line}`,
                            borderRadius: 7,
                            padding: '7px 8px',
                          }}
                        >
                          <div
                            style={{
                              fontFamily: 'var(--font-display)',
                              fontSize: 16,
                              fontWeight: 800,
                              color: label === 'vidéos' ? fuchsia : text,
                            }}
                          >
                            {value}
                          </div>
                          <div
                            style={{
                              fontFamily: 'var(--font-mono)',
                              fontSize: 8.5,
                              color: muted2,
                              letterSpacing: '.12em',
                              textTransform: 'uppercase',
                            }}
                          >
                            {label}
                          </div>
                        </div>
                      ))}
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr',
            gap: 12,
          }}
        >
          <div
            style={{
              background: surface,
              border: `1px solid ${line}`,
              borderRadius: 14,
              padding: 16,
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
              <div>
                <div
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontSize: 14,
                    color: text,
                    fontWeight: 850,
                  }}
                >
                  Provider publication
                </div>
                <div
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 9.5,
                    color: muted2,
                    letterSpacing: '.12em',
                    textTransform: 'uppercase',
                    marginTop: 3,
                  }}
                >
                  {providerStatus?.publisher.label ?? 'chargement'}
                </div>
              </div>
              <span
                style={{
                  color: providerStatus?.publisher.canPublishLive ? emerald : amber,
                  fontFamily: 'var(--font-mono)',
                  fontSize: 9,
                  letterSpacing: '.12em',
                  textTransform: 'uppercase',
                }}
              >
                {providerStatus?.publisher.canPublishLive ? 'live' : 'mock'}
              </span>
            </div>
            <div style={{ color: muted, fontSize: 12, lineHeight: 1.45 }}>
              {providerStatus?.publisher.reason ??
                'Le Studio affiche clairement si les publications sont réelles via n8n ou simulées.'}
            </div>
            <div
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 9.5,
                color: cyan,
                letterSpacing: '.08em',
                textTransform: 'uppercase',
              }}
            >
              canaux · {providerStatus?.publisher.channels.slice(0, 6).join(' · ') ?? '—'}
            </div>
            <div
              style={{
                borderTop: `1px solid ${line}`,
                paddingTop: 10,
                display: 'flex',
                justifyContent: 'space-between',
                gap: 10,
              }}
            >
              <span style={{ color: muted, fontSize: 12 }}>Provider vidéo faceless</span>
              <span
                style={{
                  color: providerStatus?.video.mode === 'n8n' ? emerald : fuchsia,
                  fontFamily: 'var(--font-mono)',
                  fontSize: 9,
                  letterSpacing: '.12em',
                  textTransform: 'uppercase',
                }}
              >
                {providerStatus?.video.label ?? '—'}
              </span>
            </div>
            <div style={{ color: muted2, fontSize: 11, lineHeight: 1.45 }}>
              {providerStatus?.video.reason ?? 'Provider vidéo en attente de statut.'}
            </div>
          </div>

          <div
            style={{
              background: surface,
              border: `1px solid ${line}`,
              borderRadius: 14,
              padding: 16,
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <WalletCards size={16} color={amber} />
              <div>
                <div
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontSize: 14,
                    color: text,
                    fontWeight: 850,
                  }}
                >
                  Budget marketing
                </div>
                <div
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 9.5,
                    color: muted2,
                    letterSpacing: '.12em',
                    textTransform: 'uppercase',
                    marginTop: 3,
                  }}
                >
                  approval explicite par venture · {ventureName(selectedVenture)}
                </div>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr', gap: 8 }}>
              <input
                type="number"
                min={1}
                max={5000}
                value={budgetAmountEur}
                onChange={(event) => setBudgetAmountEur(Number(event.target.value))}
                className="ck-input"
                style={{ fontFamily: 'var(--font-mono)', fontSize: 13 }}
              />
              <select
                value={targetChannel}
                onChange={(event) => setTargetChannel(event.target.value as MarketingChannelId)}
                className="ck-select"
                style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}
              >
                {CHANNELS.map((channel) => (
                  <option key={channel.id} value={channel.id}>
                    {channel.label}
                  </option>
                ))}
              </select>
            </div>
            <input
              value={budgetReason}
              onChange={(event) => setBudgetReason(event.target.value)}
              className="ck-input"
              style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}
            />
            <button
              type="button"
              onClick={requestMarketingBudget}
              disabled={budgetSubmitting || !selectedVenture}
              style={{
                minHeight: 34,
                borderRadius: 8,
                background: budgetSubmitting || !selectedVenture ? surface2 : `${amber}18`,
                color: budgetSubmitting || !selectedVenture ? muted2 : amber,
                border: `1px solid ${budgetSubmitting || !selectedVenture ? line : `${amber}55`}`,
                fontFamily: 'var(--font-display)',
                fontWeight: 850,
                fontSize: 12,
                cursor: budgetSubmitting || !selectedVenture ? 'not-allowed' : 'pointer',
              }}
            >
              {budgetSubmitting ? 'Envoi...' : `Demander approval ${budgetAmountEur || 0} €`}
            </button>
          </div>
        </div>

        {/* Drafts & Approvals depuis campaign_drafts + human_approvals (sources de vérité) */}
        <div
          style={{
            background: surface,
            border: `1px solid ${pendingPublishCount > 0 ? `${amber}66` : line2}`,
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
              flexWrap: 'wrap',
              gap: 8,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Send size={16} color={agent.color} />
              <span
                style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: 14,
                  fontWeight: 800,
                  color: text,
                  letterSpacing: '-.01em',
                }}
              >
                Campagnes générées
              </span>
              <span
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 9.5,
                  color: muted2,
                  letterSpacing: '.12em',
                  textTransform: 'uppercase',
                }}
              >
                {draftsLoading
                  ? 'chargement…'
                  : `${selectedDrafts.length} drafts · ${publishedDrafts.length} publiés · ${pendingPublishCount} en attente`}
              </span>
            </div>
            <button
              onClick={refresh}
              disabled={draftsLoading}
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                display: 'grid',
                placeItems: 'center',
                background: surface2,
                color: draftsLoading ? muted2 : text,
                border: `1px solid ${line2}`,
                cursor: draftsLoading ? 'not-allowed' : 'pointer',
              }}
            >
              <RefreshCw size={14} />
            </button>
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
            source campaign_drafts · human_approvals · {ventureName(selectedVenture)}
          </div>

          {pendingPublishCount > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 10,
                  color: amber,
                  letterSpacing: '.14em',
                  textTransform: 'uppercase',
                }}
              >
                Approbations à valider
              </div>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fit, minmax(280px, 1fr))',
                  gap: 10,
                }}
              >
                {selectedPublishApprovals
                  .filter((r) => r.isPending)
                  .map((row) => {
                    const channel =
                      typeof row.action?.input?.channel === 'string'
                        ? row.action.input.channel
                        : '—'
                    const draftId =
                      typeof row.action?.input?.draft_id === 'string'
                        ? row.action.input.draft_id
                        : ''
                    const draft = drafts.find((d) => d.id === draftId)
                    const approveKey = `${row.approval.id}:approved`
                    const rejectKey = `${row.approval.id}:rejected`
                    return (
                      <div
                        key={row.approval.id}
                        style={{
                          background: surface2,
                          border: `1px solid ${amber}55`,
                          borderRadius: 10,
                          padding: 12,
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 8,
                        }}
                      >
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                          }}
                        >
                          <span
                            style={{
                              fontFamily: 'var(--font-mono)',
                              fontSize: 9,
                              padding: '3px 7px',
                              borderRadius: 4,
                              background: `${amber}22`,
                              color: amber,
                              border: `1px solid ${amber}40`,
                              letterSpacing: '.14em',
                              textTransform: 'uppercase',
                              fontWeight: 800,
                            }}
                          >
                            {channel}
                          </span>
                          <span
                            style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: muted2 }}
                          >
                            {new Date(row.approval.created_at).toLocaleString('fr-FR', {
                              day: 'numeric',
                              month: 'short',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                        </div>
                        {draft && (
                          <div style={{ fontSize: 12, color: text, lineHeight: 1.45 }}>
                            {draft.content}
                          </div>
                        )}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                          <button
                            onClick={() => resolveApproval(row.approval.id, 'approved')}
                            disabled={resolvingKey !== null}
                            style={{
                              minHeight: 32,
                              borderRadius: 7,
                              background: emerald,
                              color: '#0b0d12',
                              border: `1px solid ${emerald}66`,
                              fontFamily: 'var(--font-display)',
                              fontWeight: 800,
                              fontSize: 11,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: 5,
                              cursor: resolvingKey ? 'not-allowed' : 'pointer',
                              opacity: resolvingKey ? 0.6 : 1,
                            }}
                          >
                            <CheckCircle2 size={12} />{' '}
                            {resolvingKey === approveKey ? '...' : 'Publier'}
                          </button>
                          <button
                            onClick={() => resolveApproval(row.approval.id, 'rejected')}
                            disabled={resolvingKey !== null}
                            style={{
                              minHeight: 32,
                              borderRadius: 7,
                              background: `${rose}18`,
                              color: rose,
                              border: `1px solid ${rose}55`,
                              fontFamily: 'var(--font-display)',
                              fontWeight: 800,
                              fontSize: 11,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: 5,
                              cursor: resolvingKey ? 'not-allowed' : 'pointer',
                              opacity: resolvingKey ? 0.6 : 1,
                            }}
                          >
                            <XCircle size={12} /> {resolvingKey === rejectKey ? '...' : 'Rejeter'}
                          </button>
                        </div>
                      </div>
                    )
                  })}
              </div>
            </div>
          )}

          {selectedDrafts.length === 0 && !draftsLoading ? (
            <EmptyState>
              <span>{missingDraftAction?.detail ?? 'Aucun draft généré pour l’instant.'}</span>{' '}
              {missingDraftAction ? (
                <button
                  type="button"
                  onClick={runMarketingRepair}
                  disabled={repairRunning}
                  style={{
                    appearance: 'none',
                    background: 'transparent',
                    border: 0,
                    padding: 0,
                    color: cyan,
                    fontWeight: 800,
                    borderBottom: `1px solid ${cyan}66`,
                    fontFamily: 'inherit',
                    fontSize: 'inherit',
                    cursor: repairRunning ? 'not-allowed' : 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 5,
                    opacity: repairRunning ? 0.65 : 1,
                  }}
                >
                  <Play size={11} />
                  {repairRunning ? 'Run...' : missingDraftAction.label}
                </button>
              ) : (
                <span style={{ color: cyan }}>Valider les approbations en attente</span>
              )}
            </EmptyState>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                {(['draft', 'blocked', 'approved', 'published', 'failed', 'rejected'] as const).map(
                  (status) => {
                    const items = draftsByStatus[status]
                    if (items.length === 0) return null
                    const c = getStatusColor(status)
                    return (
                      <div
                        key={status}
                        style={{
                          padding: '6px 10px',
                          borderRadius: 7,
                          background: `${c}14`,
                          border: `1px solid ${c}40`,
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                        }}
                      >
                        <span
                          style={{
                            fontFamily: 'var(--font-mono)',
                            fontSize: 9,
                            color: c,
                            letterSpacing: '.14em',
                            textTransform: 'uppercase',
                            fontWeight: 800,
                          }}
                        >
                          {status}
                        </span>
                        <span
                          style={{
                            fontFamily: 'var(--font-display)',
                            fontSize: 13,
                            color: c,
                            fontWeight: 800,
                          }}
                        >
                          {items.length}
                        </span>
                      </div>
                    )
                  }
                )}
              </div>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fit, minmax(260px, 1fr))',
                  gap: 10,
                }}
              >
                {selectedDrafts.slice(0, 8).map((draft) => {
                  const c = isVideoDraft(draft) ? fuchsia : getStatusColor(draft.status)
                  const activeDraft = draft.id === selectedDraftId
                  return (
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedDraftId(draft.id)
                        const matchingChannel = CHANNELS.find((channel) =>
                          draftMatchesChannel(draft, channel.id)
                        )
                        if (matchingChannel) setTargetChannel(matchingChannel.id)
                      }}
                      key={draft.id}
                      style={{
                        textAlign: 'left',
                        background: surface2,
                        border: activeDraft ? `1.5px solid ${c}` : `1px solid ${line}`,
                        borderRadius: 10,
                        padding: 12,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 8,
                        cursor: 'pointer',
                        boxShadow: activeDraft ? `0 0 0 4px ${c}18` : 'none',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: 8,
                        }}
                      >
                        <span
                          style={{
                            fontFamily: 'var(--font-mono)',
                            fontSize: 8.5,
                            color: c,
                            letterSpacing: '.12em',
                            textTransform: 'uppercase',
                            fontWeight: 800,
                          }}
                        >
                          {isVideoDraft(draft) ? 'faceless video' : draft.channel}
                        </span>
                        <span
                          style={{
                            fontFamily: 'var(--font-mono)',
                            fontSize: 8.5,
                            color: muted2,
                            letterSpacing: '.1em',
                            textTransform: 'uppercase',
                          }}
                        >
                          {draft.status}
                        </span>
                      </div>
                      <div
                        style={{
                          fontFamily: 'var(--font-display)',
                          fontSize: 14,
                          fontWeight: 800,
                          color: text,
                          letterSpacing: '-.01em',
                          lineHeight: 1.25,
                        }}
                      >
                        {draftTitle(draft)}
                      </div>
                      <div
                        style={{
                          fontFamily: 'var(--font-mono)',
                          fontSize: 9,
                          color: muted2,
                          letterSpacing: '.08em',
                          textTransform: 'uppercase',
                        }}
                      >
                        {draftFormat(draft)} · CTA {draftCta(draft)}
                      </div>
                      <div style={{ fontSize: 12, color: muted, lineHeight: 1.45 }}>
                        {draft.content}
                      </div>
                      {isVideoDraft(draft) && (
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: 6,
                            color: fuchsia,
                            fontFamily: 'var(--font-mono)',
                            fontSize: 9,
                            letterSpacing: '.12em',
                            textTransform: 'uppercase',
                          }}
                        >
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                            <Clapperboard size={12} />
                            {draft.metadata?.video_id ? 'Vidéo IA générée' : 'Brief vidéo IA prêt'}
                          </span>
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation()
                              generateFacelessVideo(draft.id)
                            }}
                            disabled={videoGeneratingId !== null}
                            style={{
                              border: `1px solid ${fuchsia}55`,
                              background: `${fuchsia}14`,
                              color: fuchsia,
                              borderRadius: 6,
                              minHeight: 24,
                              padding: '3px 7px',
                              fontFamily: 'var(--font-display)',
                              fontSize: 10,
                              fontWeight: 850,
                              cursor: videoGeneratingId ? 'not-allowed' : 'pointer',
                            }}
                          >
                            {videoGeneratingId === draft.id ? '...' : 'Générer'}
                          </button>
                        </div>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        {/* KPI strip */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(5, 1fr)',
            gap: 10,
          }}
        >
          {KPI_LIST.map((k) => (
            <MkKpi key={k.label} {...k} />
          ))}
        </div>

        {/* Row 1: Channels + Agent inspector */}
        <div
          style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 380px', gap: 14 }}
        >
          {/* Channels grid */}
          <div
            style={{
              background: surface,
              border: `1px solid ${line}`,
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
                alignItems: 'baseline',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: 6,
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
                  Broadcast channels
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
                  MKT · 7 jours · reach / CTR
                </div>
              </div>
              <span
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 9.5,
                  color: agent.color,
                  letterSpacing: '.14em',
                }}
              >
                ● transmission active
              </span>
            </div>
            <div
              style={{
                flex: 1,
                display: 'grid',
                gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fit, minmax(180px, 1fr))',
                gap: 10,
              }}
            >
              {channelCards.map((ch) => (
                <ChannelCard
                  key={ch.id}
                  channel={ch}
                  active={selChannel === ch.id}
                  onClick={() => setSelChannel(ch.id)}
                />
              ))}
            </div>
          </div>

          {/* Marketing Agent inspector */}
          <MarketingAgentInspector
            channel={activeChannel}
            venture={selectedVenture}
            drafts={selectedDrafts}
            onRun={runMarketingRepair}
            running={repairRunning}
          />
        </div>

        {/* Row 2: Content calendar */}
        <div
          style={{
            background: surface,
            border: `1px solid ${line}`,
            borderRadius: 14,
            padding: 16,
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
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
                Content calendar · 7 jours
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
                programmé · agent MKT
              </div>
            </div>
            {!isMobile && (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                {CHANNELS.map((c) => (
                  <span key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ width: 8, height: 8, borderRadius: 2, background: c.color }} />
                    <span
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: 9,
                        color: muted,
                        letterSpacing: '.1em',
                      }}
                    >
                      {c.label}
                    </span>
                  </span>
                ))}
              </div>
            )}
          </div>
          <div style={{ overflowX: 'auto' }}>
            <div style={{ minWidth: isMobile ? 560 : 'auto' }}>
              <Calendar />
            </div>
          </div>
        </div>

        {/* Row 3: Asset previews */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fit, minmax(240px, 1fr))',
            gap: 14,
          }}
        >
          {channelCards.map((channel) => {
            const connected = connectedChannelIds.includes(channel.id)
            return (
              <AssetPreview
                key={channel.id}
                channel={channel}
                active={targetChannel === channel.id}
                selectedDraft={selectedDraft}
                adaptedDraft={targetChannel === channel.id ? adaptedDraft : null}
                connected={connected}
                saving={savingAdaptation && targetChannel === channel.id}
                onClick={() => setTargetChannel(channel.id)}
                onConnect={() =>
                  setConnectedChannelIds((current) =>
                    current.includes(channel.id) ? current : [...current, channel.id]
                  )
                }
                onSave={saveDraftAdaptation}
              />
            )
          })}
        </div>
      </div>
    </CkShell>
  )
}
