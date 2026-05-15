'use client'
import { useMemo, useState } from 'react'
import { CkShell } from '@/components/CkShell'
import {
  bg, surface, surface2, line, text, muted, muted2,
  accent, emerald, amber, cyan, violet, fuchsia,
} from '@/lib/ck-vars'
import { AGENTS_DATA, makeSpark, sparkPath, areaPath, useTick, useIsMobile } from '@/lib/studio-utils'

const CHANNELS = [
  { id: 'linkedin', label: 'LinkedIn',   icon: 'in', color: '#22d3ee', reach: '—', ctr: '—', drafts: 0, status: 'Inactif', waveSeed: 7  },
  { id: 'tiktok',   label: 'TikTok',     icon: '▶',  color: '#e879f9', reach: '—', ctr: '—', drafts: 0, status: 'Inactif', waveSeed: 11 },
  { id: 'seo',      label: 'SEO',        icon: 'Σ',  color: '#34d399', reach: '—', ctr: '—', drafts: 0, status: 'Inactif', waveSeed: 19 },
  { id: 'news',     label: 'Newsletter', icon: '✉',  color: '#fbbf24', reach: '—', ctr: '—', drafts: 0, status: 'Inactif', waveSeed: 23 },
] as const

type Channel = typeof CHANNELS[number]

const CAL_ITEMS: { day: number; ch: string; title: string; time: string }[] = []

function MkKpi({ label, value, delta, color }: { label: string; value: string; delta: string; color: string }) {
  const spark = useMemo(() => makeSpark(28, 40, 14, label.length * 7), [label])
  return (
    <div style={{
      background: surface, border: `1px solid ${line}`, borderRadius: 12, padding: 12,
      position: 'relative', overflow: 'hidden',
    }}>
      <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, background: color, opacity: .7 }} />
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
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

function ChannelCard({ channel, active, onClick }: { channel: Channel; active: boolean; onClick: () => void }) {
  const wave = useMemo(() => makeSpark(36, 50, 22, channel.waveSeed), [channel.waveSeed])
  return (
    <button onClick={onClick} style={{
      textAlign: 'left', padding: 12, borderRadius: 12,
      background: active ? surface2 : bg,
      border: active ? `1.5px solid ${channel.color}` : `1px solid ${line}`,
      cursor: 'pointer',
      display: 'flex', flexDirection: 'column', gap: 8,
      position: 'relative', overflow: 'hidden',
      boxShadow: active ? `0 0 0 4px ${channel.color}1c` : 'none',
      transition: 'border-color .15s, box-shadow .15s',
    }}>
      <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 2, background: channel.color, opacity: active ? 1 : .6 }} />

      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{
          width: 32, height: 32, borderRadius: 8,
          background: `${channel.color}1a`, border: `1px solid ${channel.color}55`,
          display: 'grid', placeItems: 'center',
          fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 14, color: channel.color,
        }}>{channel.icon}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 700, letterSpacing: '-.01em', color: text }}>{channel.label}</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: muted, letterSpacing: 1, textTransform: 'uppercase' }}>
            {channel.status} · {channel.drafts} drafts
          </div>
        </div>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: 1, color: channel.color, fontWeight: 700, flexShrink: 0 }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: channel.color }} />
          LIVE
        </span>
      </div>

      <svg viewBox="0 0 200 40" preserveAspectRatio="none" style={{ width: '100%', height: 40, display: 'block' }}>
        <defs>
          <linearGradient id={`ch-${channel.id}`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={channel.color} stopOpacity=".5" />
            <stop offset="100%" stopColor={channel.color} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={areaPath(wave, 200, 40, 2)} fill={`url(#ch-${channel.id})`} />
        <path d={sparkPath(wave, 200, 40, 2)} fill="none" stroke={channel.color} strokeWidth="1.4" />
      </svg>

      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: muted2, letterSpacing: '.14em', textTransform: 'uppercase' }}>Reach 7j</div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 800, color: channel.color, marginTop: 2, letterSpacing: '-.02em' }}>{channel.reach}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: muted2, letterSpacing: '.14em', textTransform: 'uppercase' }}>CTR</div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 800, color: emerald, marginTop: 2, letterSpacing: '-.02em' }}>{channel.ctr}</div>
        </div>
      </div>
    </button>
  )
}

