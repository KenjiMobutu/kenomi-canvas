'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { agentById, AGENTS_DATA, makeSpark, sparkPath, areaPath, useIsMobile } from '@/lib/studio-utils'
import { ACHIEVEMENTS_META, type Achievement, type AgentLevel } from '@/lib/gamification'
import { useGamification } from '@/lib/use-gamification'
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
function LevelUpTab({
  lastLevelUp,
  agentLevels,
  onSwitchTab,
}: {
  lastLevelUp: { agentId: string; fromLevel: number; toLevel: number } | null
  agentLevels: AgentLevel[]
  onSwitchTab: () => void
}) {
  const agentId  = lastLevelUp?.agentId ?? 'builder'
  const agent    = agentById(agentId)
  const isMobile = useIsMobile()
  const fromLevel = lastLevelUp?.fromLevel ?? (agentLevels.find(a => a.id === agentId)?.level ?? 1)
  const toLevel   = lastLevelUp?.toLevel   ?? fromLevel + 1
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
  }, [fromLevel, toLevel])

  const stats = [
    { label: 'Win rate',    from: 78,  to: 81,  suffix: '%', color: emerald },
    { label: 'Avg latency', from: 2.1, to: 1.8, suffix: 's', color: cyan, invert: true },
    { label: 'Quality',     from: 86,  to: 91,  suffix: '',  color: violet },
  ]
  const skill = { name: 'Pricing optimizer', desc: 'Auto-A/B prix selon CPC, churn et signal payeur', badge: '✦' }

  if (!lastLevelUp) {
    return (
      <div style={{
        minHeight: 'calc(100dvh - 56px)', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: 32, padding: '40px 24px',
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '.42em', textTransform: 'uppercase', color: muted, marginBottom: 8 }}>NIVEAU ACTUEL</div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 26, fontWeight: 700, color: text, letterSpacing: '-.02em' }}>
            {agentLevels.length === 0 ? 'En attente de données…' : 'Aucun level-up récent'}
          </div>
          <div style={{ fontSize: 13, color: muted, marginTop: 6, maxWidth: 380 }}>
            Continue à builder — la prochaine progression déclenchera l&apos;animation
          </div>
        </div>
        {agentLevels.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${isMobile ? 2 : 4}, 1fr)`, gap: 10, width: '100%', maxWidth: 620 }}>
            {agentLevels.map(al => {
              const ag = agentById(al.id)
              return (
                <div key={al.id} style={{ padding: '12px 14px', borderRadius: 10, background: surface, border: `1px solid ${line}`, textAlign: 'center' }}>
                  <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 24, color: ag.color }}>{ag.sigil}</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: muted, letterSpacing: '.14em', textTransform: 'uppercase', marginTop: 4 }}>{ag.code}</div>
                  <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 22, color: text, marginTop: 2 }}>LV {al.level}</div>
                  <div style={{ height: 3, borderRadius: 2, background: surface2, marginTop: 6, overflow: 'hidden' }}>
                    <div style={{ width: `${al.xpBar * 100}%`, height: '100%', background: ag.color }} />
                  </div>
                </div>
              )
            })}
          </div>
        )}
        <button onClick={onSwitchTab} style={{
          padding: '10px 22px', borderRadius: 999,
          background: surface, color: text,
          border: `1px solid ${line2}`, cursor: 'pointer',
          fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 11, letterSpacing: '.14em', textTransform: 'uppercase',
        }}>Voir les achievements</button>
      </div>
    )
  }

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
              LV {toLevel} → LV {toLevel + 1}
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
          <button onClick={onSwitchTab} style={{
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
function AchievementsTab({ achievements, claimedIds, onRefetch, loading }: {
  achievements: Achievement[]
  claimedIds: string[]
  onRefetch: () => void
  loading: boolean
}) {
  const { user } = useAuth()
  const isMobile = useIsMobile()
  const [filter, setFilter] = useState<string>('all')
  const [optimisticClaimed, setOptimisticClaimed] = useState<string[]>([])
  const claimed = useMemo(() => new Set([...claimedIds, ...optimisticClaimed]), [claimedIds, optimisticClaimed])

  async function handleClaim(id: string, xp: number) {
    setOptimisticClaimed(prev => [...prev, id])
    if (user) {
      const supabase = createSupabaseBrowser()
      const { error } = await supabase.from('achievement_claims').upsert({ user_id: user.id, achievement_id: id, xp })
      if (error && !error.message.includes('does not exist')) {
        toast.error(error.message)
        return
      }
      onRefetch()
    }
    toast.success(`+${xp} XP crédités`)
  }

  if (loading) {
    return (
      <div style={{ padding: isMobile ? '16px 12px 40px' : '24px 32px 40px', maxWidth: 1400 }}>
        <div style={{ height: 178, borderRadius: 18, background: surface, border: `1px solid ${line}`, marginBottom: 24, animation: 'ach-shimmer 1.8s linear infinite', backgroundImage: `linear-gradient(110deg, ${surface} 30%, ${surface2} 50%, ${surface} 70%)`, backgroundSize: '200% 100%' }} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} style={{ height: 120, borderRadius: 12, background: surface, border: `1px solid ${line}`, animation: 'ach-shimmer 1.8s linear infinite', animationDelay: `${i * 0.1}s`, backgroundImage: `linear-gradient(110deg, ${surface} 30%, ${surface2} 50%, ${surface} 70%)`, backgroundSize: '200% 100%' }} />
          ))}
        </div>
      </div>
    )
  }

  const filtered = achievements.filter(a => {
    if (filter === 'all') return true
    if (filter === 'unlocked') return a.unlocked
    if (filter === 'locked') return !a.unlocked
    return a.rarity === filter
  })

  const unlockedCount = achievements.filter(a => a.unlocked).length
  const totalCount = achievements.length
  const xpEarned = achievements.filter(a => a.unlocked).reduce((s, a) => s + a.xp, 0)
  const xpPossible = achievements.reduce((s, a) => s + a.xp, 0)
  const justUnlocked = achievements.find(a => !a.unlocked) ?? achievements[0] ?? { ...ACHIEVEMENTS_META[0], unlocked: false, pct: 0 }

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
            ◇ Prochain objectif
          </div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 38, fontWeight: 800, letterSpacing: '-.03em', lineHeight: 1.05, marginTop: 6, color: text }}>
            {justUnlocked.label}
          </div>
          <div style={{ fontSize: 14, color: muted, marginTop: 6, maxWidth: 500 }}>
            {justUnlocked.desc}
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
        <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', gap: 8, minWidth: 160 }}>
          {justUnlocked.unlocked ? (
            <button
              onClick={() => handleClaim(justUnlocked.id, justUnlocked.xp)}
              disabled={claimed.has(justUnlocked.id)}
              style={{
                padding: '12px 22px', borderRadius: 999,
                background: claimed.has(justUnlocked.id) ? surface2 : `linear-gradient(90deg, ${justUnlocked.color}, ${accent2})`,
                color: claimed.has(justUnlocked.id) ? muted : '#0b0d12',
                border: claimed.has(justUnlocked.id) ? `1px solid ${line}` : 'none',
                cursor: claimed.has(justUnlocked.id) ? 'default' : 'pointer',
                fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 12.5, letterSpacing: '.06em',
                boxShadow: claimed.has(justUnlocked.id) ? 'none' : `0 6px 24px ${justUnlocked.color}55`,
              }}
            >{claimed.has(justUnlocked.id) ? '✓ Réclamé' : `RÉCLAMER · +${justUnlocked.xp} XP`}</button>
          ) : (
            <div style={{ padding: '10px 14px', borderRadius: 12, background: surface2, border: `1px solid ${line}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, color: muted, letterSpacing: '.14em', textTransform: 'uppercase' }}>Progression</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, color: justUnlocked.color, letterSpacing: '.1em', fontWeight: 700 }}>{justUnlocked.pct}%</span>
              </div>
              <div style={{ height: 6, borderRadius: 3, background: surface, overflow: 'hidden', border: `1px solid ${line}` }}>
                <div style={{ width: `${justUnlocked.pct}%`, height: '100%', background: `linear-gradient(90deg, ${justUnlocked.color}, ${accent2})`, transition: 'width .6s ease' }} />
              </div>
            </div>
          )}
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

