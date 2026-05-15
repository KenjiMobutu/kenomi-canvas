'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { agentById, useIsMobile } from '@/lib/studio-utils'
import {
  CK_DARK, CK_LIGHT,
  bg, surface, surface2, line, line2, text, muted, muted2,
  accent, accent2, emerald, cyan, violet, fuchsia,
} from '@/lib/ck-vars'
import { createSupabaseBrowser } from '@/lib/supabase-browser'
import { useAuth } from '@/lib/auth-context'
import { toast } from 'sonner'

/* ─────── types ─────── */
type V = React.CSSProperties & { [key: string]: string | number | undefined }

interface Achievement {
  id: string
  label: string
  desc: string
  unlocked: boolean
  rarity: 'common' | 'rare' | 'epic' | 'legendary'
  xp: number
  badge: string
  color: string
  pct: number
}

/* ─────── data ─────── */
const ACHIEVEMENTS: Achievement[] = [
  { id: 'first-mrr',      label: 'First €1k MRR',       desc: 'Atteindre €1 000 de MRR mensuel',            unlocked: true,  rarity: 'rare',      xp: 250,  badge: '★', color: '#22d3ee', pct: 100 },
  { id: 'ship-7',         label: 'Ship 7 landings',      desc: 'Lancer 7 landings sur 30 jours',             unlocked: true,  rarity: 'rare',      xp: 200,  badge: '▲', color: '#34d399', pct: 100 },
  { id: 'cac-under-20',   label: 'CAC < €20',            desc: 'Maintenir CAC sous €20 sur 14j',             unlocked: true,  rarity: 'epic',      xp: 320,  badge: '◈', color: '#fbbf24', pct: 100 },
  { id: '100k-imp',       label: '100k impressions',     desc: 'Cumuler 100 000 impressions',                unlocked: true,  rarity: 'common',    xp: 100,  badge: '≋', color: '#60a5fa', pct: 100 },
  { id: 'valid-pivot',    label: 'Validate pivot',       desc: 'Réussir un pivot validé en moins de 30j',    unlocked: true,  rarity: 'epic',      xp: 380,  badge: '✦', color: '#a78bfa', pct: 100 },
  { id: '20-experiments', label: '20 expériences live',  desc: '20 expériences actives simultanément',       unlocked: true,  rarity: 'common',    xp:  80,  badge: '◬', color: '#22d3ee', pct: 100 },
  { id: 'first-scale',    label: 'First scale call',     desc: "Premier verdict 'Scale' du Decision Agent", unlocked: false, rarity: 'epic',      xp: 420,  badge: '◮', color: '#fb923c', pct: 78  },
  { id: '5-ventures',     label: '5 ventures launched',  desc: 'Lancer 5 ventures live',                     unlocked: false, rarity: 'rare',      xp: 280,  badge: '◇', color: '#34d399', pct: 60  },
  { id: 'auto-30',        label: '30 workflows n8n',     desc: 'Configurer 30 workflows actifs',             unlocked: false, rarity: 'common',    xp: 120,  badge: '⟁', color: '#60a5fa', pct: 60  },
  { id: '20k-mrr',        label: '€20k MRR',             desc: 'Atteindre €20 000 de MRR studio',            unlocked: false, rarity: 'legendary', xp: 1200, badge: '✺', color: '#e879f9', pct: 21  },
  { id: '10-ventures',    label: '10 ventures live',     desc: 'Maintenir 10 ventures live',                 unlocked: false, rarity: 'epic',      xp: 600,  badge: '◐', color: '#a78bfa', pct: 30  },
  { id: 'season-podium',  label: 'Season podium',        desc: "Finir top 3 d'une season",                   unlocked: false, rarity: 'legendary', xp: 1500, badge: '✦', color: '#ff6a3d', pct: 8   },
]

const RARITY: Record<Achievement['rarity'], { color: string; label: string }> = {
  common:    { color: '#94a3b8', label: 'Common'    },
  rare:      { color: '#22d3ee', label: 'Rare'      },
  epic:      { color: '#a78bfa', label: 'Epic'      },
  legendary: { color: '#fbbf24', label: 'Legendary' },
}

/* ─────── sub-components ─────── */
function RarityPill({ rarity }: { rarity: Achievement['rarity'] }) {
  const r = RARITY[rarity]
  return (
    <span style={{
      fontFamily: 'var(--font-mono)', fontSize: 10, padding: '3px 8px', borderRadius: 4,
      background: r.color + '22', color: r.color,
      letterSpacing: '.18em', textTransform: 'uppercase', fontWeight: 800,
      display: 'inline-flex', alignItems: 'center', gap: 4,
    } as V}>
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: r.color, flexShrink: 0 }} />
      {r.label}
    </span>
  )
}

