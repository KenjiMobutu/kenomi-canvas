'use client'
import { useEffect, useState } from 'react'
import { createSupabaseBrowser } from '@/lib/supabase-browser'
import { useAuth } from '@/lib/auth-context'
import { toast } from 'sonner'
import { CkShell } from '@/components/CkShell'
import {
  bg, surface, surface2, line, line2, text, muted, muted2,
  accent, emerald, amber, rose,
} from '@/lib/ck-vars'

interface Auto {
  id: string
  name: string
  trigger_type: string
  webhook_url: string | null
  is_enabled: boolean
  run_count: number
  last_run_at: string | null
}

function triggerColor(t: string) {
  if (t === 'webhook') return '#22d3ee'
  if (t === 'schedule') return '#a78bfa'
  return muted
}

export default function AutomationsPage() {
  const { user } = useAuth()
  const [items, setItems] = useState<Auto[]>([])
  const [selected, setSelected] = useState<Auto | null>(null)
  const [lastRunMsg, setLastRunMsg] = useState('Aucun run cette session')
  const [name, setName] = useState('')
  const [webhook, setWebhook] = useState('')
  const [trigger, setTrigger] = useState('manual')

  const supabase = createSupabaseBrowser()

  async function load() {
    const { data } = await supabase.from('automations').select('*').order('created_at', { ascending: false })
    const list = (data as Auto[]) || []
    setItems(list)
    setSelected(prev => prev ? (list.find(a => a.id === prev.id) ?? list[0] ?? null) : (list[0] ?? null))
  }
  useEffect(() => { if (user) load() }, [user]) // eslint-disable-line react-hooks/exhaustive-deps

  async function create() {
    if (!user || !name) return
    const { error } = await supabase.from('automations').insert({
      user_id: user.id, name, webhook_url: webhook || null, trigger_type: trigger,
    })
    if (error) return toast.error(error.message)
    setName(''); setWebhook('')
    load()
  }

  async function toggle(a: Auto) {
    await supabase.from('automations').update({ is_enabled: !a.is_enabled }).eq('id', a.id)
    load()
  }

  async function run(a: Auto) {
    if (!a.webhook_url) return toast.error('Pas de webhook configuré')
    try {
      await fetch(a.webhook_url, {
        method: 'POST', mode: 'no-cors',
        body: JSON.stringify({ triggered_at: new Date().toISOString() }),
      })
      await supabase.from('automations').update({
        last_run_at: new Date().toISOString(), run_count: a.run_count + 1,
      }).eq('id', a.id)
      setLastRunMsg(`${a.name} déclenché à l'instant`)
      toast.success('Webhook déclenché')
      load()
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  const headerActions = (
    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: muted, letterSpacing: '.1em' }}>
      {items.filter(i => i.is_enabled).length} / {items.length} actifs
    </span>
  )

  return (
    <CkShell breadcrumb="Studio / Automations" title="Automation Center" subtitle="n8n · MCP · Supabase · Webhooks" actions={headerActions}>

      {/* Add form */}
      <div style={{
        display: 'grid', gridTemplateColumns: '1fr .6fr 1.2fr auto',
        gap: 8, marginBottom: 24,
        background: surface, border: `1px solid ${line}`, borderRadius: 12, padding: 16,
      }}>
        <input className="ck-input" placeholder="Nom workflow" value={name} onChange={e => setName(e.target.value)} />
        <select className="ck-select" value={trigger} onChange={e => setTrigger(e.target.value)}>
          <option value="manual">Manuel</option>
          <option value="schedule">Schedule</option>
          <option value="webhook">Webhook</option>
        </select>
        <input className="ck-input" placeholder="Webhook n8n, MCP…" value={webhook} onChange={e => setWebhook(e.target.value)} />
        <button onClick={create} style={{
          padding: '8px 20px', borderRadius: 8,
          background: accent, color: '#0b0d12', border: 'none', cursor: 'pointer',
          fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 12,
          whiteSpace: 'nowrap',
        }}>+ Créer</button>
      </div>

      {/* Master-detail */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 16 }}>
        {/* List */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {items.map(a => {
            const isSelected = selected?.id === a.id
            const tc = triggerColor(a.trigger_type)
            return (
              <button key={a.id} onClick={() => setSelected(a)} style={{
                textAlign: 'left', display: 'flex', alignItems: 'center', gap: 14,
                padding: '14px 16px', borderRadius: 10,
                background: surface,
                border: `1px solid ${isSelected ? accent : line}`,
                cursor: 'pointer', transition: 'border-color .15s',
              }}>
                {/* Icon */}
                <div style={{
                  width: 38, height: 38, borderRadius: 8, flexShrink: 0,
                  background: accent + '18',
                  display: 'grid', placeItems: 'center',
                  fontFamily: 'var(--font-display)', fontSize: 18, color: accent,
                }}>⚡</div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: text, marginBottom: 2 }}>{a.name}</div>
                  <div style={{ fontSize: 11, color: muted2, fontFamily: 'var(--font-mono)' }}>
                    {a.run_count} runs{a.last_run_at ? ` · ${new Date(a.last_run_at).toLocaleDateString('fr-FR')}` : ''}
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{
                    padding: '3px 8px', borderRadius: 4,
                    background: tc + '18', color: tc,
                    fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '.14em', fontWeight: 700,
                    border: `1px solid ${tc}40`,
                  }}>{a.trigger_type}</span>
                  <span style={{
                    padding: '3px 8px', borderRadius: 999,
                    background: a.is_enabled ? emerald + '18' : muted2 + '18',
                    color: a.is_enabled ? emerald : muted2,
                    fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '.1em', fontWeight: 700,
                  }}>{a.is_enabled ? '● ON' : '○ OFF'}</span>
                </div>
              </button>
            )
          })}
          {items.length === 0 && (
            <p style={{ textAlign: 'center', padding: '48px 0', color: muted2, fontSize: 13 }}>
              Aucun workflow. Connectez n8n, MCP ou un trigger de validation.
            </p>
          )}
        </div>

        {/* Aside */}
        <aside style={{ background: surface, border: `1px solid ${line}`, borderRadius: 12, padding: 20, height: 'fit-content' }}>
          {selected ? (
            <>
              <div style={{ position: 'relative', paddingLeft: 12, marginBottom: 16 }}>
                <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, borderRadius: 2, background: triggerColor(selected.trigger_type) }} />
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '.18em', textTransform: 'uppercase', color: muted }}>Workflow control</div>
                <h3 style={{ margin: '6px 0 0', fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 800, letterSpacing: '-.02em', color: text }}>{selected.name}</h3>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
                {([
                  ['Trigger', selected.trigger_type],
                  ['Runs', String(selected.run_count)],
                ] as [string, string][]).map(([l, v]) => (
                  <div key={l} style={{ padding: '10px 12px', borderRadius: 8, background: surface2, border: `1px solid ${line}` }}>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '.14em', textTransform: 'uppercase', color: muted }}>{l}</div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 14, fontWeight: 700, color: text, marginTop: 4 }}>{v}</div>
                  </div>
                ))}
              </div>

              <div style={{ padding: '8px 12px', borderRadius: 8, background: surface2, border: `1px solid ${line}`, marginBottom: 16 }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '.12em', color: muted2 }}>{lastRunMsg}</div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <button onClick={() => run(selected)} style={{
                  padding: '10px 12px', borderRadius: 8,
                  background: accent, color: '#0b0d12', border: 'none', cursor: 'pointer',
                  fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 12,
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                }}>▶ Run</button>
                <button onClick={() => toggle(selected)} style={{
                  padding: '10px 12px', borderRadius: 8,
                  background: selected.is_enabled ? rose + '18' : emerald + '18',
                  color: selected.is_enabled ? rose : emerald,
                  border: `1px solid ${selected.is_enabled ? rose + '40' : emerald + '40'}`,
                  cursor: 'pointer',
                  fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 12,
                }}>{selected.is_enabled ? '⏸ Pause' : '▶ Enable'}</button>
              </div>
            </>
          ) : (
            <div style={{ minHeight: 200, display: 'grid', placeItems: 'center' }}>
              <p style={{ fontSize: 13, color: muted2, textAlign: 'center' }}>Sélectionnez un workflow.</p>
            </div>
          )}
        </aside>
      </div>
    </CkShell>
  )
}
