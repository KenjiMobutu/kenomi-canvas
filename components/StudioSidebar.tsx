'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  BarChart3, Bot, FileText, GitBranch, KeyRound,
  LayoutDashboard, LogOut, Megaphone, MessageSquare,
  Network, Server, Settings, Trophy, Workflow,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { createSupabaseBrowser } from '@/lib/supabase-browser'

const nav = [
  { href: '/studio',                label: 'Cockpit',        icon: LayoutDashboard, group: 'Studio' },
  { href: '/studio/ventures',       label: 'Ventures',       icon: GitBranch,       group: 'Studio' },
  { href: '/studio/agents',         label: 'Agents',         icon: Bot,             group: 'Studio' },
  { href: '/studio/marketing',      label: 'Marketing',      icon: Megaphone,       group: 'Studio' },
  { href: '/studio/analytics',      label: 'Analytics',      icon: BarChart3,       group: 'Studio' },
  { href: '/studio/automations',    label: 'Automations',    icon: Workflow,        group: 'Studio' },
  { href: '/studio/infrastructure', label: 'Infrastructure', icon: Server,          group: 'Studio' },
  { href: '/studio/gamification',  label: 'Gamification',   icon: Trophy,           group: 'Studio' },
  { href: '/studio/chat',           label: 'Command Chat',   icon: MessageSquare,   group: 'System' },
  { href: '/studio/documents',      label: 'Documents',      icon: FileText,        group: 'System' },
  { href: '/studio/api-keys',       label: 'API Keys',       icon: KeyRound,        group: 'System' },
  { href: '/studio/settings',       label: 'Settings',       icon: Settings,        group: 'System' },
]

const MIN_WIDTH  = 72
const MAX_WIDTH  = 380
const COMPACT_WIDTH = 132

/* Design tokens aligned with cockpit --ck-* palette */
const SB = {
  bg:      '#07090d',
  surface: '#0e1118',
  line:    'rgba(255,255,255,.07)',
  line2:   'rgba(255,255,255,.12)',
  text:    '#e7eaf0',
  muted:   '#8a93a6',
  muted2:  '#5b6478',
  accent:  '#ff6a3d',
}

