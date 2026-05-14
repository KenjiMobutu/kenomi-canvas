'use client'

import Link from 'next/link'
import { ChevronDown, Database, ExternalLink, HardDrive, Plus, Server, ShieldCheck } from 'lucide-react'
import { useEffect, useState } from 'react'
import { createSupabaseBrowser } from '@/lib/supabase-browser'
import { useAuth } from '@/lib/auth-context'
import { toast } from 'sonner'

interface Service {
  id: string
  name: string
  status: string
  detail: string
  endpoint: string
  role: string
  next_action: string
}

const seedServices = [
  { name: 'Proxmox VE', status: 'Online', detail: 'Node cluster ready for local workloads', endpoint: 'https://proxmox.local', role: 'Compute layer for local AI jobs, containers and test environments.', next_action: 'Connect proxmox-ssh MCP and expose health metrics.' },
  { name: 'Coolify', status: 'Online', detail: 'Docker deployments and env management', endpoint: 'https://coolify.local', role: 'Deployment surface for landing pages, APIs and venture experiments.', next_action: 'Add project templates for validation apps and waitlists.' },
  { name: 'Nginx Proxy Manager', status: 'Healthy', detail: 'Domains, SSL and reverse proxy', endpoint: 'https://npm.local', role: 'Routes public domains to internal services with SSL automation.', next_action: 'Map venture subdomains and automate certificate checks.' },
  { name: 'Uptime Kuma', status: 'Watching', detail: 'Availability checks for studio services', endpoint: 'https://uptime.local', role: 'Monitors availability for core infrastructure and launched ventures.', next_action: 'Create monitors for each paid validation landing page.' },
  { name: 'Vaultwarden', status: 'Ready', detail: 'Secrets and credential vault', endpoint: 'https://vault.local', role: 'Stores API keys, Stripe secrets, OAuth credentials and admin access.', next_action: 'Separate production, staging and experiment credentials.' },
  { name: 'Supabase', status: 'Connected', detail: 'Auth, PostgreSQL and storage backend', endpoint: 'https://supabase.kenomi.eu', role: 'Primary backend for auth, venture records, documents and analytics.', next_action: 'Create venture, KPI and automation event tables with RLS.' },
]

