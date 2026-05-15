import { useEffect, useState } from 'react'

export const AGENTS_DATA = [
  { id: 'scout',      name: 'Scout',      code: 'SCT', role: 'Discovery',    tagline: 'Reddit · PH · Trends · Gummysearch', model: 'Claude Code',  color: '#22d3ee', sigil: '◬', level: 14, xp: 0.72 },
  { id: 'validation', name: 'Validation', code: 'VAL', role: 'Scoring',      tagline: 'TAM · CPC · SEO · concurrents',       model: 'Ollama',        color: '#a78bfa', sigil: '◇', level: 11, xp: 0.41 },
  { id: 'builder',    name: 'Builder',    code: 'BLD', role: 'Production',   tagline: 'Landing · pricing · branding',        model: 'Claude Code',  color: '#34d399', sigil: '◮', level: 17, xp: 0.88 },
  { id: 'payment',    name: 'Payment',    code: 'PAY', role: 'Monetization', tagline: 'Stripe · checkout · webhooks',        model: 'Stripe API',   color: '#fbbf24', sigil: '◈', level: 8,  xp: 0.55 },
  { id: 'marketing',  name: 'Marketing',  code: 'MKT', role: 'Distribution', tagline: 'LinkedIn · TikTok · SEO · ads',       model: 'Ollama',        color: '#e879f9', sigil: '✺', level: 13, xp: 0.62 },
  { id: 'analytics',  name: 'Analytics',  code: 'ANA', role: 'Telemetry',    tagline: 'Trafic · revenu · CAC · rétention',   model: 'Supabase',     color: '#60a5fa', sigil: '◐', level: 12, xp: 0.34 },
  { id: 'decision',   name: 'Decision',   code: 'DEC', role: 'Command',      tagline: 'Continue · Pivot · Stop · Scale',     model: 'Claude Code',  color: '#ff6a3d', sigil: '✦', level: 19, xp: 0.93 },
]

export function agentById(id: string) {
  return AGENTS_DATA.find(a => a.id === id) ?? AGENTS_DATA[0]
}

export function makeSpark(n = 24, base = 50, vol = 18, seed = 1): number[] {
  let s = seed
  const out: number[] = []
  let b = base
  for (let i = 0; i < n; i++) {
    s = (s * 9301 + 49297) % 233280
    const r = s / 233280
    b += (r - 0.5) * vol
    b = Math.max(8, Math.min(98, b))
    out.push(b)
  }
  return out
}

export function sparkPath(values: number[], w: number, h: number, pad = 2): string {
  if (!values.length) return ''
  const min = Math.min(...values), max = Math.max(...values)
  const span = max - min || 1
  const step = (w - pad * 2) / (values.length - 1)
  return values.map((v, i) => {
    const x = pad + i * step
    const y = pad + (h - pad * 2) * (1 - (v - min) / span)
    return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ')
}

export function areaPath(values: number[], w: number, h: number, pad = 2): string {
  const ln = sparkPath(values, w, h, pad)
  return `${ln} L${w - pad},${h - pad} L${pad},${h - pad} Z`
}

export function useIsMobile(breakpoint = 768): boolean {
  const [mobile, setMobile] = useState(false)
  useEffect(() => {
    const check = () => setMobile(window.innerWidth < breakpoint)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [breakpoint])
  return mobile
}

export function useTick(period = 4000): number {
  const [t, setT] = useState(0)
  useEffect(() => {
    let raf: number
    const start = performance.now()
    const loop = (now: number) => {
      setT(((now - start) % period) / period)
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [period])
  return t
}