/* ─────── Constellation data ─────── */
const CHATTER_DATA = [
  { from: 'scout',      to: 'validation', type: 'signal',  text: "r/solopreneur spike +312% — 'AI inbox triage'" },
  { from: 'validation', to: 'decision',   type: 'score',   text: 'HR Ops Inbox · score 78 / CPC 0.42€' },
  { from: 'decision',   to: 'builder',    type: 'order',   text: 'Build landing — Solo CFO v2' },
  { from: 'builder',    to: 'payment',    type: 'handoff', text: 'Pricing page ready — wire Stripe' },
  { from: 'payment',    to: 'analytics',  type: 'event',   text: 'checkout.completed · €29 MRR' },
  { from: 'marketing',  to: 'analytics',  type: 'ping',    text: 'LinkedIn carousel — 14k impressions' },
  { from: 'analytics',  to: 'decision',   type: 'report',  text: 'Forms · CAC -11% · MRR +18%' },
  { from: 'decision',   to: 'marketing',  type: 'brief',   text: 'Push waitlist — Solo CFO' },
  { from: 'scout',      to: 'marketing',  type: 'trend',   text: "TikTok hook — 'AI bookkeeper'" },
  { from: 'validation', to: 'builder',    type: 'spec',    text: 'Niche: bilingual freelancer invoicing' },
]
const VENTURES_QUEST = [
  { id: 'forms', name: 'Kenomi Forms',      status: 'Scale',    score: 91, mrr: 2800, cac: 14, agents: ['analytics','marketing','payment','decision'] },
  { id: 'cfo',   name: 'Solo CFO Copilot',  status: 'Continue', score: 84, mrr:  620, cac: 21, agents: ['validation','marketing','analytics'] },
  { id: 'ops',   name: 'HR Ops Inbox',      status: 'Continue', score: 78, mrr:    0, cac:  0, agents: ['validation','marketing','builder'] },
  { id: 'legal', name: 'Legal Intake Bot',  status: 'Pivot',    score: 68, mrr:  310, cac: 39, agents: ['builder','payment','marketing'] },
  { id: 'crm',   name: 'Creator CRM Lite',  status: 'Stop',     score: 42, mrr:  120, cac: 52, agents: ['marketing','analytics'] },
]
const TRAFFIC_VOLS: Record<string, Record<string, number>> = {
  scout:      { validation: 142, marketing:  87 },
  validation: { decision:  156, builder:   198 },
  builder:    { payment:   241 },
  payment:    { analytics:  89 },
  marketing:  { analytics: 134 },
  analytics:  { decision:  178 },
  decision:   { builder:   167, marketing: 143 },
}
const MAX_TVOL = 241
const AGENT_IDS = ['scout','validation','builder','payment','marketing','analytics','decision'] as const
const STATUS_COLOR: Record<string, string> = {
  Scale: '#34d399', Continue: '#22d3ee', Pivot: '#e879f9', Stop: '#fb7185',
}
const CST_CX = 550, CST_CY = 310, CST_R = 215

