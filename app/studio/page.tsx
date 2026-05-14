'use client'
import Link from 'next/link'
import { useAuth } from '@/lib/auth-context'
import {
  Bot, CheckCircle2, CircleDollarSign, GitBranch,
  RadioTower, TrendingUp, Workflow,
} from 'lucide-react'

const pipeline = [
  { stage: 'Ideas', count: 34, signal: '+8 this week', tone: 'text-cyan-400' },
  { stage: 'Validation', count: 12, signal: '5 paid tests', tone: 'text-emerald-400' },
  { stage: 'Build', count: 5, signal: '2 shipping', tone: 'text-violet-400' },
  { stage: 'Launch', count: 3, signal: '1 profitable', tone: 'text-fuchsia-400' },
  { stage: 'Scale', count: 1, signal: 'Kenomi Forms', tone: 'text-emerald-400' },
]

const kpis = [
  { label: 'Studio MRR', value: '€4.2k', delta: '+18%', status: 'Growing' },
  { label: 'Avg CAC', value: '€18', delta: '-11%', status: 'Healthy' },
  { label: 'Signup rate', value: '7.4%', delta: '+2.1 pts', status: 'Validated' },
  { label: 'Active experiments', value: '19', delta: '6 agents', status: 'Running' },
]

const decisions = [
  { action: 'Scale', venture: 'Kenomi Forms', reason: 'MRR up 18%, CAC below target', confidence: '92%' },
  { action: 'Continue', venture: 'Solo CFO Copilot', reason: 'Strong SEO intent, waitlist growing', confidence: '84%' },
  { action: 'Pivot', venture: 'Legal Intake Bot', reason: 'High CPC, better niche in HR ops', confidence: '76%' },
  { action: 'Stop', venture: 'Creator CRM Lite', reason: 'CTR below threshold after 3 tests', confidence: '71%' },
]

const agentsList = [
  { name: 'Scout Agent', task: 'Scanning Reddit, Product Hunt, Trends', status: 'Live', model: 'Claude Code' },
  { name: 'Validation Agent', task: 'Scoring TAM, CPC, SEO, competitors', status: 'Running', model: 'Ollama' },
  { name: 'Builder Agent', task: 'Generating landing pages and pricing', status: 'Queued', model: 'Claude Code' },
  { name: 'Marketing Agent', task: 'Drafting LinkedIn, TikTok, SEO briefs', status: 'Live', model: 'Ollama' },
  { name: 'Decision Agent', task: 'Preparing continue/pivot/stop calls', status: 'Review', model: 'Claude Code' },
]

const automationsList = [
  { service: 'n8n', status: '18 workflows', detail: '2 need review' },
  { service: 'Supabase', status: 'Connected', detail: 'Auth and storage ready' },
  { service: 'Stripe', status: 'Sandbox', detail: 'Checkout pending' },
  { service: 'Coolify + MCP', status: 'Online', detail: 'Infra hooks healthy' },
]

const ventures = [
  { name: 'Kenomi Forms', stage: 'Scale', score: 91, mrr: '€2.8k', cac: '€14', conversion: '9.8%', status: 'Scale' },
  { name: 'Solo CFO Copilot', stage: 'Validation', score: 84, mrr: '€620', cac: '€21', conversion: '6.2%', status: 'Continue' },
  { name: 'Legal Intake Bot', stage: 'Build', score: 68, mrr: '€310', cac: '€39', conversion: '4.1%', status: 'Pivot' },
  { name: 'Creator CRM Lite', stage: 'Launch', score: 42, mrr: '€120', cac: '€52', conversion: '1.9%', status: 'Stop' },
]

function statusClass(status: string) {
  if (['Scale', 'Live', 'Connected', 'Online'].includes(status)) return 'bg-emerald-500/10 text-emerald-400 ring-emerald-500/20'
  if (['Continue', 'Running'].includes(status)) return 'bg-cyan-500/10 text-cyan-400 ring-cyan-500/20'
  if (['Pivot', 'Review', 'Sandbox'].includes(status)) return 'bg-fuchsia-500/10 text-fuchsia-400 ring-fuchsia-500/20'
  return 'bg-muted text-muted-foreground ring-border'
}

