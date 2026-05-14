'use client'

import Link from 'next/link'
import { Rocket, Target, TrendingUp } from 'lucide-react'
import { useMemo, useState } from 'react'

const ventures = [
  { name: 'Kenomi Forms', niche: 'No-code forms for consultants', stage: 'Scale', score: 91, mrr: '€2.8k', next: 'Increase paid acquisition cap', insight: 'CAC is below target and signup quality is high.' },
  { name: 'Solo CFO Copilot', niche: 'Finance assistant for solo founders', stage: 'Validation', score: 84, mrr: '€620', next: 'Run pricing A/B test', insight: 'Search intent is strong but pricing confidence is not final.' },
  { name: 'Legal Intake Bot', niche: 'Client intake for small law firms', stage: 'Build', score: 68, mrr: '€310', next: 'Pivot toward HR operations', insight: 'Legal CPC is high; HR ops has a cleaner wedge.' },
  { name: 'Creator CRM Lite', niche: 'Light CRM for creators', stage: 'Stop', score: 42, mrr: '€120', next: 'Archive learnings', insight: 'CTR and paid conversion stayed below threshold.' },
]

const stages = ['All', 'Validation', 'Build', 'Scale', 'Stop']

export default function VenturesPage() {
  const [stage, setStage] = useState('All')
  const [selected, setSelected] = useState(ventures[0])

  const filtered = useMemo(() => ventures.filter((v) => stage === 'All' || v.stage === stage), [stage])

  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="h-16 border-b border-border flex items-center justify-between px-8 sticky top-0 bg-background/80 backdrop-blur-md z-10">
        <h1 className="text-sm font-semibold text-muted-foreground">
          Studio / <span className="text-foreground">Ventures</span>
        </h1>
        <Link href="/studio" className="text-sm text-muted-foreground hover:text-foreground">
          Retour cockpit
        </Link>
      </header>

      <section className="p-8 max-w-7xl mx-auto space-y-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground">Venture Pipeline</p>
            <h2 className="text-4xl font-extrabold tracking-tighter mt-2">Idées, validations et lancements</h2>
          </div>
          <div className="flex flex-wrap gap-2">
            {stages.map((s) => (
              <button key={s} onClick={() => setStage(s)}
                className={`px-3 py-2 rounded-full text-xs font-mono ring-1 ${stage === s ? 'bg-foreground text-background ring-foreground' : 'bg-surface text-muted-foreground ring-border hover:text-foreground'}`}>
                {s}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {([['Validation score', '82%', Target], ['Launch velocity', '3/mo', Rocket], ['Portfolio MRR', '€4.2k', TrendingUp]] as [string, string, React.ElementType][]).map(([label, value, Icon]) => (
            <div key={label} className="bg-surface ring-1 ring-border rounded-lg p-5">
              <Icon className="size-5 text-accent mb-4" />
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{label}</p>
              <p className="text-4xl font-extrabold tracking-tighter mt-2">{value}</p>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-4">
          <div className="bg-surface ring-1 ring-border rounded-lg overflow-hidden">
            <table className="w-full text-sm min-w-[760px]">
              <thead className="text-xs uppercase tracking-wider text-muted-foreground">
                <tr className="border-b border-border">
                  {['Venture', 'Niche', 'Stage', 'Score', 'MRR', 'Next action'].map((h) => (
                    <th key={h} className="text-left font-medium px-5 py-3">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((v) => (
                  <tr key={v.name} onClick={() => setSelected(v)}
                    className={`border-b border-border/70 last:border-0 cursor-pointer hover:bg-white/[0.03] ${selected.name === v.name ? 'bg-white/[0.04]' : ''}`}>
                    <td className="px-5 py-4 font-semibold">{v.name}</td>
                    <td className="px-5 py-4 text-muted-foreground">{v.niche}</td>
                    <td className="px-5 py-4 font-mono">{v.stage}</td>
                    <td className="px-5 py-4 font-mono">{v.score}</td>
                    <td className="px-5 py-4 font-mono">{v.mrr}</td>
                    <td className="px-5 py-4 text-muted-foreground">{v.next}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <aside className="bg-surface ring-1 ring-border rounded-lg p-5 h-fit">
            <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground">Selected venture</p>
            <h3 className="text-2xl font-extrabold tracking-tighter mt-2">{selected.name}</h3>
            <p className="text-sm text-muted-foreground mt-2">{selected.insight}</p>
            <div className="grid grid-cols-2 gap-3 mt-5">
              <div className="rounded-lg bg-background/40 ring-1 ring-border p-3">
                <p className="text-[10px] uppercase text-muted-foreground">Stage</p>
                <p className="text-sm font-mono mt-1">{selected.stage}</p>
              </div>
              <div className="rounded-lg bg-background/40 ring-1 ring-border p-3">
                <p className="text-[10px] uppercase text-muted-foreground">Score</p>
                <p className="text-sm font-mono mt-1">{selected.score}</p>
              </div>
            </div>
            <button className="mt-5 w-full px-4 py-2 bg-foreground text-background text-xs font-bold rounded-md">
              Préparer décision
            </button>
          </aside>
        </div>
      </section>
    </main>
  )
}