type AgentPos = typeof AGENTS_DATA[0] & { x: number; y: number }
type BeamItem = typeof CHATTER_DATA[0]

/* ─────── ConstellationSVG ─────── */
function ConstellationSVG({ agentPositions, activeBeams, levelMap }: {
  agentPositions: AgentPos[]
  activeBeams: BeamItem[]
  levelMap: Record<string, AgentLevel>
}) {
  const W = 1100, H = 600
  return (
    <svg width="100%" height="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet"
      style={{ display: 'block', minHeight: 400 } as V}>
      <defs>
        <radialGradient id="cstCoreGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0%"   stopColor="var(--ck-accent)" stopOpacity=".55" />
          <stop offset="60%"  stopColor="var(--ck-accent)" stopOpacity=".05" />
          <stop offset="100%" stopColor="var(--ck-accent)" stopOpacity="0"   />
        </radialGradient>
        <filter id="cstSoftGlow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="3" />
        </filter>
      </defs>

      {/* Backdrop glow */}
      <circle cx={CST_CX} cy={CST_CY} r={CST_R + 110} fill="url(#cstCoreGlow)" />

      {/* Concentric rings */}
      {[1, 1.4, 1.85, 2.25].map((m, i) => (
        <circle key={i} cx={CST_CX} cy={CST_CY} r={CST_R * m * 0.42}
          fill="none" stroke="var(--ck-line)" strokeDasharray={i % 2 ? '2 6' : undefined} />
      ))}

      {/* Tick marks */}
      {Array.from({ length: 60 }).map((_, i) => {
        const a = (i / 60) * Math.PI * 2
        const r1 = CST_R + 60, r2 = CST_R + (i % 5 === 0 ? 68 : 64)
        return (
          <line key={i}
            x1={CST_CX + Math.cos(a) * r1} y1={CST_CY + Math.sin(a) * r1}
            x2={CST_CX + Math.cos(a) * r2} y2={CST_CY + Math.sin(a) * r2}
            stroke={i % 5 === 0 ? 'var(--ck-text)' : 'var(--ck-muted-2)'}
            strokeOpacity={i % 5 === 0 ? .55 : .22}
            strokeWidth={i % 5 === 0 ? 1.2 : 0.8} />
        )
      })}

      {/* Rotating compass dot (SMIL) */}
      <g>
        <animateTransform attributeName="transform" type="rotate"
          from={`0 ${CST_CX} ${CST_CY}`} to={`360 ${CST_CX} ${CST_CY}`}
          dur="8s" repeatCount="indefinite" />
        <circle cx={CST_CX + CST_R + 70} cy={CST_CY} r={4} fill="var(--ck-accent)" />
        <circle cx={CST_CX + CST_R + 70} cy={CST_CY} r={10} fill="var(--ck-accent)" opacity=".22" />
      </g>

      {/* Active beams */}
      {activeBeams.map((beam, idx) => {
        const fromA = agentPositions.find(a => a.id === beam.from)
        const toA   = agentPositions.find(a => a.id === beam.to)
        if (!fromA || !toA) return null
        return (
          <g key={`${idx}-${beam.text}`}>
            <line x1={fromA.x} y1={fromA.y} x2={toA.x} y2={toA.y}
              stroke={fromA.color} strokeOpacity=".55" strokeWidth="1.4"
              strokeDasharray="4 6"
              style={{ animation: 'dash-flow 1.4s linear infinite' } as V} />
            <circle r={5} fill={fromA.color} filter="url(#cstSoftGlow)">
              <animate attributeName="cx" from={String(Math.round(fromA.x))} to={String(Math.round(toA.x))} dur="1.5s" repeatCount="indefinite" />
              <animate attributeName="cy" from={String(Math.round(fromA.y))} to={String(Math.round(toA.y))} dur="1.5s" repeatCount="indefinite" />
            </circle>
            <circle r={3} fill="#fff">
              <animate attributeName="cx" from={String(Math.round(fromA.x))} to={String(Math.round(toA.x))} dur="1.5s" repeatCount="indefinite" />
              <animate attributeName="cy" from={String(Math.round(fromA.y))} to={String(Math.round(toA.y))} dur="1.5s" repeatCount="indefinite" />
            </circle>
          </g>
        )
      })}

      {/* Central core */}
      <g transform={`translate(${CST_CX}, ${CST_CY})`}>
        <circle r={56} fill="var(--ck-surface)" stroke="var(--ck-accent)" strokeOpacity=".7" />
        <circle r={56} fill="none" stroke="var(--ck-accent)" strokeOpacity=".25" strokeDasharray="2 4">
          <animateTransform attributeName="transform" type="rotate" from="0" to="360" dur="14s" repeatCount="indefinite" />
        </circle>
        <circle r={46} fill="none" stroke="var(--ck-accent)" strokeOpacity=".4" strokeDasharray="3 7">
          <animateTransform attributeName="transform" type="rotate" from="360" to="0" dur="10s" repeatCount="indefinite" />
        </circle>
        <text textAnchor="middle" y={-6} fontSize={9} letterSpacing="3"
          fill="var(--ck-muted)" fontFamily="var(--font-mono)">DECISION CORE</text>
        <text textAnchor="middle" y={14} fontSize={22} fontWeight="800"
          fill="var(--ck-text)" fontFamily="var(--font-display)" letterSpacing="-.02em">CONTINUE</text>
        <text textAnchor="middle" y={32} fontSize={10}
          fill="var(--ck-accent)" fontFamily="var(--font-mono)" letterSpacing="2">CONF 89%</text>
      </g>

      {/* Agent nodes */}
      {agentPositions.map(a => {
        const active  = activeBeams.some(b => b.from === a.id || b.to === a.id)
        const isRight = (a.x - CST_CX) > 0
        const al      = levelMap[a.id]
        const xpVal   = al ? al.xpBar : a.xp
        const lvlVal  = al ? al.level  : a.level
        return (
          <g key={a.id} transform={`translate(${Math.round(a.x)}, ${Math.round(a.y)})`}>
            {active && (
              <circle r={30} fill="none" stroke={a.color} strokeOpacity=".5">
                <animate attributeName="r"              from="28" to="52" dur="1.6s" repeatCount="indefinite" />
                <animate attributeName="stroke-opacity" from=".7"  to="0" dur="1.6s" repeatCount="indefinite" />
              </circle>
            )}
            <circle r={28} fill="var(--ck-surface)" stroke={a.color} strokeOpacity=".8" strokeWidth="1.4" />
            <circle r={24} fill={a.color} fillOpacity=".09" />
            <text textAnchor="middle" y={7} fontSize={22}
              fill={a.color} fontFamily="var(--font-display)" fontWeight="700">{a.sigil}</text>
            <g transform={isRight ? 'translate(36, 0)' : 'translate(-36, 0)'}>
              <text textAnchor={isRight ? 'start' : 'end'} y={-2} fontSize={13} fontWeight="700"
                fill="var(--ck-text)" fontFamily="var(--font-display)" letterSpacing="-.01em">{a.name}</text>
              <text textAnchor={isRight ? 'start' : 'end'} y={12} fontSize={9}
                fill="var(--ck-muted)" fontFamily="var(--font-mono)" letterSpacing="1.4">
                {`LV ${lvlVal} · ${a.model.toUpperCase()}`}
              </text>
              <rect x={isRight ? 0 : -90} y={20} width={90} height={3} rx={1.5} fill="var(--ck-line-2)" />
              <rect x={isRight ? 0 : -(90 * xpVal)} y={20} width={90 * xpVal} height={3} rx={1.5} fill={a.color} />
            </g>
          </g>
        )
      })}
    </svg>
  )
}

