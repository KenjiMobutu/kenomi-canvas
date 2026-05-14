'use client'
import { useEffect, useState } from 'react'
import { createSupabaseBrowser } from '@/lib/supabase-browser'
import { useAuth } from '@/lib/auth-context'
import { toast } from 'sonner'
import { CkShell } from '@/components/CkShell'
import {
  surface, surface2, line, line2, text, muted, muted2,
  accent, emerald, amber, rose,
} from '@/lib/ck-vars'

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
  { name: 'Proxmox VE',          status: 'Online',    detail: 'Node cluster ready for local workloads',       endpoint: 'https://proxmox.local',          role: 'Compute layer for local AI jobs, containers and test environments.',        next_action: 'Connect proxmox-ssh MCP and expose health metrics.' },
  { name: 'Coolify',             status: 'Online',    detail: 'Docker deployments and env management',         endpoint: 'https://coolify.local',           role: 'Deployment surface for landing pages, APIs and venture experiments.',       next_action: 'Add project templates for validation apps and waitlists.' },
  { name: 'Nginx Proxy Manager', status: 'Healthy',   detail: 'Domains, SSL and reverse proxy',               endpoint: 'https://npm.local',               role: 'Routes public domains to internal services with SSL automation.',           next_action: 'Map venture subdomains and automate certificate checks.' },
  { name: 'Uptime Kuma',         status: 'Watching',  detail: 'Availability checks for studio services',       endpoint: 'https://uptime.local',            role: 'Monitors availability for core infrastructure and launched ventures.',       next_action: 'Create monitors for each paid validation landing page.' },
  { name: 'Vaultwarden',         status: 'Ready',     detail: 'Secrets and credential vault',                 endpoint: 'https://vault.local',             role: 'Stores API keys, Stripe secrets, OAuth credentials and admin access.',      next_action: 'Separate production, staging and experiment credentials.' },
  { name: 'Supabase',            status: 'Connected', detail: 'Auth, PostgreSQL and storage backend',          endpoint: 'https://supabase.kenomi.eu',      role: 'Primary backend for auth, venture records, documents and analytics.',      next_action: 'Create venture, KPI and automation event tables with RLS.' },
]

function statusColor(s: string) {
  if (['Online', 'Connected'].includes(s)) return emerald
  if (['Healthy', 'Ready'].includes(s)) return '#22d3ee'
  if (s === 'Watching') return amber
  if (s === 'Draft') return muted
  return muted
}