export default function InfrastructurePage() {
  const { user } = useAuth()
  const [items, setItems] = useState<Service[]>([])
  const [openId, setOpenId] = useState<string | null>(null)
  const [form, setForm] = useState({ name: '', endpoint: '', detail: '', role: '' })

  async function load() {
    const supabase = createSupabaseBrowser()
    const { data } = await supabase.from('services').select('*').order('created_at', { ascending: true })
    const list = (data as Service[]) || []
    if (list.length === 0 && user) {
      await supabase.from('services').insert(seedServices.map((s) => ({ ...s, user_id: user.id })))
      return load()
    }
    setItems(list)
    if (!openId && list.length > 0) setOpenId(list[0].id)
  }
  useEffect(() => { if (user) load() }, [user])

  async function createService(e: React.FormEvent) {
    e.preventDefault()
    if (!user || !form.name.trim()) return
    const supabase = createSupabaseBrowser()
    const { error } = await supabase.from('services').insert({
      user_id: user.id,
      name: form.name.trim(),
      status: 'Draft',
      detail: form.detail.trim() || 'New service awaiting configuration',
      endpoint: form.endpoint.trim() || 'https://service.local',
      role: form.role.trim() || 'Define how this service supports the Venture Studio.',
      next_action: 'Connect health checks, credentials and automation hooks.',
    })
    if (error) return toast.error(error.message)
    setForm({ name: '', endpoint: '', detail: '', role: '' })
    load()
  }

  const open = items.find((s) => s.id === openId)

  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="h-16 border-b border-border flex items-center justify-between px-8 sticky top-0 bg-background/80 backdrop-blur-md z-10">
        <h1 className="text-sm font-semibold text-muted-foreground">
          Studio / <span className="text-foreground">Infrastructure</span>
        </h1>
        <Link href="/studio" className="text-sm text-muted-foreground hover:text-foreground">Retour cockpit</Link>
      </header>

      <section className="p-8 max-w-6xl mx-auto space-y-6">
        <div>
          <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground">Proxmox · Coolify · Docker · Supabase</p>
          <h2 className="text-4xl font-extrabold tracking-tighter mt-2">Infrastructure Control</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {([['Compute', 'Proxmox', Server], ['Deploy', 'Coolify', HardDrive], ['Backend', 'Supabase', Database], ['Security', 'Vaultwarden', ShieldCheck]] as [string, string, React.ElementType][]).map(([label, value, Icon]) => (
            <div key={label} className="bg-surface ring-1 ring-border rounded-lg p-5">
              <Icon className="size-5 text-accent mb-4" />
              <p className="text-xs text-muted-foreground uppercase tracking-wider">{label}</p>
              <p className="text-2xl font-extrabold tracking-tighter mt-2">{value}</p>
            </div>
          ))}
        </div>

        <form onSubmit={createService} className="grid grid-cols-1 lg:grid-cols-[1fr_1fr_1.3fr_1.3fr_auto] gap-2 bg-surface ring-1 ring-border rounded-lg p-4">
          {(['name', 'endpoint', 'detail', 'role'] as const).map((field, i) => (
            <input key={field} value={form[field]} onChange={(e) => setForm((c) => ({ ...c, [field]: e.target.value }))}
              placeholder={['Service', 'Endpoint', 'Résumé', 'Rôle'][i]}
              className="px-3 py-2 bg-input rounded-md text-sm ring-1 ring-border outline-none focus:ring-accent" />
          ))}
          <button className="px-4 py-2 bg-foreground text-background text-xs font-bold rounded-md flex items-center justify-center gap-2">
            <Plus className="size-4" /> Ajouter
          </button>
        </form>

        <div className="grid grid-cols-1 xl:grid-cols-[420px_1fr] gap-4">
          <div className="space-y-2">
            {items.map((service) => {
              const active = openId === service.id
              return (
                <button key={service.id} type="button" onClick={() => setOpenId(active ? null : service.id)}
                  className={`w-full text-left bg-surface ring-1 rounded-lg p-5 transition-colors ${active ? 'ring-accent/60' : 'ring-border hover:ring-accent/40 hover:bg-white/[0.03]'}`}>
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-semibold text-sm">{service.name}</p>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] px-2 py-1 rounded-full bg-emerald/10 text-emerald ring-1 ring-emerald/20 font-mono">{service.status}</span>
                      <ChevronDown className={`size-4 text-muted-foreground transition-transform ${active ? 'rotate-180' : ''}`} />
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">{service.detail}</p>
                </button>
              )
            })}
          </div>

          <div className="bg-surface ring-1 ring-border rounded-lg p-6 min-h-[320px]">
            {open ? (
              <div className="space-y-6">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground">Service details</p>
                    <h3 className="text-3xl font-extrabold tracking-tighter mt-2">{open.name}</h3>
                  </div>
                  <span className="text-[10px] px-2 py-1 rounded-full bg-emerald/10 text-emerald ring-1 ring-emerald/20 font-mono">{open.status}</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="rounded-lg bg-background/40 ring-1 ring-border p-4">
                    <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Endpoint</p>
                    <p className="text-sm font-mono mt-2 break-all">{open.endpoint}</p>
                  </div>
                  <div className="rounded-lg bg-background/40 ring-1 ring-border p-4">
                    <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Role</p>
                    <p className="text-sm text-muted-foreground mt-2">{open.role}</p>
                  </div>
                </div>
                <div className="rounded-lg bg-background/40 ring-1 ring-border p-4">
                  <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Next action</p>
                  <p className="text-sm text-muted-foreground mt-2">{open.next_action}</p>
                </div>
                <a href={open.endpoint} target="_blank" rel="noreferrer"
                  className="inline-flex items-center gap-2 px-4 py-2 bg-foreground text-background text-xs font-bold rounded-md">
                  Ouvrir service <ExternalLink className="size-4" />
                </a>
              </div>
            ) : (
              <div className="h-full min-h-[260px] grid place-items-center text-center text-muted-foreground">
                <p className="text-sm">Cliquez sur un service pour ouvrir ses détails.</p>
              </div>
            )}
          </div>
        </div>
      </section>
    </main>
  )
}
