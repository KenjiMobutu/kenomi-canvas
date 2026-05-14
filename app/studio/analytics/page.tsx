'use client'

import Link from 'next/link'
import { Activity, BarChart3, Euro, MousePointerClick } from 'lucide-react'
import { useState } from 'react'

const ranges = {
  '7d': [
    ['Revenue', '€1.1k', '+6%', Euro],
    ['CTR', '3.2%', '+0.2 pts', MousePointerClick],
    ['Conversion', '6.8%', '+0.4 pts', BarChart3],
    ['Retention', '59%', '+1 pt', Activity],
  ],
  '30d': [
    ['Revenue', '€4.2k', '+18%', Euro],
    ['CTR', '3.8%', '+0.7 pts', MousePointerClick],
    ['Conversion', '7.4%', '+2.1 pts', BarChart3],
    ['Retention', '62%', '+5 pts', Activity],
  ],
  '90d': [
    ['Revenue', '€11.7k', '+41%', Euro],
    ['CTR', '4.1%', '+1.4 pts', MousePointerClick],
    ['Conversion', '8.2%', '+3.0 pts', BarChart3],
    ['Retention', '67%', '+9 pts', Activity],
  ],
}

const funnel = [
  ['Visitors', '18,420', '100%'],
  ['Waitlist signups', '1,364', '7.4%'],
  ['Activated users', '328', '24.0%'],
  ['Paid customers', '74', '22.6%'],
]

export default function AnalyticsPage() {
  const [range, setRange] = useState<keyof typeof ranges>('30d')
  const metrics = ranges[range]

  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="h-16 border-b border-border flex items-center justify-between px-8 sticky top-0 bg-background/80 backdrop-blur-md z-10">
        <h1 className="text-sm font-semibold text-muted-foreground">
          Studio / <span className="text-foreground">Analytics</span>
        </h1>
        <Link href="/studio" className="text-sm text-muted-foreground hover:text-foreground">
          Retour cockpit
        </Link>
      </header>

      <section className="p-8 max-w-6xl mx-auto space-y-6">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground">
              Revenus · CTR · Conversions · CAC
            </p>
            <h2 className="text-4xl font-extrabold tracking-tighter mt-2">Analytics Studio</h2>
          </div>
          <div className="flex gap-2">
            {(Object.keys(ranges) as Array<keyof typeof ranges>).map((item) => (
              <button key={item} onClick={() => setRange(item)}
                className={`px-3 py-2 rounded-full text-xs font-mono ring-1 ${range === item ? 'bg-foreground text-background ring-foreground' : 'bg-surface text-muted-foreground ring-border'}`}>
                {item}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {metrics.map(([label, value, delta, Icon]) => {
            const I = Icon as React.ElementType
            return (
              <div key={label as string} className="bg-surface ring-1 ring-border rounded-lg p-5">
                <I className="size-5 text-emerald mb-4" />
                <p className="text-xs text-muted-foreground uppercase tracking-wider">{label as string}</p>
                <p className="text-3xl font-extrabold tracking-tighter mt-2">{value as string}</p>
                <p className="text-[10px] text-emerald font-mono mt-2">{delta as string}</p>
              </div>
            )
          })}
        </div>

        <div className="bg-surface ring-1 ring-border rounded-lg p-5">
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-4">
            Portfolio funnel · {range}
          </p>
          <div className="space-y-3">
            {funnel.map(([label, value, rate]) => (
              <div key={label} className="grid grid-cols-[1fr_auto_auto] gap-4 items-center">
                <span className="text-sm font-semibold">{label}</span>
                <span className="text-sm font-mono">{value}</span>
                <span className="text-[10px] px-2 py-1 rounded-full bg-cyan/10 text-cyan ring-1 ring-cyan/20 font-mono">{rate}</span>
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  )
}
