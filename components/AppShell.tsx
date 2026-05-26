'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'
import { useEffect } from 'react'
import {
  LayoutDashboard,
  MessageSquare,
  Bot,
  Workflow,
  FileText,
  Target,
  KeyRound,
  Settings,
  LogOut,
} from 'lucide-react'

const nav = [
  {
    group: 'Studio',
    items: [
      { to: '/studio', label: 'Cockpit', icon: LayoutDashboard },
      { to: '/studio/agents', label: 'Agents', icon: Bot },
      { to: '/studio/prospects', label: 'Prospects', icon: Target },
      { to: '/studio/automations', label: 'Automations', icon: Workflow },
      { to: '/studio/chat', label: 'Command Chat', icon: MessageSquare },
    ],
  },
  {
    group: 'System',
    items: [
      { to: '/studio/documents', label: 'Knowledge Base', icon: FileText },
      { to: '/studio/api-keys', label: 'API Keys', icon: KeyRound },
      { to: '/studio/settings', label: 'Settings', icon: Settings },
    ],
  },
]

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, loading, signOut } = useAuth()
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    if (!loading && !user) router.push('/login')
  }, [loading, user, router])

  if (loading || !user) {
    return (
      <div className="flex h-screen items-center justify-center text-muted-foreground">
        Chargement…
      </div>
    )
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <aside className="w-64 border-r border-border bg-surface flex flex-col shrink-0">
        <div className="p-6 flex items-center gap-3">
          <div className="size-8 rounded brand-logo" />
          <span className="font-extrabold tracking-tighter text-xl uppercase">Kenomi</span>
        </div>

        <nav className="flex-1 px-4 space-y-1 overflow-y-auto">
          {nav.map((g) => (
            <div key={g.group}>
              <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest px-2 mb-2 mt-4">
                {g.group}
              </div>
              {g.items.map((it) => {
                const active =
                  pathname === it.to || (it.to !== '/studio' && pathname.startsWith(it.to))
                const Icon = it.icon
                return (
                  <Link
                    key={it.to}
                    href={it.to}
                    className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${
                      active
                        ? 'bg-white/5 text-foreground font-medium'
                        : 'text-muted-foreground hover:text-foreground hover:bg-white/5'
                    }`}
                  >
                    <Icon className="size-4" />
                    {it.label}
                  </Link>
                )
              })}
            </div>
          ))}
        </nav>

        <div className="p-4 border-t border-border">
          <div className="flex items-center gap-3 p-2">
            <div className="size-8 rounded-full bg-secondary ring-1 ring-white/10 grid place-items-center text-xs font-bold">
              {user.email?.[0]?.toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold truncate">{user.email}</p>
              <p className="text-[10px] text-muted-foreground truncate">Venture Studio</p>
            </div>
            <button
              onClick={() => signOut().then(() => router.push('/login'))}
              className="text-muted-foreground hover:text-foreground"
              title="Sign out"
            >
              <LogOut className="size-4" />
            </button>
          </div>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto bg-background">{children}</main>
    </div>
  )
}
