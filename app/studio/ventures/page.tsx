'use client'
import { useEffect, useMemo, useState } from 'react'
import { createSupabaseBrowser } from '@/lib/supabase-browser'
import { useAuth } from '@/lib/auth-context'
import { toast } from 'sonner'
import { CkShell } from '@/components/CkShell'
import {
  bg, surface, surface2, line, line2, text, muted, muted2,
  accent, emerald, amber, rose,
} from '@/lib/ck-vars'

interface Venture {
  id: string
  name: string
  niche: string
  stage: string
  score: number
  mrr: string
  cac: string
  conversion: string
  next_action: string
  insight: string
}

const seedVentures = [
  { name: 'Kenomi Forms', niche: 'No-code forms for consultants', stage: 'Scale', score: 91, mrr: '€2.8k', cac: '€14', conversion: '9.8%', next_action: 'Increase paid acquisition cap', insight: 'CAC is below target and signup quality is high.' },
  { name: 'Solo CFO Copilot', niche: 'Finance assistant for solo founders', stage: 'Validation', score: 84, mrr: '€620', cac: '€21', conversion: '6.2%', next_action: 'Run pricing A/B test', insight: 'Search intent is strong but pricing confidence is not final.' },
  { name: 'Legal Intake Bot', niche: 'Client intake for small law firms', stage: 'Build', score: 68, mrr: '€310', cac: '€39', conversion: '4.1%', next_action: 'Pivot toward HR operations', insight: 'Legal CPC is high; HR ops has a cleaner wedge.' },
  { name: 'Creator CRM Lite', niche: 'Light CRM for creators', stage: 'Stop', score: 42, mrr: '€120', cac: '€52', conversion: '1.9%', next_action: 'Archive learnings', insight: 'CTR and paid conversion stayed below threshold.' },
]

const STAGES = ['All', 'Validation', 'Build', 'Scale', 'Stop']

function stageColor(stage: string) {
  if (stage === 'Scale') return emerald
  if (stage === 'Build') return accent
  if (stage === 'Validation') return 'var(--ck-cyan, #22d3ee)'
  if (stage === 'Stop') return rose
  return muted
}

function scoreColor(score: number) {
  if (score >= 80) return emerald
  if (score >= 60) return amber
  return rose
}