/* ─────── GaugeCard ─────── */
function GaugeCard({ label, value, delta, tone, spark }: {
  label: string; value: string; delta: string; tone: string; spark: number[]
}) {
  const safeId  = label.replace(/\s+/g, '-').toLowerCase()
  const pathLine = sparkPath(spark, 140, 44)
  const pathArea = areaPath(spark, 140, 44)
  return (
    <div style={{ background: surface, border: `1px solid ${line}`, borderRadius: 12, padding: 12, position: 'relative', overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '.14em', textTransform: 'uppercase' as const, color: muted }}>{label}</span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, padding: '2px 6px', borderRadius: 4, background: tone + '1a', color: tone, letterSpacing: 1 }}>{delta}</span>
      </div>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 800, letterSpacing: '-.02em', marginTop: 8, color: text }}>{value}</div>
      <svg width="100%" height="44" style={{ marginTop: 6 }} viewBox="0 0 140 44" preserveAspectRatio="none">
        <defs>
          <linearGradient id={`cg-${safeId}`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%"   stopColor={tone} stopOpacity=".35" />
            <stop offset="100%" stopColor={tone} stopOpacity="0"   />
          </linearGradient>
        </defs>
        <path d={pathArea} fill={`url(#cg-${safeId})`} />
        <path d={pathLine} fill="none" stroke={tone} strokeWidth="1.6" />
      </svg>
    </div>
  )
}