function MarketingAgentInspector({ channel }: { channel: Channel }) {
  const t = useTick(2500)
  const pulse = 0.3 + Math.abs(Math.sin(t * Math.PI * 2)) * 0.7
  const agent = AGENTS_DATA.find(a => a.id === 'marketing')!
  return (
    <div style={{
      background: surface, border: `1px solid ${line}`, borderRadius: 14, padding: 16,
      borderTop: `3px solid ${agent.color}`,
      display: 'flex', flexDirection: 'column', gap: 12, position: 'relative', overflow: 'hidden',
    }}>
      <div style={{
        position: 'absolute', right: -20, bottom: -30,
        fontFamily: 'var(--font-display)', fontSize: 200, fontWeight: 800,
        color: agent.color, opacity: .06, lineHeight: 1, pointerEvents: 'none', userSelect: 'none',
      }}>{agent.sigil}</div>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, position: 'relative' }}>
        <div style={{ position: 'relative', width: 50, height: 50, flexShrink: 0 }}>
          <div style={{
            position: 'absolute', inset: 0, borderRadius: 10,
            background: `conic-gradient(from 0deg, ${agent.color}, transparent 60%, ${agent.color})`,
            opacity: 0.8 * pulse,
          }} />
          <div style={{
            position: 'absolute', inset: 3, borderRadius: 8, background: surface2,
            border: `1px solid ${agent.color}55`,
            display: 'grid', placeItems: 'center',
            fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 24, color: agent.color,
          }}>{agent.sigil}</div>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, color: muted, letterSpacing: '.14em', textTransform: 'uppercase' }}>MKT · Distribution</div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 17, fontWeight: 800, letterSpacing: '-.02em', color: text }}>{agent.name} Agent</div>
        </div>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, padding: '3px 7px', borderRadius: 4, background: `${agent.color}22`, color: agent.color, fontWeight: 800, letterSpacing: 1.5, flexShrink: 0 }}>LV {agent.level}</span>
      </div>

      {/* Draft queue */}
      <div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: muted, letterSpacing: '.14em', textTransform: 'uppercase', marginBottom: 6 }}>
          Drafts en cours · {channel.label}
        </div>
        <div style={{ padding: '16px 10px', textAlign: 'center' }}>
          <p style={{ fontSize: 12, color: muted2 }}>Aucun draft · lancez une campagne</p>
        </div>
      </div>

      {/* A/B arena */}
      <div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: muted, letterSpacing: '.14em', textTransform: 'uppercase', marginBottom: 6 }}>
          A/B test
        </div>
        <div style={{ padding: '16px 10px', textAlign: 'center' }}>
          <p style={{ fontSize: 12, color: muted2 }}>Aucun test actif</p>
        </div>
      </div>

      <button style={{
        marginTop: 'auto',
        padding: '10px 14px', borderRadius: 8,
        background: agent.color, color: '#0b0d12', border: 'none',
        fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 12, letterSpacing: '.06em',
        cursor: 'pointer',
      }}>▶ Générer la prochaine batch</button>
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
            <div style={{
              padding: '5px 8px', borderRadius: 6,
              background: isToday ? accent : surface2,
              color: isToday ? '#0b0d12' : muted,
              fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '.14em',
              textTransform: 'uppercase', fontWeight: 700, textAlign: 'center',
              border: `1px solid ${line}`,
            }}>{d}{isToday ? ' · today' : ''}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {CAL_ITEMS.filter(it => it.day === i).map((it, j) => {
                const ch = CHANNELS.find(c => c.id === it.ch)!
                return (
                  <div key={j} style={{
                    padding: '5px 8px', borderRadius: 5,
                    background: `${ch.color}10`, border: `1px solid ${ch.color}33`,
                    borderLeft: `2.5px solid ${ch.color}`,
                  }}>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8.5, color: ch.color, letterSpacing: '.1em', fontWeight: 700 }}>
                      {it.time} · {ch.label.toUpperCase()}
                    </div>
                    <div style={{ fontSize: 11, color: text, marginTop: 1, lineHeight: 1.25 }}>{it.title}</div>
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
    <div style={{ width: '100%', maxWidth: 260, padding: 10, borderRadius: 10, background: surface2, border: `1px solid ${line}` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'conic-gradient(from 0deg, #ff6a3d, #ffd166, #34d399, #22d3ee, #ff6a3d)', flexShrink: 0 }} />
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: text }}>Kenomi · 2nd</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8.5, color: muted }}>AI Venture Studio · 2h</div>
        </div>
      </div>
      <div style={{ fontSize: 11, marginTop: 8, lineHeight: 1.4, color: text }}>
        <b>3 signaux qui disent qu'une niche est prête à payer pour de l'IA.</b><br />
        On a testé 12 ventures. Voici la grille que Validation Agent applique.
      </div>
      <div style={{ display: 'flex', gap: 4, marginTop: 10 }}>
        {(['#22d3ee', '#34d399', '#a78bfa', '#fbbf24'] as const).map((c, i) => (
          <div key={i} style={{ flex: 1, height: 28, borderRadius: 4, background: `repeating-linear-gradient(135deg, ${c}40 0 6px, transparent 6px 12px)`, border: `1px solid ${line}` }} />
        ))}
      </div>
      <div style={{ display: 'flex', gap: 12, marginTop: 8, fontFamily: 'var(--font-mono)', fontSize: 9, color: muted }}>
        <span>♥ 184</span><span>💬 22</span><span>↗ 6</span>
      </div>
    </div>
  )
}