export default function InfrastructurePage() {
  const { user } = useAuth()
  const [items, setItems] = useState<Service[]>([])
  const [openId, setOpenId] = useState<string | null>(null)
  const [form, setForm] = useState({ name: '', endpoint: '', detail: '', role: '' })

  const supabase = createSupabaseBrowser()

  async function load() {
    const { data } = await supabase.from('services').select('*').order('created_at', { ascending: true })
    const list = (data as Service[]) || []
    if (list.length === 0 && user) {
      await supabase.from('services').insert(seedServices.map(s => ({ ...s, user_id: user.id })))
      return load()
    }
    setItems(list)
    if (!openId && list.length > 0) setOpenId(list[0].id)
  }
  useEffect(() => { if (user) load() }, [user]) // eslint-disable-line react-hooks/exhaustive-deps

  async function createService(e: React.FormEvent) {
    e.preventDefault()
    if (!user || !form.name.trim()) return
    const { error } = await supabase.from('services').insert({
      user_id: user.id, name: form.name.trim(), status: 'Draft',
      detail: form.detail.trim() || 'New service awaiting configuration',
      endpoint: form.endpoint.trim() || 'https://service.local',
      role: form.role.trim() || 'Define how this service supports the Venture Studio.',
      next_action: 'Connect health checks, credentials and automation hooks.',
    })
    if (error) return toast.error(error.message)
    setForm({ name: '', endpoint: '', detail: '', role: '' })
    load()
  }

  const open = items.find(s => s.id === openId)

  const onlineCount = items.filter(s => ['Online', 'Connected', 'Healthy', 'Ready', 'Watching'].includes(s.status)).length

  const headerActions = (
    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: muted, letterSpacing: '.1em' }}>
      {onlineCount} / {items.length} services actifs
    </span>
  )

  return (
    <CkShell breadcrumb="Studio / Infrastructure" title="Infrastructure Control" subtitle="Proxmox · Coolify · Docker · Supabase" actions={headerActions}>

      {/* Summary tiles */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
        {([['Compute', 'Proxmox', '🖥'], ['Deploy', 'Coolify', '🐳'], ['Backend', 'Supabase', '💾'], ['Security', 'Vaultwarden', '🔐']] as [string, string, string][]).map(([label, value, icon]) => (
          <div key={label} style={{ background: surface, border: `1px solid ${line}`, borderRadius: 12, padding: '16px 20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '.14em', textTransform: 'uppercase', color: muted }}>{label}</div>
              <span style={{ fontSize: 18 }}>{icon}</span>
            </div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 800, color: text, letterSpacing: '-.01em' }}>{value}</div>
          </div>
        ))}
      </div>

      {/* Add form */}
      <form onSubmit={createService} style={{
        display: 'grid', gridTemplateColumns: '1fr 1fr 1.3fr 1.3fr auto',
        gap: 8, marginBottom: 24,
        background: surface, border: `1px solid ${line}`, borderRadius: 12, padding: 16,
      }}>
        {(['name', 'endpoint', 'detail', 'role'] as const).map((field, i) => (
          <input key={field} className="ck-input" value={form[field]} onChange={e => setForm(c => ({ ...c, [field]: e.target.value }))}
            placeholder={['Service', 'Endpoint', 'Résumé', 'Rôle'][i]} />
        ))}
        <button style={{ padding: '8px 20px', borderRadius: 8, background: accent, color: '#0b0d12', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 12, whiteSpace: 'nowrap' }}>
          + Ajouter
        </button>
      </form>

      {/* Two-column layout */}
      <div style={{ display: 'grid', gridTemplateColumns: '380px 1fr', gap: 16 }}>
        {/* Services list */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {items.map(svc => {
            const isOpen = openId === svc.id
            const sc = statusColor(svc.status)
            return (
              <button key={svc.id} type="button" onClick={() => setOpenId(isOpen ? null : svc.id)} style={{
                textAlign: 'left', padding: '14px 16px', borderRadius: 10,
                background: surface, cursor: 'pointer', transition: 'border-color .15s',
                border: `1px solid ${isOpen ? sc : line}`,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: text }}>{svc.name}</div>
                  <span style={{
                    padding: '2px 8px', borderRadius: 4,
                    background: sc + '18', color: sc,
                    fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '.14em', fontWeight: 700,
                    border: `1px solid ${sc}40`, flexShrink: 0,
                  }}>{svc.status}</span>
                </div>
                <div style={{ fontSize: 12, color: muted2, marginTop: 4, lineHeight: 1.45 }}>{svc.detail}</div>
              </button>
            )
          })}
        </div>

        {/* Detail panel */}
        <div style={{ background: surface, border: `1px solid ${line}`, borderRadius: 12, padding: 24, minHeight: 320 }}>
          {open ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                <div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '.18em', textTransform: 'uppercase', color: muted }}>Service details</div>
                  <h3 style={{ margin: '6px 0 0', fontFamily: 'var(--font-display)', fontSize: 26, fontWeight: 800, letterSpacing: '-.02em', color: text }}>{open.name}</h3>
                </div>
                <span style={{
                  padding: '3px 10px', borderRadius: 4, flexShrink: 0,
                  background: statusColor(open.status) + '18', color: statusColor(open.status),
                  fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '.14em', fontWeight: 700,
                  border: `1px solid ${statusColor(open.status)}40`,
                }}>{open.status}</span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div style={{ padding: '12px 14px', borderRadius: 8, background: surface2, border: `1px solid ${line}` }}>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '.14em', textTransform: 'uppercase', color: muted, marginBottom: 6 }}>Endpoint</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: text, wordBreak: 'break-all' }}>{open.endpoint}</div>
                </div>
                <div style={{ padding: '12px 14px', borderRadius: 8, background: surface2, border: `1px solid ${line}` }}>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '.14em', textTransform: 'uppercase', color: muted, marginBottom: 6 }}>Rôle</div>
                  <div style={{ fontSize: 12, color: muted, lineHeight: 1.5 }}>{open.role}</div>
                </div>
              </div>

              <div style={{ padding: '12px 14px', borderRadius: 8, background: surface2, border: `1px solid ${line}` }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '.14em', textTransform: 'uppercase', color: muted, marginBottom: 6 }}>Next action</div>
                <div style={{ fontSize: 13, color: text, lineHeight: 1.5 }}>{open.next_action}</div>
              </div>

              <a href={open.endpoint} target="_blank" rel="noreferrer" style={{
                alignSelf: 'flex-start',
                display: 'inline-flex', alignItems: 'center', gap: 8,
                padding: '10px 18px', borderRadius: 8,
                background: accent, color: '#0b0d12',
                fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 13,
                textDecoration: 'none',
              }}>Ouvrir service ↗</a>
            </div>
          ) : (
            <div style={{ height: '100%', minHeight: 260, display: 'grid', placeItems: 'center' }}>
              <p style={{ fontSize: 13, color: muted2, textAlign: 'center' }}>Cliquez sur un service.</p>
            </div>
          )}
        </div>
      </div>
    </CkShell>
  )
}
