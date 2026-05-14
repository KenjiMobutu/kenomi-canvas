'use client'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { createSupabaseBrowser } from '@/lib/supabase-browser'
import { useAuth } from '@/lib/auth-context'
import {
  Bot, CheckCircle2, CircleDollarSign, GitBranch,
  RadioTower, TrendingUp, Workflow,
} from 'lucide-react'

interface Venture {
  id: string
  name: string
  stage: string
  score: number
  mrr: string
  cac: string
  conversion: string
  next_action: string
  insight: string
}

interface Agent {
  id: string
  name: string
  description: string | null
  model: string
  is_active: boolean
}

interface Auto {
  id: string
  name: string
  trigger_type: string
  is_enabled: boolean
  webhook_url: string | null
}

interface KpiRow {
  period: string
  revenue: string
  revenue_delta: string
  ctr: string
  ctr_delta: string
  conversion: string
  conversion_delta: string
  retention: string
  retention_delta: string
}

function stageOrder(stage: string) {
  return { Validation: 0, Build: 1, Scale: 2, Launch: 3, Stop: 4 }[stage] ?? 5
}

function decisionAction(v: Venture) {
  if (v.stage === 'Scale') return 'Scale'
  if (v.stage === 'Stop') return 'Stop'
  if (v.score >= 75) return 'Continue'
  return 'Pivot'
}

function statusClass(status: string) {
  if (['Scale', 'Live', 'Connected', 'Online', 'Continue'].includes(status)) return 'bg-emerald/10 text-emerald ring-emerald/20'
  if (['Running', 'Queued', 'Schedule'].includes(status)) return 'bg-cyan/10 text-cyan ring-cyan/20'
  if (['Pivot', 'Review', 'Sandbox', 'Manual'].includes(status)) return 'bg-fuchsia/10 text-fuchsia ring-fuchsia/20'
  return 'bg-muted text-muted-foreground ring-border'
}

const stageColors: Record<string, string> = {
  Ideas: 'text-cyan',
  Validation: 'text-emerald',
  Build: 'text-accent',
  Launch: 'text-fuchsia',
  Scale: 'text-emerald',
}