function TikTokMock() {
  return (
    <div style={{ width: 130, height: 220, borderRadius: 18, background: 'linear-gradient(160deg, #1a0b1f, #0b0d12)', border: `1px solid ${line}`, padding: 10, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8, color: '#e879f9', letterSpacing: '.14em' }}>● REC · 0:08</div>
      <div style={{
        background: 'repeating-linear-gradient(45deg, rgba(232,121,249,.15) 0 8px, transparent 8px 18px)',
        flex: 1, marginTop: 6, marginBottom: 6, borderRadius: 4,
        display: 'grid', placeItems: 'center', color: '#e879f9', fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: 2,
      }}>HOOK · 0-3s</div>
      <div style={{ fontSize: 10, fontWeight: 700, color: '#fff' }}>"J'ai posé 1 question à 12 founders"</div>
      <div style={{ display: 'flex', gap: 8, fontFamily: 'var(--font-mono)', fontSize: 9, color: 'rgba(255,255,255,.8)', marginTop: 4 }}>
        <span>♥ 2.4k</span><span>💬 184</span>
      </div>
    </div>
  )
}

function SeoMock() {
  return (
    <div style={{ width: '100%', maxWidth: 260 }}>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: emerald, letterSpacing: '.14em' }}>kenomi.studio › alternatives</div>
      <div style={{ fontSize: 13, fontWeight: 700, color: '#60a5fa', marginTop: 4, lineHeight: 1.3 }}>
        10 alternatives à Typeform pour SaaS B2B (2026)
      </div>
      <div style={{ fontSize: 10, color: muted, marginTop: 4, lineHeight: 1.4 }}>
        Comparatif des meilleures alternatives — pricing, intégrations, conditional logic. Mis à jour pour les founders et ops.
      </div>
      <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
        {['typeform', 'tally', 'kenomi', 'fillout'].map(k => (
          <span key={k} style={{ fontFamily: 'var(--font-mono)', fontSize: 8.5, padding: '2px 6px', borderRadius: 3, background: surface2, color: muted, letterSpacing: 1 }}>{k}</span>
        ))}
      </div>
      <div style={{ marginTop: 8, display: 'flex', justifyContent: 'space-between' }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: emerald }}>DA 42 · 14 backlinks</span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: muted2 }}>3 200 imp/mo</span>
      </div>
    </div>
  )
}

function NewsletterMock() {
  return (
    <div style={{ width: '100%', maxWidth: 260, padding: 12, borderRadius: 8, background: 'linear-gradient(180deg, #fbbf2418, transparent)', border: '1px solid #fbbf2444' }}>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: amber, letterSpacing: '.18em' }}>KENOMI · ISSUE 17</div>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 800, letterSpacing: '-.02em', marginTop: 6, lineHeight: 1.15, color: text }}>
        On a pivoté Legal Intake en 23 jours.
      </div>
      <div style={{ fontSize: 10.5, color: muted, marginTop: 6, lineHeight: 1.5 }}>
        Le sequencing du Decision Agent. 3 datapoints qui ont fait la différence. Le nouveau positionnement HR Ops.
      </div>
      <button style={{
        marginTop: 10, width: '100%',
        padding: '7px 10px', borderRadius: 4,
        background: amber, color: '#0b0d12', border: 'none',
        fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 10, letterSpacing: '.1em',
        cursor: 'pointer',
      }}>LIRE LE BUILD LOG →</button>
    </div>
  )
}

type AssetKind = 'linkedin' | 'tiktok' | 'seo' | 'newsletter'
const ASSET_TITLES: Record<AssetKind, string> = {
  linkedin: 'LinkedIn · carousel',
  tiktok: 'TikTok · short',
  seo: 'SEO · alternatives',
  newsletter: 'Newsletter · issue 17',
}
const ASSET_ETA: Record<AssetKind, string> = {
  linkedin: '8 min', tiktok: '14 min', seo: '22 min', newsletter: '9 min',
}