function AchievementCard({ a, claimed, onClaim }: { a: Achievement; claimed: boolean; onClaim: (id: string, xp: number) => void }) {
  const r = RARITY[a.rarity]
  const u = a.unlocked
  return (
    <div style={{
      position: 'relative', padding: 14, borderRadius: 12,
      background: u ? `linear-gradient(135deg, ${a.color}10, ${surface})` : surface,
      border: u ? `1px solid ${a.color}55` : `1px solid ${line}`,
      opacity: u ? 1 : 0.62,
      display: 'flex', flexDirection: 'column', gap: 10,
      overflow: 'hidden',
    } as V}>
      <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, background: r.color, opacity: u ? 1 : 0.35 }} />
      <div style={{
        position: 'absolute', right: -8, bottom: -16,
        fontFamily: 'var(--font-display)', fontSize: 80, fontWeight: 800, color: a.color, opacity: .07, lineHeight: 1,
        pointerEvents: 'none',
      }}>{a.badge}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{
          width: 48, height: 48, borderRadius: 10, flexShrink: 0,
          background: u ? `linear-gradient(135deg, ${a.color}, ${accent2})` : surface2,
          border: `1px solid ${u ? a.color + '88' : line}`,
          display: 'grid', placeItems: 'center',
          boxShadow: u ? `0 0 14px ${a.color}55` : 'none',
        }}>
          <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 22, color: u ? '#0b0d12' : muted2 }}>
            {u ? a.badge : '?'}
          </span>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <RarityPill rarity={a.rarity} />
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 700, letterSpacing: '-.01em', marginTop: 4, color: text }}>{a.label}</div>
        </div>
      </div>
      <div style={{ fontSize: 11.5, color: muted, lineHeight: 1.4, minHeight: 32 }}>{a.desc}</div>
      {u ? (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          {claimed ? (
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, color: emerald, letterSpacing: '.14em', textTransform: 'uppercase' }}>✓ Réclamé</span>
          ) : (
            <button onClick={() => onClaim(a.id, a.xp)} style={{
              padding: '5px 12px', borderRadius: 999,
              background: `linear-gradient(90deg, ${a.color}, ${accent2})`, color: '#0b0d12',
              border: 'none', cursor: 'pointer',
              fontFamily: 'var(--font-mono)', fontWeight: 800, fontSize: 10, letterSpacing: '.1em',
              textTransform: 'uppercase',
            }}>Réclamer</button>
          )}
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: a.color, letterSpacing: '.1em', fontWeight: 700 }}>+{a.xp} XP</span>
        </div>
      ) : (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, color: muted2, letterSpacing: '.14em', textTransform: 'uppercase' }}>{a.pct}% · en cours</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, color: muted, letterSpacing: '.1em' }}>+{a.xp} XP</span>
          </div>
          <div style={{ height: 4, borderRadius: 2, background: surface2, overflow: 'hidden', border: `1px solid ${line}` }}>
            <div style={{ width: `${a.pct}%`, height: '100%', background: `linear-gradient(90deg, ${a.color}, ${accent2})` }} />
          </div>
        </div>
      )}
    </div>
  )
}

function ConfettiField({ color }: { color: string }) {
  const palette = [color, accent, accent2, cyan, emerald, fuchsia, violet]
  const pieces = useMemo(() => Array.from({ length: 28 }).map((_, i) => {
    const seed = (i + 1) * 13
    return {
      x: (seed * 37) % 1600,
      dx: ((seed * 17) % 200) - 100,
      r0: (seed * 41) % 360,
      r1: ((seed * 41) % 360) + 540,
      w: 6 + ((seed * 7) % 8),
      h: 10 + ((seed * 11) % 14),
      shape: i % 3,
      color: palette[i % palette.length],
      delay: (i * 0.27) % 4,
      dur: 3.5 + ((seed * 3) % 30) / 10,
    }
  }), [color]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden' }}>
      {pieces.map((p, i) => (
        <span key={i} style={{
          position: 'absolute', top: 0, left: 0,
          width: p.w, height: p.h,
          background: p.color,
          borderRadius: p.shape === 0 ? 1 : p.shape === 1 ? '50%' : 0,
          clipPath: p.shape === 2 ? 'polygon(50% 0, 100% 100%, 0 100%)' : 'none',
          '--x': `${p.x}px`,
          '--dx': `${p.dx}px`,
          '--r0': `${p.r0}deg`,
          '--r1': `${p.r1}deg`,
          animation: `lu-confetti-fall ${p.dur}s linear infinite`,
          animationDelay: `${p.delay}s`,
          opacity: 0.85,
        } as V} />
      ))}
    </div>
  )
}