/* ─────── DecisionQueuePanel ─────── */
function DecisionQueuePanel() {
  const queue = [
    { action: 'Scale',    venture: 'Kenomi Forms',     conf: 92, color: emerald     },
    { action: 'Continue', venture: 'Solo CFO Copilot', conf: 84, color: cyan        },
    { action: 'Pivot',    venture: 'Legal Intake Bot',  conf: 76, color: fuchsia     },
    { action: 'Stop',     venture: 'Creator CRM Lite',  conf: 71, color: '#fb7185'  },
  ]
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {queue.map(d => (
        <div key={d.venture} style={{
          padding: 10, borderRadius: 8, border: `1px solid ${line}`,
          background: surface2, display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: 10, alignItems: 'center',
        }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, padding: '4px 8px', borderRadius: 4, background: d.color + '22', color: d.color, letterSpacing: 1.5, fontWeight: 700 }}>
            {d.action.toUpperCase()}
          </span>
          <div>
            <div style={{ fontSize: 12.5, fontWeight: 600, color: text }}>{d.venture}</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: muted, letterSpacing: 1, marginTop: 2 }}>conf {d.conf}%</div>
          </div>
          <div style={{ width: 38, height: 38, position: 'relative' }}>
            <svg width="38" height="38" viewBox="0 0 38 38">
              <circle cx="19" cy="19" r="15" fill="none" stroke={line2} strokeWidth="3" />
              <circle cx="19" cy="19" r="15" fill="none" stroke={d.color} strokeWidth="3"
                strokeDasharray={`${(d.conf / 100) * 94} 94`} strokeLinecap="round" transform="rotate(-90 19 19)" />
            </svg>
            <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', fontFamily: 'var(--font-mono)', fontSize: 9, color: d.color }}>{d.conf}</div>
          </div>
        </div>
      ))}
    </div>
  )
}