function AssetPreview({ kind }: { kind: AssetKind }) {
  return (
    <div style={{
      background: surface, border: `1px solid ${line}`, borderRadius: 14,
      overflow: 'hidden', display: 'flex', flexDirection: 'column',
    }}>
      <div style={{ padding: '10px 14px', borderBottom: `1px solid ${line}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 12.5, fontWeight: 700, letterSpacing: '-.01em', color: text }}>{ASSET_TITLES[kind]}</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: muted2, letterSpacing: '.14em', textTransform: 'uppercase', marginTop: 2 }}>
            Drafted by MKT · est. {ASSET_ETA[kind]}
          </div>
        </div>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, padding: '3px 6px', borderRadius: 3, background: surface2, color: muted, letterSpacing: 1 }}>v3</span>
      </div>
      <div style={{ flex: 1, padding: 14, display: 'grid', placeItems: 'center', background: bg }}>
        {kind === 'linkedin' && <LinkedInMock />}
        {kind === 'tiktok' && <TikTokMock />}
        {kind === 'seo' && <SeoMock />}
        {kind === 'newsletter' && <NewsletterMock />}
      </div>
    </div>
  )
}

const KPI_LIST = [
  { label: 'Reach 24h',    value: '—', delta: '—', color: cyan },
  { label: 'Avg CTR',      value: '—', delta: '—', color: emerald },
  { label: 'Engagement',   value: '—', delta: '—', color: violet },
  { label: 'Drafts queue', value: '—', delta: '—', color: amber },
  { label: 'A/B wins',     value: '—', delta: '—', color: fuchsia },
]

export default function MarketingPage() {
  const [selChannel, setSelChannel] = useState<typeof CHANNELS[number]['id']>('linkedin')
  const isMobile = useIsMobile()
  const agent = AGENTS_DATA.find(a => a.id === 'marketing')!
  const activeChannel = CHANNELS.find(c => c.id === selChannel)!

  const headerActions = (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      <button style={{
        padding: '8px 14px', borderRadius: 999,
        background: agent.color, color: '#0b0d12', border: 'none', cursor: 'pointer',
        fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 12, letterSpacing: '.04em',
      }}>+ Brief campagne</button>
      {[
        { label: `${CHANNELS.length} channels`, color: muted },
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
    <CkShell breadcrumb="Studio / Marketing" title="Marketing Lab" subtitle="LinkedIn · TikTok · SEO · Newsletter" actions={headerActions}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

        {/* KPI strip */}
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(5, 1fr)', gap: 10 }}>
          {KPI_LIST.map(k => <MkKpi key={k.label} {...k} />)}
        </div>

        {/* Row 1: Channels + Agent inspector */}
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 380px', gap: 14 }}>

          {/* Channels grid */}
          <div style={{
            background: surface, border: `1px solid ${line}`, borderRadius: 14, padding: 16,
            display: 'flex', flexDirection: 'column', gap: 12,
          }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
              <div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 700, letterSpacing: '-.01em', color: text }}>Broadcast channels</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, color: muted2, letterSpacing: '.14em', textTransform: 'uppercase', marginTop: 2 }}>MKT · 7 jours · reach / CTR</div>
              </div>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, color: agent.color, letterSpacing: '.14em' }}>● transmission active</span>
            </div>
            <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr', gridTemplateRows: '1fr 1fr', gap: 10 }}>
              {CHANNELS.map(ch => (
                <ChannelCard key={ch.id} channel={ch} active={selChannel === ch.id} onClick={() => setSelChannel(ch.id)} />
              ))}
            </div>
          </div>

          {/* Marketing Agent inspector */}
          <MarketingAgentInspector channel={activeChannel} />
        </div>

        {/* Row 2: Content calendar */}
        <div style={{
          background: surface, border: `1px solid ${line}`, borderRadius: 14, padding: 16,
          display: 'flex', flexDirection: 'column', gap: 10,
        }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
            <div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 700, letterSpacing: '-.01em', color: text }}>Content calendar · 7 jours</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, color: muted2, letterSpacing: '.14em', textTransform: 'uppercase', marginTop: 2 }}>programmé · agent MKT</div>
            </div>
            {!isMobile && (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                {CHANNELS.map(c => (
                  <span key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ width: 8, height: 8, borderRadius: 2, background: c.color }} />
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: muted, letterSpacing: '.1em' }}>{c.label}</span>
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
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)', gap: 14 }}>
          {(['linkedin', 'tiktok', 'seo', 'newsletter'] as const).map(kind => (
            <AssetPreview key={kind} kind={kind} />
          ))}
        </div>
      </div>
    </CkShell>
  )
}
