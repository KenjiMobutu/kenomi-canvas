import type { ScoutSellableOffer, ScoutSourceSignal } from './free-sources'

type FetchImpl = (url: string, init?: RequestInit) => Promise<Response>

interface RedditChild {
  title: string
  selftext: string
  permalink: string
  subreddit: string
  score: number
  num_comments: number
  over_18: boolean
  is_self: boolean
  created_utc: number
}

const DEFAULT_SUBREDDITS = ['smallbusiness', 'SaaS', 'startups'] as const
const PAIN_PATTERNS = [
  '',
  '"looking for tool"',
  '"manual process"',
  '"spreadsheet"',
] as const
const PAIN_KEYWORDS = [
  'manual',
  'spreadsheet',
  'slow',
  'tedious',
  'messy',
  'problem',
  'issue',
  'frustrating',
  'looking for',
  'need a tool',
  'need software',
  'recruit',
  'recruiting',
  'lead gen',
  'reconcile',
  'ops',
  'sales',
]
const NOISE_KEYWORDS = [
  'roast my',
  'show hn',
  'i built',
  'we built',
  'launch',
  'promo',
  'discount',
  'hiring',
  'for hire',
  'selling',
]

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function num(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
}

function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function clamp(score: number): number {
  if (!Number.isFinite(score)) return 0
  return Math.max(0, Math.min(100, Math.round(score)))
}

function normalizeCandidate(value: unknown): RedditChild | null {
  const row = record(record(value).data)
  const title = text(row.title)
  const selftext = text(row.selftext)
  const permalink = text(row.permalink)
  const subreddit = text(row.subreddit)
  if (!title || !permalink || !subreddit) return null
  return {
    title,
    selftext,
    permalink,
    subreddit,
    score: num(row.score),
    num_comments: num(row.num_comments),
    over_18: Boolean(row.over_18),
    is_self: Boolean(row.is_self),
    created_utc: num(row.created_utc),
  }
}

function queryTerms(input: string): string[] {
  const base = input.trim().replace(/\s+/g, ' ')
  return PAIN_PATTERNS.map((suffix) => `${base} ${suffix}`.trim())
}

function containsAny(haystack: string, needles: readonly string[]): boolean {
  const normalized = haystack.toLowerCase()
  return needles.some((needle) => normalized.includes(needle))
}

function preview(selftext: string): string {
  const trimmed = selftext.replace(/\s+/g, ' ').trim()
  return trimmed.length > 180 ? `${trimmed.slice(0, 177)}...` : trimmed
}

function buyerGuess(subreddit: string, body: string): string {
  const source = `${subreddit} ${body}`.toLowerCase()
  if (source.includes('recruit') || source.includes('hiring')) {
    return 'Recruiting teams and solo founders hiring repeatedly'
  }
  if (source.includes('agency')) return 'Agency operators handling repetitive client workflows'
  if (source.includes('sales') || source.includes('lead')) {
    return 'Sales operators who need a tighter outbound workflow'
  }
  if (subreddit.toLowerCase().includes('smallbusiness')) {
    return 'Small business operators with manual internal workflows'
  }
  return 'Operators describing a recurring B2B workflow problem'
}

function buildEvidence(candidate: RedditChild): string {
  const parts = [
    `r/${candidate.subreddit}`,
    `${candidate.score} upvotes`,
    `${candidate.num_comments} comments`,
  ]
  const extra = preview(candidate.selftext)
  return extra ? `${parts.join(' · ')} · ${extra}` : parts.join(' · ')
}

export function scoreRedditCandidate(candidate: RedditChild): number {
  const source = `${candidate.title} ${candidate.selftext}`.toLowerCase()
  let score = 22 + candidate.score * 0.12 + candidate.num_comments * 0.45

  if (candidate.over_18) score -= 30
  if (!candidate.is_self) score -= 8
  if (containsAny(source, PAIN_KEYWORDS)) score += 24
  if (containsAny(source, NOISE_KEYWORDS)) score -= 35
  if (candidate.subreddit.toLowerCase() === 'smallbusiness') score += 10
  if (candidate.subreddit.toLowerCase() === 'saas') score += 6
  if (candidate.title.endsWith('?')) score += 4
  if (!candidate.selftext) score -= 12

  return clamp(score)
}