export default function VenturesPage() {
  const { user } = useAuth()
  const [ventures, setVentures] = useState<Venture[]>([])
  const [stage, setStage] = useState('All')
  const [selected, setSelected] = useState<Venture | null>(null)
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState({ name: '', niche: '', stage: 'Validation', score: '', mrr: '' })

  const supabase = createSupabaseBrowser()

  async function load() {
    const { data } = await supabase.from('ventures').select('*').order('score', { ascending: false })
    const list = (data as Venture[]) || []
    if (list.length === 0 && user) {
      await supabase.from('ventures').insert(seedVentures.map(v => ({ ...v, user_id: user.id })))
      return load()
    }
    setVentures(list)
    setSelected(prev => prev ? (list.find(v => v.id === prev.id) ?? list[0] ?? null) : (list[0] ?? null))
  }
  useEffect(() => { if (user) load() }, [user]) // eslint-disable-line react-hooks/exhaustive-deps

  async function create(e: React.FormEvent) {
    e.preventDefault()
    if (!user || !form.name.trim()) return
    const { error } = await supabase.from('ventures').insert({
      user_id: user.id,
      name: form.name.trim(), niche: form.niche.trim(),
      stage: form.stage, score: parseInt(form.score) || 0,
      mrr: form.mrr.trim() || '€0', cac: '€0', conversion: '0%',
      next_action: '', insight: '',
    })
    if (error) return toast.error(error.message)
    setForm({ name: '', niche: '', stage: 'Validation', score: '', mrr: '' })
    setAdding(false)
    load()
  }

  const filtered = useMemo(
    () => ventures.filter(v => stage === 'All' || v.stage === stage),
    [ventures, stage],
  )

  const totalMrrK = ventures.reduce((sum, v) => {
    const raw = parseFloat(v.mrr.replace(/[^0-9.]/g, '')) || 0
    return sum + (v.mrr.toLowerCase().includes('k') ? raw * 1000 : raw)
  }, 0)
  const avgScore = ventures.length ? Math.round(ventures.reduce((s, v) => s + v.score, 0) / ventures.length) : 0
  const activeCount = ventures.filter(v => v.stage !== 'Stop').length

  const headerActions = (
    <button onClick={() => setAdding(v => !v)} style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: '6px 14px', borderRadius: 999,
      background: accent, color: '#0b0d12',
      border: 'none', cursor: 'pointer',
      fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 12,
    }}>+ Nouvelle venture</button>
  )

  return (
    <CkShell breadcrumb="Studio / Ventures" title="Venture Pipeline" subtitle="Scoring · Stage · Décisions" actions={headerActions}>

      {/* Stage filter */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 24 }}>
        {STAGES.map(s => (
          <button key={s} onClick={() => setStage(s)} style={{
            padding: '6px 14px', borderRadius: 999,
            background: stage === s ? text : 'transparent',
            color: stage === s ? bg : muted,
            border: `1px solid ${stage === s ? text : line2}`,
            cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '.12em',
          }}>{s}</button>
        ))}
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 24 }}>
        {([
          ['Avg. score', `${avgScore}`, 'sur 100'],
          ['Ventures actives', String(activeCount), 'non-Stop'],
          ['Portfolio MRR', `€${(totalMrrK / 1000).toFixed(1)}k`, 'total'],
        ] as [string, string, string][]).map(([label, value, sub]) => (
          <div key={label} style={{ background: surface, border: `1px solid ${line}`, borderRadius: 12, padding: '16px 20px' }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '.14em', textTransform: 'uppercase', color: muted }}>{label}</div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 32, fontWeight: 800, letterSpacing: '-.03em', color: text, marginTop: 6, lineHeight: 1 }}>{value}</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: muted2, marginTop: 4, letterSpacing: '.06em' }}>{sub}</div>
          </div>
        ))}
      </div>

      {/* Add form */}
      {adding && (
        <form onSubmit={create} style={{
          display: 'grid', gridTemplateColumns: '1fr 1fr .6fr .4fr .4fr auto',
          gap: 8, marginBottom: 16,
          background: surface, border: `1px solid ${line}`, borderRadius: 12, padding: 16,
        }}>
          <input className="ck-input" placeholder="Nom" value={form.name} onChange={e => setForm(c => ({ ...c, name: e.target.value }))} />
          <input className="ck-input" placeholder="Niche" value={form.niche} onChange={e => setForm(c => ({ ...c, niche: e.target.value }))} />
          <select className="ck-select" value={form.stage} onChange={e => setForm(c => ({ ...c, stage: e.target.value }))}>
            {['Validation', 'Build', 'Scale', 'Stop'].map(s => <option key={s}>{s}</option>)}
          </select>
          <input className="ck-input" placeholder="Score" type="number" min="0" max="100" value={form.score} onChange={e => setForm(c => ({ ...c, score: e.target.value }))} />
          <input className="ck-input" placeholder="MRR" value={form.mrr} onChange={e => setForm(c => ({ ...c, mrr: e.target.value }))} />
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
        {/* Table */}
        <div style={{ background: surface, border: `1px solid ${line}`, borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${line}` }}>
                  {['Venture', 'Niche', 'Stage', 'Score', 'MRR', 'Next action'].map(h => (
                    <th key={h} style={{ textAlign: 'left', padding: '10px 16px', fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '.14em', textTransform: 'uppercase', color: muted, fontWeight: 600 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(v => (
                  <tr
                    key={v.id}
                    onClick={() => setSelected(v)}
                    className="ck-row-hover"
                    style={{
                      borderBottom: `1px solid ${line}`,
                      cursor: 'pointer',
                      background: selected?.id === v.id ? surface2 : 'transparent',
                      transition: 'background .1s',
                    }}
                  >
                    <td style={{ padding: '12px 16px', fontWeight: 700, fontSize: 13, color: text }}>{v.name}</td>
                    <td style={{ padding: '12px 16px', fontSize: 12, color: muted }}>{v.niche}</td>
                    <td style={{ padding: '12px 16px' }}>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '.12em', color: stageColor(v.stage), fontWeight: 700 }}>{v.stage}</span>
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <span style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 800, color: scoreColor(v.score) }}>{v.score}</span>
                    </td>
                    <td style={{ padding: '12px 16px', fontFamily: 'var(--font-mono)', fontSize: 12, color: text }}>{v.mrr}</td>
                    <td style={{ padding: '12px 16px', fontSize: 12, color: muted2, maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.next_action}</td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={6} style={{ padding: '48px 16px', textAlign: 'center', color: muted2, fontSize: 13 }}>
                      Aucune venture dans ce stage.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Aside */}
        <aside style={{ background: surface, border: `1px solid ${line}`, borderRadius: 12, padding: 20, height: 'fit-content' }}>
          {selected ? (
            <>
              <div style={{ position: 'relative', paddingLeft: 12, marginBottom: 16 }}>
                <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, borderRadius: 2, background: stageColor(selected.stage) }} />
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '.18em', textTransform: 'uppercase', color: muted }}>Selected venture</div>
                <h3 style={{ margin: '6px 0 0', fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 800, letterSpacing: '-.02em', color: text }}>{selected.name}</h3>
              </div>
              <p style={{ fontSize: 13, color: muted, lineHeight: 1.55, marginBottom: 16 }}>{selected.insight}</p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {([
                  ['Stage', selected.stage, stageColor(selected.stage)],
                  ['Score', String(selected.score), scoreColor(selected.score)],
                  ['MRR', selected.mrr, emerald],
                  ['CAC', selected.cac, text],
                  ['Conv.', selected.conversion, text],
                ] as [string, string, string][]).map(([label, value, color]) => (
                  <div key={label} style={{ padding: '10px 12px', borderRadius: 8, background: surface2, border: `1px solid ${line}` }}>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '.14em', textTransform: 'uppercase', color: muted }}>{label}</div>
                    <div style={{ fontFamily: 'var(--font-display)', fontSize: 17, fontWeight: 800, color, marginTop: 4 }}>{value}</div>
                  </div>
                ))}
              </div>
              {selected.next_action && (
                <div style={{ marginTop: 12, padding: '10px 12px', borderRadius: 8, background: surface2, border: `1px solid ${line}` }}>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '.14em', textTransform: 'uppercase', color: muted, marginBottom: 4 }}>Next action</div>
                  <div style={{ fontSize: 12, color: text, lineHeight: 1.5 }}>{selected.next_action}</div>
                </div>
              )}
              <button onClick={() => window.location.href = '/studio'} style={{
                marginTop: 16, width: '100%', padding: '10px 16px', borderRadius: 8,
                background: accent, color: '#0b0d12', border: 'none', cursor: 'pointer',
                fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 13,
              }}>Préparer décision →</button>
            </>
          ) : (
            <div style={{ minHeight: 200, display: 'grid', placeItems: 'center' }}>
              <p style={{ fontSize: 13, color: muted2, textAlign: 'center' }}>Sélectionnez une venture.</p>
            </div>
          )}
        </aside>
      </div>
    </CkShell>
  )
}
