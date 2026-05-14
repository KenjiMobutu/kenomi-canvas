'use client'

import Link from 'next/link'
import { Megaphone, Search, Send, Video } from 'lucide-react'
import { useState } from 'react'

const campaigns = [
  ['LinkedIn founder posts', '12 drafts', 'Solo CFO, Kenomi Forms, validation threads'],
  ['TikTok test scripts', '8 scripts', 'Pain-point hooks for micro-SaaS niches'],
  ['SEO briefs', '21 briefs', 'Comparison pages, alternatives, job-to-be-done pages'],
  ['Newsletter queue', '4 issues', 'Build-in-public and market validation digest'],
]

export default function MarketingPage() {
  const [selected, setSelected] = useState(campaigns[0])
  const [drafts, setDrafts] = useState(20)

  function generateDraft() {
    setDrafts((n) => n + 1)
    setSelected([selected[0], `${Number.parseInt(selected[1]) + 1} drafts`, selected[2]])
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="h-16 border-b border-border flex items-center justify-between px-8 sticky top-0 bg-background/80 backdrop-blur-md z-10">
        <h1 className="text-sm font-semibold text-muted-foreground">
          Studio / <span className="text-foreground">Marketing</span>
        </h1>
        <Link href="/studio" className="text-sm text-muted-foreground hover:text-foreground">
          Retour cockpit
        </Link>
      </header>

      <section className="p-8 max-w-6xl mx-auto space-y-6">
        <div>
          <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground">Posts · Ads · SEO · Newsletter</p>
          <h2 className="text-4xl font-extrabold tracking-tighter mt-2">Marketing Lab</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {([['CTR target', '3.8%', Megaphone], ['SEO pages', '42', Search], ['Social drafts', String(drafts), Video], ['Newsletter tests', '4', Send]] as [string, string, React.ElementType][]).map(([label, value, Icon]) => (
            <div key={label} className="bg-surface ring-1 ring-border rounded-lg p-5">
              <Icon className="size-5 text-accent mb-4" />
              <p className="text-xs text-muted-foreground uppercase tracking-wider">{label}</p>
              <p className="text-3xl font-extrabold tracking-tighter mt-2">{value}</p>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-4">
          <div className="space-y-3">
            {campaigns.map((campaign) => (
              <button key={campaign[0]} onClick={() => setSelected(campaign)}
                className={`w-full text-left bg-surface ring-1 rounded-lg p-5 flex items-center gap-4 hover:ring-accent/40 ${selected[0] === campaign[0] ? 'ring-accent/60' : 'ring-border'}`}>
                <div className="size-10 brand-logo rounded-md grid place-items-center">
                  <Megaphone className="size-5 text-white" />
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-sm">{campaign[0]}</p>
                  <p className="text-xs text-muted-foreground mt-1">{campaign[2]}</p>
                </div>
                <span className="text-[10px] px-2 py-1 rounded-full bg-fuchsia/10 text-fuchsia ring-1 ring-fuchsia/20 font-mono">{campaign[1]}</span>
              </button>
            ))}
          </div>
          <aside className="bg-surface ring-1 ring-border rounded-lg p-5 h-fit">
            <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground">Campaign brief</p>
            <h3 className="text-2xl font-extrabold tracking-tighter mt-2">{selected[0]}</h3>
            <p className="text-sm text-muted-foreground mt-2">{selected[2]}</p>
            <button onClick={generateDraft} className="mt-5 w-full px-4 py-2 bg-foreground text-background text-xs font-bold rounded-md">
              Générer un draft
            </button>
          </aside>
        </div>
      </section>
    </main>
  )
}