function LevelBadge({ level, highlight, color, dim, pop }: { level: number; highlight?: boolean; color?: string; dim?: boolean; pop?: boolean }) {
  const c = color || accent
  return (
    <div style={{
      position: 'relative', width: 100, height: 100,
      opacity: dim ? 0.35 : 1,
      transition: 'opacity .8s ease',
      animation: pop ? 'lu-pop .8s cubic-bezier(.4,1.6,.6,1) both' : 'none',
    }}>
      <svg width="100" height="100" viewBox="0 0 100 100">
        <defs>
          <linearGradient id={`lb-${level}-${highlight}`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={highlight ? c : '#475569'} />
            <stop offset="100%" stopColor={highlight ? accent2 : '#1e293b'} />
          </linearGradient>
        </defs>
        <path d="M50 4 L92 18 V50 C92 73 73 90 50 96 C27 90 8 73 8 50 V18 Z"
          fill={`url(#lb-${level}-${highlight})`}
          stroke={highlight ? 'rgba(255,255,255,.4)' : 'rgba(255,255,255,.1)'} strokeWidth="1.5" />
        <path d="M50 10 L86 22 V50 C86 70 70 84 50 90 C30 84 14 70 14 50 V22 Z"
          fill="rgba(0,0,0,.35)" />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', textAlign: 'center' }}>
        <div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, color: 'rgba(255,255,255,.65)', letterSpacing: '.2em', marginBottom: -4 }}>LV</div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 36, fontWeight: 800, color: '#fff', textShadow: '0 2px 4px rgba(0,0,0,.5)', letterSpacing: '-.04em' }}>{level}</div>
        </div>
      </div>
    </div>
  )
}

function StatDelta({ stat, active, delay }: { stat: { label: string; from: number; to: number; suffix: string; color: string; invert?: boolean }; active: boolean; delay: number }) {
  return (
    <div style={{
      padding: 12, borderRadius: 10,
      background: surface, border: `1px solid ${line}`,
      animation: active ? `lu-pop .7s ease ${delay}s both` : 'none',
    }}>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: muted, letterSpacing: '.14em', textTransform: 'uppercase' }}>{stat.label}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 6 }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 14, color: muted2, textDecoration: 'line-through' }}>{stat.from}{stat.suffix}</span>
        <svg width="11" height="11" viewBox="0 0 11 11"><path d="M2 6 H8 M6 3 L9 6 L6 9" stroke={stat.color} strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
        <span style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 800, color: stat.color, letterSpacing: '-.02em' }}>{stat.to}{stat.suffix}</span>
      </div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: stat.color, letterSpacing: '.1em', marginTop: 2 }}>
        {stat.invert ? '↓' : '↑'} {Math.abs(stat.to - stat.from).toFixed(stat.suffix === 's' ? 1 : 0)}{stat.suffix}
      </div>
    </div>
  )
}

