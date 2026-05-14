'use client'
import { useEffect, useState } from 'react'
import { createSupabaseBrowser } from '@/lib/supabase-browser'
import { useAuth } from '@/lib/auth-context'
import { toast } from 'sonner'
import { CkShell } from '@/components/CkShell'
import {
  surface, surface2, line, line2, text, muted, muted2,
  accent, emerald, amber,
} from '@/lib/ck-vars'

interface Campaign {
  id: string
  name: string
  draft_count: number
  description: string
}

const seedCampaigns = [
  { name: 'LinkedIn founder posts', draft_count: 12, description: 'Solo CFO, Kenomi Forms, validation threads' },
  { name: 'TikTok test scripts',    draft_count: 8,  description: 'Pain-point hooks for micro-SaaS niches'    },
  { name: 'SEO briefs',             draft_count: 21, description: 'Comparison pages, alternatives, JTBD pages' },
  { name: 'Newsletter queue',       draft_count: 4,  description: 'Build-in-public and market validation digest' },
]

const CHANNEL_ICONS: Record<string, string> = {
  linkedin: '💼', tiktok: '🎵', seo: '🔍', newsletter: '✉️', default: '📣',
}

function channelIcon(name: string) {
  const n = name.toLowerCase()
  if (n.includes('linkedin')) return CHANNEL_ICONS.linkedin
  if (n.includes('tiktok')) return CHANNEL_ICONS.tiktok
  if (n.includes('seo')) return CHANNEL_ICONS.seo
  if (n.includes('newsletter')) return CHANNEL_ICONS.newsletter
  return CHANNEL_ICONS.default
}