export default function Dashboard() {
  const { user } = useAuth()
  const name = user?.email?.split('@')[0] || 'operator'

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
              <div className="flex items-center gap-2 text-xs text-emerald-400 font-mono">
                <RadioTower className="size-4" />6 agents actifs · 19 expériences
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
                    <p className={`text-[11px] font-mono ${item.tone}`}>{item.signal}</p>
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
                      <span className="text-[10px] px-2 py-1 rounded-full bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/20 font-mono">{kpi.delta}</span>
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
              <CheckCircle2 className="size-5 text-emerald-400" />
            </div>
            <div className="space-y-3">
              {decisions.map((decision) => (
                <div key={decision.venture} className="rounded-md bg-background/40 ring-1 ring-border p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className={`text-[10px] px-2 py-1 rounded-full ring-1 font-mono ${statusClass(decision.action)}`}>{decision.action}</span>
                    <span className="text-[10px] text-muted-foreground font-mono">{decision.confidence}</span>
                  </div>
                  <p className="text-sm font-semibold mt-2">{decision.venture}</p>
                  <p className="text-xs text-muted-foreground mt-1">{decision.reason}</p>
                </div>
              ))}
            </div>
          </aside>
        </section>

        <section className="grid grid-cols-1 xl:grid-cols-[1fr_420px] gap-6">
          <div className="bg-surface ring-1 ring-border rounded-lg overflow-hidden">
            <div className="p-5 border-b border-border flex items-center justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Venture Pipeline</p>
                <h3 className="text-xl font-extrabold tracking-tighter">Active ventures</h3>
              </div>
              <TrendingUp className="size-5 text-violet-400" />
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[720px]">
                <thead className="text-xs uppercase tracking-wider text-muted-foreground">
                  <tr className="border-b border-border">
                    {['Venture','Stage','Score','MRR','CAC','Conv.','Decision'].map(h => (
                      <th key={h} className="text-left font-medium px-5 py-3">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {ventures.map((v) => (
                    <tr key={v.name} className="border-b border-border/70 last:border-0">
                      <td className="px-5 py-4 font-semibold">{v.name}</td>
                      <td className="px-5 py-4 text-muted-foreground">{v.stage}</td>
                      <td className="px-5 py-4 font-mono">{v.score}</td>
                      <td className="px-5 py-4 font-mono">{v.mrr}</td>
                      <td className="px-5 py-4 font-mono">{v.cac}</td>
                      <td className="px-5 py-4 font-mono">{v.conversion}</td>
                      <td className="px-5 py-4">
                        <span className={`text-[10px] px-2 py-1 rounded-full ring-1 font-mono ${statusClass(v.status)}`}>{v.status}</span>
                      </td>
                    </tr>
                  ))}
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
                <Bot className="size-5 text-cyan-400" />
              </div>
              <div className="space-y-3">
                {agentsList.map((agent) => (
                  <div key={agent.name} className="flex gap-3 rounded-md bg-background/40 ring-1 ring-border p-3">
                    <div className="size-9 brand-logo rounded-md grid place-items-center shrink-0">
                      <Bot className="size-4 text-white" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-semibold truncate">{agent.name}</p>
                        <span className={`text-[10px] px-2 py-1 rounded-full ring-1 font-mono ${statusClass(agent.status)}`}>{agent.status}</span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">{agent.task}</p>
                      <p className="text-[10px] text-muted-foreground font-mono mt-2">{agent.model}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-surface ring-1 ring-border rounded-lg p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Automation Health</p>
                  <h3 className="text-xl font-extrabold tracking-tighter">Infra signals</h3>
                </div>
                <Workflow className="size-5 text-fuchsia-400" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {automationsList.map((a) => (
                  <div key={a.service} className="rounded-md bg-background/40 ring-1 ring-border p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold">{a.service}</p>
                      <CircleDollarSign className="size-4 text-muted-foreground" />
                    </div>
                    <p className={`text-xs font-mono mt-2 ${a.status === 'Sandbox' ? 'text-fuchsia-400' : 'text-emerald-400'}`}>{a.status}</p>
                    <p className="text-xs text-muted-foreground mt-1">{a.detail}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