export function toScoutRedditSignal(input: {
  candidate: RedditChild
  buildSellableOffer: (input: {
    sourceId: 'reddit'
    signalType: 'pain'
    title: string
    url: string
    evidence: string
  }) => ScoutSellableOffer
}): ScoutSourceSignal | null {
  const candidate = input.candidate
  const combined = `${candidate.title} ${candidate.selftext}`.trim()
  const score = scoreRedditCandidate(candidate)
  if (candidate.over_18 || score < 45) return null
  if (!containsAny(combined.toLowerCase(), PAIN_KEYWORDS) && candidate.num_comments < 5) return null

  const url = `https://www.reddit.com${candidate.permalink}`
  const evidence = buildEvidence(candidate)
  const signal = {
    sourceId: 'reddit' as const,
    sourceLabel: 'Reddit',
    signalType: 'pain' as const,
    subreddit: candidate.subreddit,
    title: candidate.title,
    url,
    score,
    evidence,
    sellableOffer: input.buildSellableOffer({
      sourceId: 'reddit',
      signalType: 'pain',
      title: candidate.title,
      url,
      evidence,
    }),
  }

  signal.sellableOffer = {
    ...signal.sellableOffer,
    buyer: buyerGuess(candidate.subreddit, combined),
    urgentPain: candidate.title,
    concretePromise: `Remove the manual bottleneck behind "${candidate.title}".`,
    offer: `Workflow fix for ${buyerGuess(candidate.subreddit, combined).toLowerCase()}`,
    acquisitionChannel: 'reddit',
    landingAngle: `Stop losing time to ${candidate.title.toLowerCase()}`,
  }

  return signal
}

async function fetchRedditQuery(fetchImpl: FetchImpl, query: string): Promise<RedditChild[]> {
  const url = new URL('https://www.reddit.com/search.json')
  url.searchParams.set('q', query)
  url.searchParams.set('sort', 'top')
  url.searchParams.set('t', 'month')
  url.searchParams.set('limit', '6')
  const response = await fetchImpl(url.toString(), {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'kenomi-scout/1.0',
    },
  })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  const json = record(await response.json())
  return array(record(json.data).children).map(normalizeCandidate).filter(Boolean) as RedditChild[]
}

export async function collectRedditSignals(input: {
  query: string
  fetchImpl: FetchImpl
  subredditAllowlist?: string[]
  buildSellableOffer: (input: {
    sourceId: 'reddit'
    signalType: 'pain'
    title: string
    url: string
    evidence: string
  }) => ScoutSellableOffer
}): Promise<ScoutSourceSignal[]> {
  const subreddits = input.subredditAllowlist?.length ? input.subredditAllowlist : [...DEFAULT_SUBREDDITS]
  const rawQueries = subreddits.flatMap((subreddit) =>
    queryTerms(input.query).slice(0, 2).map((term) => `subreddit:${subreddit} ${term}`.trim())
  )

  const results = await Promise.all(rawQueries.map((query) => fetchRedditQuery(input.fetchImpl, query)))
  const seen = new Set<string>()
  const signals = results
    .flat()
    .filter((candidate) => subreddits.map((s) => s.toLowerCase()).includes(candidate.subreddit.toLowerCase()))
    .map((candidate) => toScoutRedditSignal({ candidate, buildSellableOffer: input.buildSellableOffer }))
    .filter((signal): signal is ScoutSourceSignal => Boolean(signal))
    .filter((signal) => {
      if (seen.has(signal.url)) return false
      seen.add(signal.url)
      return true
    })
    .sort((a, b) => b.score - a.score)

  return signals.slice(0, 8)
}