export default function MarketingPage() {
  const { user } = useAuth()
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [selected, setSelected] = useState<Campaign | null>(null)
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState({ name: '', description: '' })

  const supabase = createSupabaseBrowser()

  async function load() {
    const { data } = await supabase.from('campaigns').select('*').order('created_at', { ascending: true })
    const list = (data as Campaign[]) || []
    if (list.length === 0 && user) {
      await supabase.from('campaigns').insert(seedCampaigns.map(c => ({ ...c, user_id: user.id })))
      return load()
    }
    setCampaigns(list)
    setSelected(prev => prev ? (list.find(c => c.id === prev.id) ?? list[0] ?? null) : (list[0] ?? null))
  }
  useEffect(() => { if (user) load() }, [user]) // eslint-disable-line react-hooks/exhaustive-deps

  async function create(e: React.FormEvent) {
    e.preventDefault()
    if (!user || !form.name.trim()) return
    const { error } = await supabase.from('campaigns').insert({
      user_id: user.id, name: form.name.trim(),
      draft_count: 0, description: form.description.trim(),
    })
    if (error) return toast.error(error.message)
    setForm({ name: '', description: '' })
    setAdding(false)
    load()
  }

  async function generateDraft() {
    if (!selected) return
    await supabase.from('campaigns').update({ draft_count: selected.draft_count + 1 }).eq('id', selected.id)
    load()
  }

  const totalDrafts = campaigns.reduce((s, c) => s + c.draft_count, 0)

  const headerActions = (
    <button onClick={() => setAdding(v => !v)} style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: '6px 14px', borderRadius: 999,
      background: accent, color: '#0b0d12',
      border: 'none', cursor: 'pointer',
      fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 12,
    }}>+ Nouvelle campagne</button>
  )

  return (
    <CkShell breadcrumb="Studio / Marketing" title="Marketing Lab" subtitle="Posts · Ads · SEO · Newsletter" actions={headerActions}>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
        {([
          ['CTR cible', '3.8%',              '↗'],
          ['Pages SEO', '42',                '🔍'],
          ['Drafts total', String(totalDrafts), '✎'],
          ['Campagnes', String(campaigns.length), '📣'],
        ] as [string, string, string][]).map(([label, value, icon]) => (
          <div key={label} style={{ background: surface, border: `1px solid ${line}`, borderRadius: 12, padding: '16px 20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '.14em', textTransform: 'uppercase', color: muted }}>{label}</div>
              <span style={{ fontSize: 16 }}>{icon}</span>
            </div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 800, letterSpacing: '-.02em', color: text, lineHeight: 1 }}>{value}</div>
          </div>
        ))}
      </div>

      {/* Add form */}
      {adding && (
        <form onSubmit={create} style={{
          display: 'grid', gridTemplateColumns: '1fr 2fr auto',
          gap: 8, marginBottom: 16,
          background: surface, border: `1px solid ${line}`, borderRadius: 12, padding: 16,
        }}>
          <input className="ck-input" placeholder="Nom campagne" value={form.name} onChange={e => setForm(c => ({ ...c, name: e.target.value }))} />
          <input className="ck-input" placeholder="Description" value={form.description} onChange={e => setForm(c => ({ ...c, description: e.target.value }))} />
          <div style={{ display: 'flex', gap: 6 }}>
            <button style={{ padding: '8px 16px', borderRadius: 8, background: accent, color: '#0b0d12', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 12 }}>
              + Ajouter
            </button>
            <button type="button" onClick={() => setAdding(false)} style={{ padding: '8px 12px', borderRadius: 8, background: 'transparent', color: muted, border: `1px solid ${line2}`, cursor: 'pointer', fontSize: 12 }}>✕</button>
          </div>
        </form>
      )}

      {/* Master-detail */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 16 }}>
        {/* List */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {campaigns.map(c => {
            const isSelected = selected?.id === c.id
            return (
              <button key={c.id} onClick={() => setSelected(c)} style={{
                textAlign: 'left', display: 'flex', alignItems: 'center', gap: 14,
                padding: '14px 16px', borderRadius: 10,
                background: surface,
                border: `1px solid ${isSelected ? accent : line}`,
                cursor: 'pointer', transition: 'border-color .15s',
              }}>
                {/* Channel icon */}
                <div style={{
                  width: 40, height: 40, borderRadius: 10, flexShrink: 0,
                  background: '#e879f918',
                  display: 'grid', placeItems: 'center', fontSize: 20,
                }}>{channelIcon(c.name)}</div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: text, marginBottom: 3 }}>{c.name}</div>
                  <div style={{ fontSize: 12, color: muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.description}</div>
                </div>

                <span style={{
                  padding: '3px 10px', borderRadius: 4,
                  background: '#e879f918', color: '#e879f9',
                  fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '.14em', fontWeight: 700,
                  border: '1px solid #e879f940', flexShrink: 0,
                }}>{c.draft_count} drafts</span>
              </button>
            )
          })}
          {campaigns.length === 0 && (
            <p style={{ textAlign: 'center', padding: '48px 0', color: muted2, fontSize: 13 }}>
              Aucune campagne. Créez votre première.
            </p>
          )}
        </div>

        {/* Aside */}
        <aside style={{ background: surface, border: `1px solid ${line}`, borderRadius: 12, padding: 20, height: 'fit-content' }}>
          {selected ? (
            <>
              <div style={{ position: 'relative', paddingLeft: 12, marginBottom: 16 }}>
                <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, borderRadius: 2, background: '#e879f9' }} />
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '.18em', textTransform: 'uppercase', color: muted }}>Campaign brief</div>
                <h3 style={{ margin: '6px 0 0', fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 800, letterSpacing: '-.02em', color: text }}>{selected.name}</h3>
              </div>

              <p style={{ fontSize: 13, color: muted, lineHeight: 1.55, marginBottom: 16 }}>{selected.description}</p>

              <div style={{ padding: '14px 16px', borderRadius: 8, background: surface2, border: `1px solid ${line}`, marginBottom: 16 }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '.14em', textTransform: 'uppercase', color: muted, marginBottom: 4 }}>Drafts générés</div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 32, fontWeight: 800, color: text, lineHeight: 1 }}>{selected.draft_count}</div>
              </div>

              <button onClick={generateDraft} style={{
                width: '100%', padding: '10px 16px', borderRadius: 8,
                background: accent, color: '#0b0d12', border: 'none', cursor: 'pointer',
                fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 13,
              }}>✎ Générer un draft</button>
            </>
          ) : (
            <div style={{ minHeight: 200, display: 'grid', placeItems: 'center' }}>
              <p style={{ fontSize: 13, color: muted2, textAlign: 'center' }}>Sélectionnez une campagne.</p>
            </div>
          )}
        </aside>
      </div>
    </CkShell>
  )
}