/* ─────── AgentCard ─────── */
function AgentCard({ agent, level, xpBar }: {
  agent: typeof AGENTS_DATA[0]; level: number; xpBar: number
}) {
  return (
    <div style={{ position: 'relative', background: surface, border: `1px solid ${line}`, borderRadius: 12, padding: 12, overflow: 'hidden', display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 2, background: agent.color }} />
      <div style={{ position: 'absolute', right: -8, bottom: -16, fontFamily: 'var(--font-display)', fontSize: 100, fontWeight: 800, color: agent.color, opacity: .07, lineHeight: 1, pointerEvents: 'none' }}>{agent.sigil}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ position: 'relative', width: 34, height: 34, flexShrink: 0 }}>
          <div style={{ position: 'absolute', inset: 0, borderRadius: 8, background: `conic-gradient(from 0deg, ${agent.color}, transparent 60%, ${agent.color})`, opacity: 0.6 }} />
          <div style={{ position: 'absolute', inset: 2, borderRadius: 6, background: surface, border: `1px solid ${agent.color}55`, display: 'grid', placeItems: 'center', fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 16, color: agent.color }}>{agent.sigil}</div>
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 4 }}>
            <span style={{ fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 700, letterSpacing: '-.01em', color: text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{agent.name}</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, padding: '1px 5px', borderRadius: 3, background: agent.color + '22', color: agent.color, fontWeight: 700, flexShrink: 0 }}>LV{level}</span>
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: muted, letterSpacing: 1 }}>{agent.code} · {agent.model.toUpperCase()}</div>
        </div>
      </div>
      <div style={{ height: 4, borderRadius: 2, background: surface2, overflow: 'hidden' }}>
        <div style={{ width: `${xpBar * 100}%`, height: '100%', background: agent.color, transition: 'width .6s ease' }} />
      </div>
      <div style={{ padding: '6px 8px', borderRadius: 6, background: surface2, display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: agent.color, flexShrink: 0, boxShadow: `0 0 5px ${agent.color}` }} />
        <span style={{ fontSize: 11, color: text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{agent.role}</span>
      </div>
    </div>
  )
}