export function StudioSidebar() {
  const pathname = usePathname()
  const router   = useRouter()
  const [width, setWidth]       = useState(264)
  const [dragging, setDragging] = useState(false)
  const [userEmail, setUserEmail] = useState<string>('Kenomi Operator')

  useEffect(() => {
    const stored = window.localStorage.getItem('kenomi-sidebar-width')
    if (stored) setWidth(Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, Number(stored))))
  }, [])

  useEffect(() => {
    const supabase = createSupabaseBrowser()
    supabase.auth.getUser().then(({ data }) => {
      if (data.user?.email) setUserEmail(data.user.email)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      if (session?.user?.email) setUserEmail(session.user.email)
    })
    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!dragging) return
    function onPointerMove(e: PointerEvent) {
      const next = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, e.clientX))
      setWidth(next)
      window.localStorage.setItem('kenomi-sidebar-width', String(next))
    }
    function onPointerUp() {
      setDragging(false)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    document.body.style.cursor    = 'col-resize'
    document.body.style.userSelect = 'none'
    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
    return () => {
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
  }, [dragging])

  const compact = width < COMPACT_WIDTH

  const grouped = nav.reduce<Record<string, typeof nav>>((acc, item) => {
    acc[item.group] = [...(acc[item.group] || []), item]
    return acc
  }, {})

  async function signOut() {
    const supabase = createSupabaseBrowser()
    await supabase.auth.signOut()
    router.replace('/login')
  }

  return (
    <aside
      style={{
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        width,
        flexShrink: 0,
        background: SB.bg,
        borderRight: `1px solid ${SB.line}`,
      }}
    >
      {/* Logo */}
      <div style={{
        padding: compact ? '14px 8px' : '14px 16px',
        display: 'flex', alignItems: 'center', justifyContent: compact ? 'center' : 'flex-start',
        gap: 10,
        borderBottom: `1px solid ${SB.line}`,
      }}>
        <div style={{
          width: 32, height: 32, borderRadius: 8, flexShrink: 0,
          background: SB.accent, display: 'grid', placeItems: 'center',
        }}>
          <div style={{
            width: 18, height: 18, borderRadius: 4,
            background: SB.bg,
            display: 'grid', placeItems: 'center',
            fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 12, color: SB.text,
          }}>K</div>
        </div>
        {!compact && (
          <div style={{ minWidth: 0 }}>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 15, letterSpacing: '-.01em', color: SB.text, textTransform: 'uppercase', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              Kenomi
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: SB.muted, letterSpacing: '.14em', textTransform: 'uppercase', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              Venture Studio
            </div>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, overflowY: 'auto', padding: compact ? '12px 6px' : '12px 10px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        {Object.entries(grouped).map(([group, items]) => (
          <div key={group}>
            {!compact && (
              <div style={{
                fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '.18em', textTransform: 'uppercase',
                color: SB.muted2, padding: '0 8px', marginBottom: 4,
              }}>{group}</div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {items.map(item => {
                const Icon = item.icon
                const active = pathname === item.href || (item.href !== '/studio' && pathname.startsWith(item.href))
                return (
                  <Link key={item.href} href={item.href} title={item.label} style={{
                    display: 'flex', alignItems: 'center',
                    justifyContent: compact ? 'center' : 'flex-start',
                    gap: 10,
                    padding: compact ? '10px 0' : '7px 10px',
                    borderRadius: 7,
                    textDecoration: 'none',
                    color: active ? SB.text : SB.muted,
                    background: active ? 'rgba(255,255,255,.06)' : 'transparent',
                    fontFamily: 'var(--font-sans)', fontSize: 13, fontWeight: active ? 600 : 400,
                    transition: 'color .1s, background .1s',
                  }}>
                    <Icon size={15} style={{ flexShrink: 0, color: active ? SB.accent : 'inherit' }} />
                    {!compact && <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.label}</span>}
                  </Link>
                )
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* User footer */}
      <div style={{
        borderTop: `1px solid ${SB.line}`,
        padding: compact ? '10px 6px' : '10px 10px',
      }}>
        <div style={{
          display: 'flex', alignItems: 'center',
          flexDirection: compact ? 'column' : 'row',
          gap: compact ? 6 : 8,
          padding: compact ? '8px 4px' : '8px 10px',
          borderRadius: 8,
          background: 'rgba(255,255,255,.03)',
          border: `1px solid ${SB.line}`,
        }}>
          <div style={{
            width: 30, height: 30, borderRadius: '50%',
            background: SB.accent + '30', border: `1px solid ${SB.accent}40`,
            display: 'grid', placeItems: 'center', flexShrink: 0,
            fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 13, color: SB.accent,
          }}>
            {userEmail[0]?.toUpperCase() || 'K'}
          </div>
          {!compact && (
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: SB.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{userEmail}</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: SB.muted2, letterSpacing: '.08em' }}>Venture Studio</div>
            </div>
          )}
          <button onClick={signOut} title="Sign out" style={{
            background: 'transparent', border: 'none', cursor: 'pointer',
            color: SB.muted2, padding: 4, borderRadius: 4, display: 'grid', placeItems: 'center',
          }}>
            <LogOut size={14} />
          </button>
        </div>
      </div>

      {/* Resize handle */}
      <button
        type="button"
        aria-label="Resize sidebar"
        onPointerDown={e => { e.preventDefault(); setDragging(true) }}
        onDoubleClick={() => {
          const next = compact ? 264 : MIN_WIDTH
          setWidth(next)
          window.localStorage.setItem('kenomi-sidebar-width', String(next))
        }}
        style={{
          position: 'absolute', right: -4, top: 0, height: '100%', width: 8,
          cursor: 'col-resize', background: 'transparent', border: 'none', padding: 0,
        }}
      >
        <span style={{
          display: 'block', height: '100%', width: 1, margin: '0 auto',
          background: SB.line2,
          transition: 'background .1s',
        }} />
      </button>

      {!compact && (
        <div style={{ position: 'absolute', top: 16, right: 12, color: SB.muted2, opacity: 0.4 }}>
          <Network size={14} />
        </div>
      )}
    </aside>
  )
}