/* ─────── LevelUpTab ─────── */
function LevelUpTab() {
  const agent = agentById('builder')
  const isMobile = useIsMobile()
  const fromLevel = 17, toLevel = 18
  const [lvl, setLvl] = useState(toLevel)
  const [phase, setPhase] = useState<'locked' | 'burst'>('locked')

  useEffect(() => {
    let idA: ReturnType<typeof setTimeout>, idB: ReturnType<typeof setTimeout>
    function loop() {
      setLvl(fromLevel); setPhase('locked')
      idA = setTimeout(() => { setPhase('burst'); setLvl(toLevel) }, 500)
      idB = setTimeout(loop, 5200)
    }
    loop()
    return () => { clearTimeout(idA); clearTimeout(idB) }
  }, [])

  const stats = [
    { label: 'Win rate',    from: 78,  to: 81,  suffix: '%', color: emerald },
    { label: 'Avg latency', from: 2.1, to: 1.8, suffix: 's', color: cyan, invert: true },
    { label: 'Quality',     from: 86,  to: 91,  suffix: '',  color: violet },
  ]
  const skill = { name: 'Pricing optimizer', desc: 'Auto-A/B prix selon CPC, churn et signal payeur', badge: '✦' }

  return (
    <div style={{
      position: 'relative', minHeight: 'calc(100dvh - 56px)',
      overflow: 'hidden', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      padding: '40px 24px',
    }}>
      {/* Backdrop */}
      <div style={{
        position: 'absolute', inset: 0,
        background: `radial-gradient(circle at 50% 50%, ${agent.color}33 0%, transparent 40%), radial-gradient(circle at 50% 50%, rgba(7,9,13,.55), rgba(7,9,13,.97))`,
        pointerEvents: 'none',
      }} />

      <ConfettiField color={agent.color} />

      {/* Center stage */}
      <div style={{
        position: 'relative', zIndex: 4,
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24, maxWidth: 600, width: '100%',
      }}>
        {/* Title */}
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '.42em', textTransform: 'uppercase', color: agent.color, fontWeight: 700 }}>
            Agent · {agent.code} · {agent.role}
          </div>
          <div style={{
            fontFamily: 'var(--font-display)', fontSize: 64, fontWeight: 800, letterSpacing: '-.04em', lineHeight: 1, marginTop: 6,
            background: `linear-gradient(90deg, ${agent.color}, ${accent2}, ${agent.color})`,
            backgroundSize: '200% 100%',
            WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent',
            animation: 'lu-shine 3.4s linear infinite',
          }}>LEVEL UP</div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 700, letterSpacing: '-.01em', marginTop: 4, color: text }}>
            {agent.name} Agent
          </div>
        </div>

        {/* Orb */}
        <div style={{ position: 'relative', width: 260, height: 260 }}>
          {[0, 1, 2].map(i => (
            <div key={i} style={{
              position: 'absolute', left: '50%', top: '50%',
              width: 140, height: 140, borderRadius: '50%',
              border: `1.5px solid ${agent.color}`,
              animation: 'lu-ring-expand 2.4s ease-out infinite',
              animationDelay: `${i * 0.8}s`,
              pointerEvents: 'none',
            } as V} />
          ))}
          <div style={{
            position: 'absolute', left: '50%', top: '50%',
            width: 240, height: 240, borderRadius: '50%',
            transform: 'translate(-50%, -50%)',
            background: `radial-gradient(circle, ${agent.color}55 0%, transparent 60%)`,
            filter: 'blur(12px)',
            animation: 'lu-glow 2.2s ease-in-out infinite',
            pointerEvents: 'none',
          }} />
          {Array.from({ length: 32 }).map((_, i) => {
            const angle = (i / 32) * 360
            const colors = [agent.color, accent2, '#fff', agent.color]
            const c = colors[i % colors.length]
            return (
              <span key={i} style={{
                position: 'absolute', left: '50%', top: '50%',
                width: 6, height: 6, borderRadius: '50%',
                background: c, boxShadow: `0 0 8px ${c}`,
                animation: 'lu-particle-fly 1.8s ease-out infinite',
                animationDelay: `${-(i % 16) * 0.11}s`,
                '--a': `${angle}deg`,
                pointerEvents: 'none',
              } as V} />
            )
          })}
          <div style={{
            position: 'absolute', left: '50%', top: '50%',
            width: 150, height: 150, borderRadius: '50%',
            transform: 'translate(-50%, -50%)',
            background: surface,
            border: `1.5px solid ${agent.color}`,
            display: 'grid', placeItems: 'center',
            boxShadow: `0 0 60px ${agent.color}88, inset 0 0 30px ${agent.color}33`,
          }}>
            <div style={{
              position: 'absolute', inset: -4, borderRadius: '50%',
              background: `conic-gradient(from 0deg, ${agent.color}, transparent 45%, ${agent.color})`,
              opacity: .9,
              animation: 'lu-orb-rotate 4s linear infinite',
              WebkitMask: 'radial-gradient(circle, transparent 70%, #000 71%)',
              mask: 'radial-gradient(circle, transparent 70%, #000 71%)',
            }} />
            <span style={{
              fontFamily: 'var(--font-display)', fontSize: 80, fontWeight: 800, color: agent.color,
              textShadow: `0 0 30px ${agent.color}`,
            }}>{agent.sigil}</span>
          </div>
        </div>

        {/* LV transition */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <LevelBadge level={fromLevel} dim={phase === 'burst'} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            {[0, 1, 2].map(i => (
              <svg key={i} width="14" height="14" viewBox="0 0 14 14" style={{ animation: 'lu-arrow 1s ease-in-out infinite', animationDelay: `${i * 0.15}s` }}>
                <path d="M2 7 H10 M7 3 L11 7 L7 11" stroke={agent.color} strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            ))}
          </div>
          <LevelBadge level={toLevel} highlight color={agent.color} key={phase === 'burst' ? 'popped' : 'norm'} pop={phase === 'burst'} />
        </div>

        {/* XP bar */}
        <div style={{ width: '100%', maxWidth: 520, textAlign: 'center' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: muted, letterSpacing: '.14em', textTransform: 'uppercase' }}>XP overflow</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: agent.color, letterSpacing: '.1em' }}>
              1000 / 1000 → 124 / 1100 (next: LV {toLevel + 1})
            </span>
          </div>
          <div style={{ height: 10, borderRadius: 5, background: surface2, overflow: 'hidden', border: `1px solid ${line}`, position: 'relative' }}>
            <div style={{
              width: `${phase === 'burst' ? 11 : 100}%`,
              height: '100%',
              background: `linear-gradient(90deg, ${agent.color}, ${accent2})`,
              boxShadow: `0 0 14px ${agent.color}`,
              transition: 'width 1.2s cubic-bezier(.7,.1,.3,1)',
            }} />
            <div style={{
              position: 'absolute', inset: 0,
              backgroundImage: 'linear-gradient(45deg, rgba(255,255,255,.18) 25%, transparent 25%, transparent 50%, rgba(255,255,255,.18) 50%, rgba(255,255,255,.18) 75%, transparent 75%)',
              backgroundSize: '10px 10px', opacity: .35,
              animation: 'lu-shine 1.5s linear infinite',
            }} />
          </div>
        </div>

        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr 1fr', gap: 10, width: '100%', maxWidth: 520 }}>
          {stats.map((s, i) => (
            <StatDelta key={s.label} stat={s} active={phase === 'burst'} delay={i * 0.15} />
          ))}
        </div>

        {/* Skill unlocked */}
        <div style={{
          width: '100%', maxWidth: 520, padding: '12px 16px', borderRadius: 12,
          background: `linear-gradient(90deg, ${agent.color}18, transparent)`,
          border: `1px solid ${agent.color}55`,
          display: 'flex', alignItems: 'center', gap: 14,
          opacity: phase === 'burst' ? 1 : 0,
          transition: 'opacity .8s ease .8s',
          animation: phase === 'burst' ? 'lu-pop .8s ease .8s both' : 'none',
        }}>
          <div style={{
            width: 44, height: 44, borderRadius: 10, flexShrink: 0,
            background: `linear-gradient(135deg, ${agent.color}, ${accent2})`,
            display: 'grid', placeItems: 'center',
            fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 22, color: '#0b0d12',
            boxShadow: `0 0 18px ${agent.color}77`,
          }}>{skill.badge}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, color: agent.color, letterSpacing: '.18em', textTransform: 'uppercase', fontWeight: 700 }}>
              Compétence débloquée
            </div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 700, letterSpacing: '-.01em', marginTop: 2, color: text }}>{skill.name}</div>
            <div style={{ fontSize: 11.5, color: muted, marginTop: 2 }}>{skill.desc}</div>
          </div>
          <span style={{
            fontFamily: 'var(--font-mono)', fontSize: 9, padding: '3px 7px', borderRadius: 4,
            background: accent, color: '#0b0d12', letterSpacing: 1.5, fontWeight: 800, flexShrink: 0,
          }}>NOUVEAU</span>
        </div>

        {/* CTAs */}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
          <button style={{
            padding: '12px 28px', borderRadius: 999,
            background: `linear-gradient(90deg, ${agent.color}, ${accent2})`, color: '#0b0d12',
            border: 'none', cursor: 'pointer',
            fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 13, letterSpacing: '.06em',
            boxShadow: `0 6px 30px ${agent.color}55`,
          }}>RÉCLAMER · +250 XP</button>
          <button style={{
            padding: '12px 22px', borderRadius: 999,
            background: surface, color: text,
            border: `1px solid ${line2}`, cursor: 'pointer',
            fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 11, letterSpacing: '.14em',
            textTransform: 'uppercase',
          }}>Voir les achievements</button>
        </div>
      </div>

      {/* Bottom hints */}
      <div style={{
        position: 'absolute', left: 0, right: 0, bottom: 16, zIndex: 4,
        display: 'flex', justifyContent: 'center', gap: 24,
        fontFamily: 'var(--font-mono)', fontSize: 10, color: muted2, letterSpacing: '.18em', textTransform: 'uppercase',
      }}>
        <span>↵ continuer</span>
        <span>A · achievements</span>
        <span>R · revoir la run</span>
      </div>
    </div>
  )
}

