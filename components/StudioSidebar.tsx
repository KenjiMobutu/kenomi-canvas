'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  BarChart3, Bot, FileText, GitBranch, KeyRound,
  LayoutDashboard, LogOut, Megaphone, MessageSquare,
  Network, Server, Settings, Workflow,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { createSupabaseBrowser } from '@/lib/supabase-browser'

const nav = [
  { href: '/studio', label: 'Cockpit', icon: LayoutDashboard, group: 'Studio' },
  { href: '/studio/ventures', label: 'Ventures', icon: GitBranch, group: 'Studio' },
  { href: '/studio/agents', label: 'Agents', icon: Bot, group: 'Studio' },
  { href: '/studio/marketing', label: 'Marketing', icon: Megaphone, group: 'Studio' },
  { href: '/studio/analytics', label: 'Analytics', icon: BarChart3, group: 'Studio' },
  { href: '/studio/automations', label: 'Automations', icon: Workflow, group: 'Studio' },
  { href: '/studio/infrastructure', label: 'Infrastructure', icon: Server, group: 'Studio' },
  { href: '/studio/chat', label: 'Command Chat', icon: MessageSquare, group: 'System' },
  { href: '/studio/documents', label: 'Documents', icon: FileText, group: 'System' },
  { href: '/studio/api-keys', label: 'API Keys', icon: KeyRound, group: 'System' },
  { href: '/studio/settings', label: 'Settings', icon: Settings, group: 'System' },
]

const MIN_WIDTH = 72
const MAX_WIDTH = 380
const COMPACT_WIDTH = 132

export function StudioSidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const [width, setWidth] = useState(264)
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
    document.body.style.cursor = 'col-resize'
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
      className="relative flex h-screen shrink-0 border-r border-border bg-surface flex-col"
      style={{ width }}
    >
      <div className={`p-4 flex items-center ${compact ? 'justify-center' : 'gap-3'}`}>
        <div className="size-8 rounded brand-logo" />
        {!compact && (
          <div className="min-w-0">
            <span className="block font-extrabold tracking-tighter text-xl uppercase truncate">Kenomi</span>
            <span className="block text-[10px] text-muted-foreground font-mono uppercase tracking-wider truncate">Venture Studio</span>
          </div>
        )}
      </div>

      <nav className={`flex-1 pb-4 overflow-y-auto ${compact ? 'px-2 space-y-3' : 'px-4 space-y-5'}`}>
        {Object.entries(grouped).map(([group, items]) => (
          <div key={group}>
            {!compact && (
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest px-2 mb-2">{group}</p>
            )}
            <div className="space-y-1">
              {items.map((item) => {
                const Icon = item.icon
                const active = pathname === item.href || (item.href !== '/studio' && pathname.startsWith(item.href))
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    title={item.label}
                    className={`flex items-center rounded-md text-sm transition-colors ${
                      compact ? 'justify-center px-0 py-3' : 'gap-3 px-3 py-2'
                    } ${
                      active
                        ? 'bg-white/5 text-foreground font-medium'
                        : 'text-muted-foreground hover:text-foreground hover:bg-white/5'
                    }`}
                  >
                    <Icon className="size-4 shrink-0" />
                    {!compact && <span className="truncate">{item.label}</span>}
                  </Link>
                )
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className={`border-t border-border ${compact ? 'p-2' : 'p-4'}`}>
        <div className={`flex items-center rounded-lg bg-background/40 ring-1 ring-border ${compact ? 'flex-col gap-2 p-2' : 'gap-3 p-3'}`}>
          <div className="size-9 rounded-full bg-secondary ring-1 ring-white/10 grid place-items-center text-xs font-bold shrink-0">
            {userEmail[0]?.toUpperCase() || 'K'}
          </div>
          {!compact && (
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold truncate">{userEmail}</p>
              <p className="text-[10px] text-muted-foreground truncate">Venture Studio</p>
            </div>
          )}
          <button onClick={signOut} className="text-muted-foreground hover:text-foreground" title="Sign out">
            <LogOut className="size-4" />
          </button>
        </div>
      </div>

      <button
        type="button"
        aria-label="Resize sidebar"
        onPointerDown={(e) => { e.preventDefault(); setDragging(true) }}
        onDoubleClick={() => {
          const next = compact ? 264 : MIN_WIDTH
          setWidth(next)
          window.localStorage.setItem('kenomi-sidebar-width', String(next))
        }}
        className="absolute right-[-4px] top-0 h-full w-2 cursor-col-resize group"
      >
        <span className="block h-full w-px mx-auto bg-border group-hover:bg-accent transition-colors" />
      </button>

      {!compact && (
        <div className="absolute top-6 right-3 text-muted-foreground/40">
          <Network className="size-4" />
        </div>
      )}
    </aside>
  )
}