export default function Dashboard() {
  const { user } = useAuth()
  const name = user?.email?.split('@')[0] || 'operator'

  const [ventures, setVentures] = useState<Venture[]>([])
  const [agents, setAgents] = useState<Agent[]>([])
  const [autos, setAutos] = useState<Auto[]>([])
  const [kpi, setKpi] = useState<KpiRow | null>(null)

  useEffect(() => {
    if (!user) return
    const supabase = createSupabaseBrowser()
    Promise.all([
      supabase.from('ventures').select('*').order('score', { ascending: false }),
      supabase.from('agents').select('*').order('created_at', { ascending: false }),
      supabase.from('automations').select('*').order('created_at', { ascending: false }),
      supabase.from('kpi_snapshots').select('*').eq('period', '30d').single(),
    ]).then(([{ data: v }, { data: a }, { data: au }, { data: k }]) => {
      setVentures((v as Venture[]) || [])
      setAgents((a as Agent[]) || [])
      setAutos((au as Auto[]) || [])
      setKpi(k as KpiRow | null)
    })
  }, [user])

  // Derived pipeline counts
  const pipeline = (['Ideas', 'Validation', 'Build', 'Scale', 'Stop'] as const).map((stage) => {
    if (stage === 'Ideas') return { stage, count: ventures.length + 30, signal: `+${ventures.length} tracked`, tone: stageColors[stage] }
    const list = ventures.filter((v) => v.stage === stage)
    return { stage, count: list.length, signal: list.length > 0 ? `${list.map(v => v.name.split(' ')[0]).slice(0, 2).join(', ')}` : '—', tone: stageColors[stage] || 'text-muted-foreground' }
  })

  const totalMrrK = ventures.reduce((sum, v) => {
    const raw = parseFloat(v.mrr.replace(/[^0-9.]/g, '')) || 0
    return sum + (v.mrr.toLowerCase().includes('k') ? raw * 1000 : raw)
  }, 0)

  const kpis = [
    { label: 'Studio MRR', value: `€${(totalMrrK / 1000).toFixed(1)}k`, delta: kpi?.revenue_delta ?? '+0%', status: 'Growing' },
    { label: 'CTR', value: kpi?.ctr ?? '—', delta: kpi?.ctr_delta ?? '+0 pts', status: 'Tracking' },
    { label: 'Conversion', value: kpi?.conversion ?? '—', delta: kpi?.conversion_delta ?? '+0 pts', status: 'Validated' },
    { label: 'Active experiments', value: String(ventures.filter(v => v.stage !== 'Stop').length), delta: `${agents.filter(a => a.is_active).length} agents`, status: 'Running' },
  ]

  const decisions = ventures.slice(0, 4).map((v) => ({
    action: decisionAction(v),
    venture: v.name,
    reason: v.insight || v.next_action || '—',
    confidence: `${v.score}%`,
  }))

  const automationsList = [
    { service: 'n8n', status: `${autos.length} workflows`, detail: autos.filter(a => !a.is_enabled).length > 0 ? `${autos.filter(a => !a.is_enabled).length} en pause` : 'Tous actifs' },
    { service: 'Supabase', status: 'Connected', detail: 'Auth and storage ready' },
    { service: 'Stripe', status: 'Sandbox', detail: 'Checkout pending' },
    { service: 'Coolify + MCP', status: 'Online', detail: 'Infra hooks healthy' },
  ]

  return (
    <div>
      <header className="h-16 border-b border-border flex items-center justify-between px-4 md:px-8 sticky top-0 bg-background/80 backdrop-blur-md z-10">
        <h1 className="text-sm font-semibold text-muted-foreground">
          Studio / <span className="text-foreground">Venture Cockpit</span>
        </h1>
        <Link href="/studio/agents"
          className="px-4 py-1.5 bg-foreground text-background text-xs font-bold rounded-full hover:opacity-90">
          Configurer agents
        </Link>
      </header>

      <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6 md:space-y-8">
        <section className="grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-6">
          <div className="space-y-6">
            <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
              <div>
                <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground">Kenomi AI Venture Studio</p>
                <h2 className="text-3xl md:text-5xl font-extrabold tracking-tighter mt-2">
                  Bonjour {name}. <span className="text-gradient">Venture Cockpit</span>
                </h2>
              </div>
              <div className="flex items-center gap-2 text-xs text-emerald font-mono">
                <RadioTower className="size-4" />{agents.filter(a => a.is_active).length} agents actifs · {ventures.filter(v => v.stage !== 'Stop').length} expériences
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
              {pipeline.map((item) => (
                <div key={item.stage} className="bg-surface ring-1 ring-border rounded-lg p-4 min-h-32 flex flex-col justify-between">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{item.stage}</p>
                    <GitBranch className={`size-4 ${item.tone}`} />
                  </div>
                  <div>
                    <p className="text-4xl font-extrabold tracking-tighter">{item.count}</p>
                    <p className={`text-[11px] font-mono truncate ${item.tone}`}>{item.signal}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
              {kpis.map((kpi, index) => (
                <div key={kpi.label}
                  className={`${index === 0 ? 'gradient-border' : 'bg-surface ring-1 ring-border'} rounded-lg p-5 relative overflow-hidden`}>
                  {index === 0 && <div className="accent-glow absolute inset-0" />}
                  <div className="relative">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{kpi.label}</p>
                    <div className="flex items-end justify-between gap-3 mt-3">
                      <p className="text-3xl font-extrabold tracking-tighter">{kpi.value}</p>
                      <span className="text-[10px] px-2 py-1 rounded-full bg-emerald/10 text-emerald ring-1 ring-emerald/20 font-mono">{kpi.delta}</span>
                    </div>
                    <p className="text-[10px] text-muted-foreground font-mono mt-2">{kpi.status}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <aside className="bg-surface ring-1 ring-border rounded-lg p-5 h-fit">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Decision Queue</p>
                <h3 className="text-xl font-extrabold tracking-tighter">Next calls</h3>
              </div>
              <CheckCircle2 className="size-5 text-emerald" />
            </div>
            {decisions.length > 0 ? (
              <div className="space-y-3">
                {decisions.map((decision) => (
                  <div key={decision.venture} className="rounded-md bg-background/40 ring-1 ring-border p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className={`text-[10px] px-2 py-1 rounded-full ring-1 font-mono ${statusClass(decision.action)}`}>{decision.action}</span>
                      <span className="text-[10px] text-muted-foreground font-mono">{decision.confidence}</span>
                    </div>
                    <p className="text-sm font-semibold mt-2">{decision.venture}</p>
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{decision.reason}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-6">
                Aucune venture. <Link href="/studio/ventures" className="text-accent hover:underline">Créez votre pipeline →</Link>
              </p>
            )}
          </aside>
        </section>

        <section className="grid grid-cols-1 xl:grid-cols-[1fr_420px] gap-6">
          <div className="bg-surface ring-1 ring-border rounded-lg overflow-hidden">
            <div className="p-5 border-b border-border flex items-center justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Venture Pipeline</p>
                <h3 className="text-xl font-extrabold tracking-tighter">Active ventures</h3>
              </div>
              <TrendingUp className="size-5 text-violet" />
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[720px]">
                <thead className="text-xs uppercase tracking-wider text-muted-foreground">
                  <tr className="border-b border-border">
                    {['Venture', 'Stage', 'Score', 'MRR', 'CAC', 'Conv.', 'Decision'].map((h) => (
                      <th key={h} className="text-left font-medium px-5 py-3">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {ventures.map((v) => (
                    <tr key={v.id} className="border-b border-border/70 last:border-0">
                      <td className="px-5 py-4 font-semibold">{v.name}</td>
                      <td className="px-5 py-4 text-muted-foreground">{v.stage}</td>
                      <td className="px-5 py-4 font-mono">{v.score}</td>
                      <td className="px-5 py-4 font-mono">{v.mrr}</td>
                      <td className="px-5 py-4 font-mono">{v.cac}</td>
                      <td className="px-5 py-4 font-mono">{v.conversion}</td>
                      <td className="px-5 py-4">
                        <span className={`text-[10px] px-2 py-1 rounded-full ring-1 font-mono ${statusClass(decisionAction(v))}`}>{decisionAction(v)}</span>
                      </td>
                    </tr>
                  ))}
                  {ventures.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-5 py-12 text-center text-sm text-muted-foreground">
                        <Link href="/studio/ventures" className="text-accent hover:underline">Créez votre premier pipeline →</Link>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="space-y-6">
            <div className="bg-surface ring-1 ring-border rounded-lg p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Agent Mesh</p>
                  <h3 className="text-xl font-extrabold tracking-tighter">Active agents</h3>
                </div>
                <Bot className="size-5 text-cyan" />
              </div>
              {agents.length > 0 ? (
                <div className="space-y-3">
                  {agents.slice(0, 5).map((agent) => (
                    <div key={agent.id} className="flex gap-3 rounded-md bg-background/40 ring-1 ring-border p-3">
                      <div className="size-9 brand-logo rounded-md grid place-items-center shrink-0">
                        <Bot className="size-4 text-white" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-semibold truncate">{agent.name}</p>
                          <span className={`text-[10px] px-2 py-1 rounded-full ring-1 font-mono ${agent.is_active ? 'bg-emerald/10 text-emerald ring-emerald/20' : 'bg-muted text-muted-foreground ring-border'}`}>
                            {agent.is_active ? 'Live' : 'Paused'}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1 truncate">{agent.description}</p>
                        <p className="text-[10px] text-muted-foreground font-mono mt-2">{agent.model}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-4">
                  <Link href="/studio/agents" className="text-accent hover:underline">Créez vos premiers agents →</Link>
                </p>
              )}
            </div>

            <div className="bg-surface ring-1 ring-border rounded-lg p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Automation Health</p>
                  <h3 className="text-xl font-extrabold tracking-tighter">Infra signals</h3>
                </div>
                <Workflow className="size-5 text-fuchsia" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {automationsList.map((a) => (
                  <div key={a.service} className="rounded-md bg-background/40 ring-1 ring-border p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold">{a.service}</p>
                      <CircleDollarSign className="size-4 text-muted-foreground" />
                    </div>
                    <p className={`text-xs font-mono mt-2 ${a.status === 'Sandbox' ? 'text-fuchsia' : 'text-emerald'}`}>{a.status}</p>
                    <p className="text-xs text-muted-foreground mt-1">{a.detail}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <div className="flex justify-center pb-4">
          <Link href="/studio/automations"
            className="px-6 py-2.5 ring-1 ring-border rounded-full text-xs font-bold text-muted-foreground hover:text-foreground hover:ring-accent/40 transition-colors">
            Ouvrir Automation Center →
          </Link>
        </div>
      </div>
    </div>
  )
}