/* ─────── VentureQuestsPanel ─────── */
function VentureQuestsPanel() {
  return (
    <div style={{ background: surface, border: `1px solid ${line}`, borderRadius: 14, overflow: 'hidden' }}>
      {VENTURES_QUEST.map((v, i) => (
        <div key={v.id} style={{
          padding: '12px 14px',
          borderBottom: i < VENTURES_QUEST.length - 1 ? `1px solid ${line}` : 'none',
          display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: 12, alignItems: 'center',
        }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 8.5, padding: '3px 8px', borderRadius: 4, background: (STATUS_COLOR[v.status] ?? accent) + '22', color: STATUS_COLOR[v.status] ?? accent, letterSpacing: 1.5, fontWeight: 700, textTransform: 'uppercase' as const, whiteSpace: 'nowrap' as const }}>
            {v.status}
          </span>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: text }}>{v.name}</div>
            <div style={{ display: 'flex', gap: 10, marginTop: 3 }}>
              {v.mrr > 0 && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: emerald }}>€{v.mrr.toLocaleString()} MRR</span>}
              {v.cac > 0 && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: muted }}>CAC €{v.cac}</span>}
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: muted }}>score {v.score}</span>
            </div>
          </div>
          <div style={{ display: 'flex' }}>
            {v.agents.map((agId, j) => {
              const ag = agentById(agId)
              return (
                <div key={agId} title={ag.name} style={{ width: 22, height: 22, borderRadius: '50%', background: ag.color + '22', border: `1.5px solid ${ag.color}66`, display: 'grid', placeItems: 'center', fontFamily: 'var(--font-display)', fontSize: 11, color: ag.color, marginLeft: j === 0 ? 0 : -4 }}>
                  {ag.sigil}
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}

/* ─────── TrafficMatrixPanel ─────── */
function TrafficMatrixPanel() {
  return (
    <div style={{ background: surface, border: `1px solid ${line}`, borderRadius: 14, overflow: 'auto' }}>
      <table style={{ borderCollapse: 'collapse', width: '100%' }}>
        <thead>
          <tr>
            <th style={{ padding: '8px 10px', fontFamily: 'var(--font-mono)', fontSize: 7.5, color: muted, textAlign: 'left', borderBottom: `1px solid ${line}`, whiteSpace: 'nowrap' as const }}>FROM ↓ · TO →</th>
            {AGENT_IDS.map(id => {
              const ag = agentById(id)
              return (
                <th key={id} style={{ padding: '8px 6px', fontFamily: 'var(--font-mono)', fontSize: 8, color: ag.color, textAlign: 'center', letterSpacing: 1, borderBottom: `1px solid ${line}` }}>
                  {ag.code}
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {AGENT_IDS.map(fromId => {
            const fromAg = agentById(fromId)
            return (
              <tr key={fromId}>
                <td style={{ padding: '7px 10px', fontFamily: 'var(--font-mono)', fontSize: 8, color: fromAg.color, letterSpacing: 1, borderBottom: `1px solid ${line}`, whiteSpace: 'nowrap' as const }}>
                  {fromAg.code}
                </td>
                {AGENT_IDS.map(toId => {
                  const vol       = TRAFFIC_VOLS[fromId]?.[toId] ?? 0
                  const intensity = vol / MAX_TVOL
                  const isDiag    = fromId === toId
                  const alpha     = Math.round(15 + intensity * 60).toString(16).padStart(2, '0')
                  return (
                    <td key={toId} style={{
                      padding: '7px 4px', textAlign: 'center',
                      background: isDiag ? surface2 : vol > 0 ? fromAg.color + alpha : 'transparent',
                      borderBottom: `1px solid ${line}`,
                    }}>
                      {isDiag ? (
                        <span style={{ color: muted2, fontSize: 10 }}>—</span>
                      ) : vol > 0 ? (
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: intensity > 0.5 ? 700 : 400, color: intensity > 0.4 ? fromAg.color : muted }}>
                          {vol}
                        </span>
                      ) : (
                        <span style={{ color: line2, fontSize: 10 }}>·</span>
                      )}
                    </td>
                  )
                })}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

/* ─────── ConstellationTab ─────── */
function ConstellationTab({ agentLevels }: { agentLevels: AgentLevel[] }) {
  const isMobile = useIsMobile()
  const [logIndex, setLogIndex] = useState(0)

  useEffect(() => {
    const id = setInterval(() => setLogIndex(n => (n + 1) % CHATTER_DATA.length), 1800)
    return () => clearInterval(id)
  }, [])

  const agentPositions = useMemo<AgentPos[]>(() =>
    AGENTS_DATA.map((a, i) => {
      const angle = (i / AGENTS_DATA.length) * Math.PI * 2 - Math.PI / 2
      return { ...a, x: CST_CX + Math.cos(angle) * CST_R, y: CST_CY + Math.sin(angle) * CST_R }
    }), [])

  const activeBeams = useMemo<BeamItem[]>(
    () => [0, 1, 2].map(k => CHATTER_DATA[(logIndex + k) % CHATTER_DATA.length]),
    [logIndex]
  )

  const levelMap = useMemo(
    () => Object.fromEntries(agentLevels.map(al => [al.id, al])),
    [agentLevels]
  )

  const sparkMRR  = useMemo(() => makeSpark(36, 30, 12,  7), [])
  const sparkCAC  = useMemo(() => makeSpark(36, 60, 14, 11), [])
  const sparkConv = useMemo(() => makeSpark(36, 45, 16, 19), [])
  const sparkExp  = useMemo(() => makeSpark(36, 40, 22, 23), [])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: 'calc(100dvh - 56px)', overflow: 'auto' }}>

      {/* Row 1: SVG + right rail */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: isMobile ? '1fr' : '1fr 400px',
        minHeight: isMobile ? 'auto' : 560,
        borderBottom: `1px solid ${line}`,
      }}>
        {/* SVG panel */}
        <div style={{ padding: isMobile ? '12px 4px' : '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <ConstellationSVG agentPositions={agentPositions} activeBeams={activeBeams} levelMap={levelMap} />
        </div>

        {/* Right rail */}
        {!isMobile && (
          <div style={{ borderLeft: `1px solid ${line}`, display: 'flex', flexDirection: 'column', gap: 0, overflow: 'auto' }}>
            {/* KPI Gauges */}
            <div style={{ padding: '14px 14px 0', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <GaugeCard label="MRR Studio"    value="€3 750"  delta="+18%"  tone={emerald} spark={sparkMRR}  />
              <GaugeCard label="CAC moyen"     value="€22"     delta="-11%"  tone={cyan}    spark={sparkCAC}  />
              <GaugeCard label="Conv. rate"    value="4.8%"    delta="+0.7%" tone={violet}  spark={sparkConv} />
              <GaugeCard label="Exp. actives"  value="23"      delta="+3"    tone={fuchsia} spark={sparkExp}  />
            </div>
            {/* Decision Queue */}
            <div style={{ padding: '14px 14px', flex: 1 }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8.5, letterSpacing: '.28em', textTransform: 'uppercase' as const, color: muted, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ display: 'inline-block', width: 7, height: 7, borderRadius: '50%', background: accent, boxShadow: `0 0 6px ${accent}`, animation: 'lu-glow 2s ease-in-out infinite' }} />
                Decision Queue
              </div>
              <DecisionQueuePanel />
            </div>
          </div>
        )}
      </div>

      {/* Row 2: Agent roster */}
      <div style={{
        padding: '14px 16px',
        display: 'grid',
        gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(7, 1fr)',
        gap: 10,
        borderBottom: `1px solid ${line}`,
      }}>
        {AGENTS_DATA.map(agent => {
          const al = levelMap[agent.id]
          return <AgentCard key={agent.id} agent={agent} level={al?.level ?? 0} xpBar={al?.xpBar ?? 0} />
        })}
      </div>

      {/* Row 3: Venture Quests + Traffic Matrix */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: isMobile ? '1fr' : '1fr 520px',
        gap: 14,
        padding: '14px 16px',
        borderBottom: `1px solid ${line}`,
      }}>
        <div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8.5, letterSpacing: '.28em', textTransform: 'uppercase' as const, color: muted, marginBottom: 10 }}>
            Venture Quests
          </div>
          <VentureQuestsPanel />
        </div>
        <div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8.5, letterSpacing: '.28em', textTransform: 'uppercase' as const, color: muted, marginBottom: 10 }}>
            Traffic Matrix
          </div>
          <TrafficMatrixPanel />
        </div>
      </div>

      {/* Ticker */}
      <div style={{
        height: 44, background: surface,
        overflow: 'hidden', display: 'flex', alignItems: 'center',
        position: 'relative', flexShrink: 0,
      }}>
        <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 48, zIndex: 1, pointerEvents: 'none', background: `linear-gradient(90deg, ${surface}, transparent)` }} />
        <div style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 48, zIndex: 1, pointerEvents: 'none', background: `linear-gradient(-90deg, ${surface}, transparent)` }} />
        <div style={{ display: 'inline-flex', alignItems: 'center', whiteSpace: 'nowrap', animation: 'const-ticker 32s linear infinite' }}>
          {[...CHATTER_DATA, ...CHATTER_DATA].map((c, i) => {
            const fromAg = agentById(c.from)
            const toAg   = agentById(c.to)
            const ts = `T+${String(Math.floor(i * 1.8 / 60)).padStart(2,'0')}:${String(Math.floor(i * 1.8 % 60)).padStart(2,'0')}`
            return (
              <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '0 18px' }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 8, color: muted2, letterSpacing: 1 }}>{ts}</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 8, padding: '2px 5px', borderRadius: 3, background: fromAg.color + '22', color: fromAg.color, fontWeight: 700, letterSpacing: 1 }}>{fromAg.code}</span>
                <span style={{ color: muted, fontSize: 9 }}>→</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 8, padding: '2px 5px', borderRadius: 3, background: toAg.color + '22', color: toAg.color, fontWeight: 700, letterSpacing: 1 }}>{toAg.code}</span>
                <span style={{ fontSize: 10, color: muted, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.text}</span>
                <span style={{ color: line2, fontSize: 12, paddingLeft: 6 }}>·</span>
              </span>
            )
          })}
        </div>
      </div>
    </div>
  )
}