/* ─────── AchievementsTab ─────── */
function AchievementsTab() {
  const { user } = useAuth()
  const isMobile = useIsMobile()
  const [filter, setFilter] = useState<string>('all')
  const [claimed, setClaimed] = useState<Set<string>>(new Set())

  useEffect(() => {
    try {
      const stored = localStorage.getItem('kenomi-claimed-achievements')
      if (stored) setClaimed(new Set(JSON.parse(stored)))
    } catch {}
  }, [])

  async function handleClaim(id: string, xp: number) {
    const next = new Set(claimed).add(id)
    setClaimed(next)
    try { localStorage.setItem('kenomi-claimed-achievements', JSON.stringify([...next])) } catch {}
    if (user) {
      const supabase = createSupabaseBrowser()
      await supabase.from('achievement_claims').upsert({ user_id: user.id, achievement_id: id, xp })
        .then(({ error }) => {
          if (error && !error.message.includes('does not exist')) toast.error(error.message)
        })
    }
    toast.success(`+${xp} XP crédités`)
  }

  const filtered = ACHIEVEMENTS.filter(a => {
    if (filter === 'all') return true
    if (filter === 'unlocked') return a.unlocked
    if (filter === 'locked') return !a.unlocked
    return a.rarity === filter
  })

  const unlockedCount = ACHIEVEMENTS.filter(a => a.unlocked).length
  const totalCount = ACHIEVEMENTS.length
  const xpEarned = ACHIEVEMENTS.filter(a => a.unlocked).reduce((s, a) => s + a.xp, 0)
  const xpPossible = ACHIEVEMENTS.reduce((s, a) => s + a.xp, 0)
  const justUnlocked = ACHIEVEMENTS.find(a => a.id === 'valid-pivot')!

  return (
    <div style={{ padding: isMobile ? '16px 12px 40px' : '24px 32px 40px', maxWidth: 1400 }}>
      {/* Hero banner */}
      <div style={{
        position: 'relative', padding: 24, borderRadius: 18, marginBottom: 24,
        background: `linear-gradient(135deg, ${justUnlocked.color}18, transparent 50%), ${surface}`,
        border: `1.5px solid ${justUnlocked.color}`,
        display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'auto 1fr auto', gap: isMobile ? 16 : 28, alignItems: 'center',
        overflow: 'hidden',
        boxShadow: `0 0 60px ${justUnlocked.color}22`,
      }}>
        {/* Shimmer */}
        <div style={{
          position: 'absolute', inset: 0,
          background: `linear-gradient(110deg, transparent 30%, ${justUnlocked.color}22 50%, transparent 70%)`,
          backgroundSize: '200% 100%',
          animation: 'ach-shimmer 4s linear infinite',
          pointerEvents: 'none',
        }} />
        {/* Badge */}
        <div style={{ position: 'relative', width: 130, height: 130 }}>
          {[0, 1].map(i => (
            <div key={i} style={{
              position: 'absolute', left: '50%', top: '50%',
              width: 100, height: 100, borderRadius: '50%',
              border: `1.5px solid ${justUnlocked.color}`,
              animation: 'ach-burst 2.4s ease-out infinite',
              animationDelay: `${i * 1.2}s`,
              pointerEvents: 'none',
            } as V} />
          ))}
          <div style={{
            position: 'absolute', inset: 4, borderRadius: '50%',
            background: `conic-gradient(from 0deg, ${justUnlocked.color}, transparent 50%, ${accent2}, ${justUnlocked.color})`,
            animation: 'ach-rotate 6s linear infinite',
            WebkitMask: 'radial-gradient(circle, transparent 70%, #000 71%)',
            mask: 'radial-gradient(circle, transparent 70%, #000 71%)',
          }} />
          <div style={{
            position: 'absolute', inset: 18, borderRadius: '50%',
            background: `linear-gradient(135deg, ${justUnlocked.color}, ${accent2})`,
            display: 'grid', placeItems: 'center',
            boxShadow: `0 0 30px ${justUnlocked.color}88, inset 0 0 20px rgba(0,0,0,.3)`,
            animation: 'ach-bob 3s ease-in-out infinite',
          }}>
            <span style={{ fontFamily: 'var(--font-display)', fontSize: 52, fontWeight: 800, color: '#0b0d12' }}>
              {justUnlocked.badge}
            </span>
          </div>
        </div>
        {/* Text */}
        <div style={{ position: 'relative', zIndex: 1 }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '.42em', textTransform: 'uppercase', color: justUnlocked.color, fontWeight: 800 }}>
            ◆ Achievement Unlocked · il y a 2 minutes
          </div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 38, fontWeight: 800, letterSpacing: '-.03em', lineHeight: 1.05, marginTop: 6, color: text }}>
            {justUnlocked.label}
          </div>
          <div style={{ fontSize: 14, color: muted, marginTop: 6, maxWidth: 500 }}>
            {justUnlocked.desc}. Solo CFO Copilot a été pivoté depuis Legal Intake Bot en 23 jours, validé par 3 paying customers.
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <RarityPill rarity={justUnlocked.rarity} />
            <span style={{
              fontFamily: 'var(--font-mono)', fontSize: 11, padding: '4px 10px', borderRadius: 999,
              background: justUnlocked.color + '1e', color: justUnlocked.color, letterSpacing: '.14em', fontWeight: 700,
            }}>+{justUnlocked.xp} XP</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, color: muted, letterSpacing: '.1em' }}>
              · attribué à DEC + VAL + BLD
            </span>
          </div>
        </div>
        {/* CTAs */}
        <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button
            onClick={() => handleClaim(justUnlocked.id, justUnlocked.xp)}
            style={{
              padding: '12px 22px', borderRadius: 999,
              background: `linear-gradient(90deg, ${justUnlocked.color}, ${accent2})`, color: '#0b0d12',
              border: 'none', cursor: 'pointer',
              fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 12.5, letterSpacing: '.06em',
              boxShadow: `0 6px 24px ${justUnlocked.color}55`,
              opacity: claimed.has(justUnlocked.id) ? 0.5 : 1,
            }}
          >{claimed.has(justUnlocked.id) ? '✓ Réclamé' : `RÉCLAMER · +${justUnlocked.xp} XP`}</button>
          <button style={{
            padding: '10px 18px', borderRadius: 999,
            background: 'transparent', color: text,
            border: `1px solid ${line2}`, cursor: 'pointer',
            fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 10.5, letterSpacing: '.14em', textTransform: 'uppercase',
          }}>Partager</button>
        </div>
      </div>

      {/* Filter row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: muted, letterSpacing: '.18em', textTransform: 'uppercase', marginRight: 4 }}>filter</span>
          {[
            { id: 'all', label: 'Tout' },
            { id: 'unlocked', label: 'Unlocked' },
            { id: 'locked', label: 'Locked' },
            { id: 'common', label: 'Common', c: RARITY.common.color },
            { id: 'rare', label: 'Rare', c: RARITY.rare.color },
            { id: 'epic', label: 'Epic', c: RARITY.epic.color },
            { id: 'legendary', label: 'Legendary', c: RARITY.legendary.color },
          ].map(f => (
            <button key={f.id} onClick={() => setFilter(f.id)} style={{
              padding: '6px 12px', borderRadius: 999,
              background: filter === f.id ? accent : surface,
              color: filter === f.id ? '#0b0d12' : (f.c || text),
              border: filter === f.id ? `1px solid ${accent}` : `1px solid ${line}`,
              cursor: 'pointer',
              fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '.14em', textTransform: 'uppercase', fontWeight: 700,
              display: 'inline-flex', alignItems: 'center', gap: 5,
            }}>
              {f.c && <span style={{ width: 6, height: 6, borderRadius: '50%', background: f.c }} />}
              {f.label}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {[
            { label: 'Total XP', value: `${xpEarned}/${xpPossible}` },
            { label: `${unlockedCount}/${totalCount}`, value: 'unlocked' },
            { label: 'Complet', value: `${Math.round((xpEarned / xpPossible) * 100)}%` },
          ].map(s => (
            <div key={s.label} style={{
              padding: '6px 12px', borderRadius: 8,
              background: surface, border: `1px solid ${line}`,
              display: 'flex', flexDirection: 'column', lineHeight: 1.15,
            }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 8.5, color: muted2, letterSpacing: '.14em', textTransform: 'uppercase' }}>{s.label}</span>
              <span style={{ fontFamily: 'var(--font-display)', fontSize: 12, fontWeight: 700, color: text, marginTop: 2 }}>{s.value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
        {filtered.map(a => (
          <AchievementCard key={a.id} a={a} claimed={claimed.has(a.id)} onClaim={handleClaim} />
        ))}
      </div>
    </div>
  )
}

/* ─────── Page ─────── */
export default function GamificationPage() {
  const router = useRouter()
  const isMobile = useIsMobile()
  const [theme, setTheme] = useState<'dark' | 'light'>('dark')
  const [tab, setTab] = useState<'levelup' | 'achievements'>('levelup')

  useEffect(() => {
    try { setTheme((localStorage.getItem('kenomi-ck-theme') as 'dark' | 'light') || 'dark') } catch {}
  }, [])

  const toggleTheme = useCallback(() => {
    setTheme(t => {
      const next = t === 'dark' ? 'light' : 'dark'
      try { localStorage.setItem('kenomi-ck-theme', next) } catch {}
      return next
    })
  }, [])

  const vars = theme === 'dark'
    ? {
        '--ck-bg': '#07090d', '--ck-surface': '#0e1118', '--ck-surface-2': '#141823',
        '--ck-line': 'rgba(255,255,255,.07)', '--ck-line-2': 'rgba(255,255,255,.12)',
        '--ck-text': '#e7eaf0', '--ck-muted': '#8a93a6', '--ck-muted-2': '#5b6478',
        '--ck-accent': '#ff6a3d', '--ck-accent-2': '#ffd166',
        '--ck-emerald': '#34d399', '--ck-amber': '#fbbf24', '--ck-rose': '#fb7185',
        '--ck-cyan': '#22d3ee', '--ck-violet': '#a78bfa', '--ck-fuchsia': '#e879f9',
      }
    : {
        '--ck-bg': '#f4f1ec', '--ck-surface': '#ffffff', '--ck-surface-2': '#f9f5ee',
        '--ck-line': 'rgba(15,18,28,.08)', '--ck-line-2': 'rgba(15,18,28,.14)',
        '--ck-text': '#14181f', '--ck-muted': '#5b6478', '--ck-muted-2': '#8a93a6',
        '--ck-accent': '#ff6a3d', '--ck-accent-2': '#ffd166',
        '--ck-emerald': '#34d399', '--ck-amber': '#fbbf24', '--ck-rose': '#fb7185',
        '--ck-cyan': '#22d3ee', '--ck-violet': '#a78bfa', '--ck-fuchsia': '#e879f9',
      }

  return (
    <div style={{ ...vars, background: bg, color: text, minHeight: '100dvh', fontFamily: 'var(--font-sans)' } as V}>
      <style>{`
        @keyframes lu-particle-fly {
          0%   { transform: translate(-50%, -50%) rotate(var(--a)) translateX(0)      scale(0.3); opacity: 0; }
          15%  { opacity: 1; }
          100% { transform: translate(-50%, -50%) rotate(var(--a)) translateX(260px)  scale(0.5); opacity: 0; }
        }
        @keyframes lu-ring-expand {
          0%   { transform: translate(-50%, -50%) scale(0.5); opacity: 0.8; }
          100% { transform: translate(-50%, -50%) scale(2.6); opacity: 0; }
        }
        @keyframes lu-orb-rotate   { to { transform: rotate(360deg); } }
        @keyframes lu-confetti-fall {
          0%   { transform: translate3d(var(--x), -40px, 0) rotate(var(--r0)); opacity: 0; }
          8%   { opacity: 1; }
          100% { transform: translate3d(calc(var(--x) + var(--dx)), 1100px, 0) rotate(var(--r1)); opacity: 0.6; }
        }
        @keyframes lu-shine {
          from { background-position: -200% 0; }
          to   { background-position:  200% 0; }
        }
        @keyframes lu-arrow {
          0%, 100% { transform: translateX(0); opacity: .75; }
          50%      { transform: translateX(6px); opacity: 1; }
        }
        @keyframes lu-pop {
          0%   { transform: scale(0.6); opacity: 0; }
          60%  { transform: scale(1.08); opacity: 1; }
          100% { transform: scale(1); opacity: 1; }
        }
        @keyframes lu-glow {
          0%, 100% { opacity: .4; }
          50%      { opacity: .9; }
        }
        @keyframes ach-shimmer {
          0%   { background-position: -150% 0; }
          100% { background-position:  250% 0; }
        }
        @keyframes ach-burst {
          0%   { transform: translate(-50%, -50%) scale(0.6); opacity: .8; }
          100% { transform: translate(-50%, -50%) scale(1.8); opacity: 0; }
        }
        @keyframes ach-rotate { to { transform: rotate(360deg); } }
        @keyframes ach-bob {
          0%, 100% { transform: translateY(0); }
          50%      { transform: translateY(-4px); }
        }
      `}</style>

      {/* Header */}
      <header style={{
        position: 'sticky', top: 0, zIndex: 20, height: isMobile ? 50 : 56,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: isMobile ? '0 12px' : '0 24px',
        background: bg,
        borderBottom: `1px solid ${line}`,
        backdropFilter: 'blur(12px)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 8 : 24 }}>
          {!isMobile && (
            <div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '.18em', textTransform: 'uppercase', color: muted }}>
                Studio · Gamification
              </div>
            </div>
          )}
          {/* Tabs */}
          <div style={{ display: 'flex', gap: 4 }}>
            {[
              { id: 'levelup', label: isMobile ? 'LvlUp' : 'Level Up' },
              { id: 'achievements', label: isMobile ? 'Achiev.' : 'Achievements' },
            ].map(t => (
              <button key={t.id} onClick={() => setTab(t.id as typeof tab)} style={{
                padding: '5px 14px', borderRadius: 6,
                background: tab === t.id ? surface2 : 'transparent',
                color: tab === t.id ? text : muted,
                border: tab === t.id ? `1px solid ${line2}` : `1px solid transparent`,
                cursor: 'pointer',
                fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '.1em', fontWeight: tab === t.id ? 700 : 400,
                transition: 'all .15s',
              }}>{t.label}</button>
            ))}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {!isMobile && (
            <button onClick={() => router.push('/studio')} style={{
              padding: '5px 10px', borderRadius: 6, cursor: 'pointer',
              background: 'transparent', color: muted,
              border: `1px solid ${line}`,
              fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '.12em',
            }}>← Cockpit</button>
          )}
          <button onClick={toggleTheme} style={{
            padding: '5px 10px', borderRadius: 6, cursor: 'pointer',
            background: 'transparent', color: muted,
            border: `1px solid ${line}`,
            fontFamily: 'var(--font-mono)', fontSize: 11,
          }}>{theme === 'dark' ? '☀' : '☾'}</button>
        </div>
      </header>

      {tab === 'levelup' ? <LevelUpTab /> : <AchievementsTab />}
    </div>
  )
}