/* ─────── Page ─────── */
export default function GamificationPage() {
  const router = useRouter()
  const isMobile = useIsMobile()
  const [theme, setTheme] = useState<'dark' | 'light'>('dark')
  const [tab, setTab] = useState<'levelup' | 'achievements' | 'constellation'>('achievements')
  const { achievements, agentLevels, lastLevelUp, userLevel, userXP, loading, claimed, refetch } = useGamification()

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
        @keyframes const-ticker {
          from { transform: translateX(0); }
          to   { transform: translateX(-50%); }
        }
        @keyframes dash-flow {
          to { stroke-dashoffset: -20; }
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
              { id: 'levelup',       label: isMobile ? 'LvlUp'   : 'Level Up'      },
              { id: 'achievements',  label: isMobile ? 'Achiev.' : 'Achievements'  },
              { id: 'constellation', label: isMobile ? 'Orbits'  : 'Constellation' },
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
          {!loading && (
            <span style={{
              fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '.14em',
              padding: '4px 10px', borderRadius: 999,
              background: surface2, color: muted, border: `1px solid ${line}`,
            }}>LV {userLevel} · {userXP} XP</span>
          )}
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

      {tab === 'levelup'
        ? <LevelUpTab lastLevelUp={lastLevelUp} agentLevels={agentLevels} onSwitchTab={() => setTab('achievements')} />
        : tab === 'constellation'
        ? <ConstellationTab agentLevels={agentLevels} />
        : <AchievementsTab achievements={achievements} claimedIds={claimed} onRefetch={refetch} loading={loading} />}
    </div>
  )
}
