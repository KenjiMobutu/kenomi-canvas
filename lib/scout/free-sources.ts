export type ScoutSourceId =
  | 'reddit'
  | 'hacker-news'
  | 'github'
  | 'npm'
  | 'stack-exchange'
  | 'google-trends'
  | 'product-hunt'
  | 'openalex'
  | 'gdelt'

export type ScoutSignalType = 'pain' | 'trend' | 'competition' | 'buildability' | 'market'

export interface FreeScoutSource {
  id: ScoutSourceId
  label: string
  priority: 0 | 1
  cost: 'free'
  auth: 'none' | 'optional' | 'token_required'
  signalType: ScoutSignalType
  endpoint: string
  reason: string
}

export interface ScoutSourceSignal {
  sourceId: ScoutSourceId
  sourceLabel: string
  signalType: ScoutSignalType
  title: string
  url: string
  score: number
  evidence: string
  sellableOffer: ScoutSellableOffer
}

export interface ScoutSellableOffer {
  buyer: string
  urgentPain: string
  concretePromise: string
  offer: string
  priceHypothesisEur: number
  acquisitionChannel: string
  landingAngle: string
  evidenceUrl: string
}

export interface ScoutSourceCollection {
  generatedAt: string
  signals: ScoutSourceSignal[]
  failures: Array<{ sourceId: ScoutSourceId; reason: string }>
}

export type ScoutSourceStatus = 'live' | 'degraded' | 'planned' | 'config_required'

export interface ScoutSourceStatusRow {
  id: ScoutSourceId
  label: string
  priority: 0 | 1
  status: ScoutSourceStatus
  cost: 'free'
  auth: FreeScoutSource['auth']
  signalType: ScoutSignalType
  endpoint: string
  reason: string
  signalCount: number
  topSignal: string | null
  topScore: number | null
  lastError: string | null
}

export interface ScoutSourceStatusSummary {
  live: number
  degraded: number
  configRequired: number
  planned: number
}

export interface ScoutSourceStatusReport {
  checkedAt: string
  query: string
  summary: ScoutSourceStatusSummary
  sources: ScoutSourceStatusRow[]
}

type FetchImpl = (url: string, init?: RequestInit) => Promise<Response>

export const FREE_SCOUT_SOURCES: FreeScoutSource[] = [
  {
    id: 'reddit',
    label: 'Reddit',
    priority: 0,
    cost: 'free',
    auth: 'optional',
    signalType: 'pain',
    endpoint: 'https://www.reddit.com/search.json',
    reason: 'Douleurs exprimées directement par des utilisateurs dans des niches.',
  },
  {
    id: 'hacker-news',
    label: 'Hacker News',
    priority: 0,
    cost: 'free',
    auth: 'none',
    signalType: 'pain',
    endpoint: 'https://hn.algolia.com/api/v1/search',
    reason: 'Discussions early adopters, SaaS, devtools, B2B et automatisation.',
  },
  {
    id: 'github',
    label: 'GitHub',
    priority: 0,
    cost: 'free',
    auth: 'optional',
    signalType: 'buildability',
    endpoint: 'https://api.github.com/search/issues',
    reason: 'Issues ouvertes, projets concurrents et signaux de demande technique.',
  },
  {
    id: 'npm',
    label: 'npm Registry',
    priority: 0,
    cost: 'free',
    auth: 'none',
    signalType: 'competition',
    endpoint: 'https://registry.npmjs.org/-/v1/search',
    reason: 'Écosystème de packages : concurrence, adoption et angles devtool.',
  },
  {
    id: 'stack-exchange',
    label: 'Stack Exchange',
    priority: 0,
    cost: 'free',
    auth: 'none',
    signalType: 'pain',
    endpoint: 'https://api.stackexchange.com/2.3/search/advanced',
    reason: 'Questions récurrentes non résolues, très utile pour repérer un besoin solvable.',
  },
  {
    id: 'google-trends',
    label: 'Google Trends',
    priority: 1,
    cost: 'free',
    auth: 'optional',
    signalType: 'trend',
    endpoint: 'https://trends.google.com/trends',
    reason: 'Validation macro de la demande et saisonnalité.',
  },
  {
    id: 'product-hunt',
    label: 'Product Hunt',
    priority: 1,
    cost: 'free',
    auth: 'token_required',
    signalType: 'competition',
    endpoint: 'https://api.producthunt.com/v2/api/graphql',
    reason: 'Produits récents, positionnement et traction initiale.',
  },
  {
    id: 'openalex',
    label: 'OpenAlex',
    priority: 1,
    cost: 'free',
    auth: 'none',
    signalType: 'market',
    endpoint: 'https://api.openalex.org/works',
    reason: 'Tendances recherche, deeptech et marchés émergents.',
  },
  {
    id: 'gdelt',
    label: 'GDELT',
    priority: 1,
    cost: 'free',
    auth: 'none',
    signalType: 'trend',
    endpoint: 'https://api.gdeltproject.org/api/v2/doc/doc',
    reason: 'Couverture média mondiale pour détecter des mouvements de marché.',
  },
]

function clampScore(score: number): number {
  if (!Number.isFinite(score)) return 0
  return Math.max(0, Math.min(100, Math.round(score)))
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
}

function asText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function asNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function notEmpty<T>(value: T | null): value is T {
  return value !== null
}

function priceForSignal(signalType: ScoutSignalType): number {
  if (signalType === 'market') return 499
  if (signalType === 'buildability') return 99
  if (signalType === 'competition') return 29
  return 29
}

function acquisitionChannelForSource(sourceId: ScoutSourceId): string {
  if (sourceId === 'reddit') return 'reddit'
  if (sourceId === 'hacker-news') return 'hacker-news'
  if (sourceId === 'stack-exchange') return 'seo'
  if (sourceId === 'github' || sourceId === 'npm') return 'developer communities'
  if (sourceId === 'product-hunt') return 'product-hunt'
  return 'content'
}

function buildSellableOffer(input: {
  sourceId: ScoutSourceId
  signalType: ScoutSignalType
  title: string
  url: string
  evidence: string
}): ScoutSellableOffer {
  const buyer =
    input.signalType === 'buildability' || input.sourceId === 'npm' || input.sourceId === 'github'
      ? 'Technical founders and operators with this recurring workflow'
      : 'Operators actively discussing this painful workflow'
  const urgentPain = input.title.endsWith('?')
    ? input.title
    : `Recurring pain signaled by: ${input.title}`
  const concretePromise = `Turn this pain into a focused paid workflow with measurable relief.`
  const priceHypothesisEur = priceForSignal(input.signalType)

  return {
    buyer,
    urgentPain,
    concretePromise,
    offer: `Done-for-you or lightweight tool to solve: ${input.title}`,
    priceHypothesisEur,
    acquisitionChannel: acquisitionChannelForSource(input.sourceId),
    landingAngle: `Stop losing time or revenue to: ${input.title}`,
    evidenceUrl: input.url,
  }
}

async function fetchJson(fetchImpl: FetchImpl, url: string): Promise<unknown> {
  let timeout: ReturnType<typeof setTimeout> | undefined
  try {
    const response = await Promise.race([
      fetchImpl(url, {
        headers: {
          Accept: 'application/json',
          'User-Agent': 'kenomi-scout/1.0',
        },
      }),
      new Promise<Response>((_, reject) => {
        timeout = setTimeout(() => reject(new Error('source timeout')), 2500)
      }),
    ])
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    return response.json()
  } finally {
    if (timeout) clearTimeout(timeout)
  }
}

function buildUrl(base: string, params: Record<string, string | number>): string {
  const query = new URLSearchParams(
    Object.fromEntries(Object.entries(params).map(([key, value]) => [key, String(value)]))
  )
  return `${base}?${query.toString()}`
}

async function collectHackerNews(
  query: string,
  fetchImpl: FetchImpl
): Promise<ScoutSourceSignal[]> {
  const data = asRecord(
    await fetchJson(
      fetchImpl,
      buildUrl('https://hn.algolia.com/api/v1/search', {
        query,
        tags: 'story',
        hitsPerPage: 3,
      })
    )
  )
  return asArray(data.hits)
    .map((item) => {
      const row = asRecord(item)
      const title = asText(row.title) || asText(row.story_title)
      if (!title) return null
      const points = asNumber(row.points)
      const comments = asNumber(row.num_comments)
      const signal = {
        sourceId: 'hacker-news' as const,
        sourceLabel: 'Hacker News',
        signalType: 'pain' as const,
        title,
        url: asText(row.url) || `https://news.ycombinator.com/item?id=${asText(row.objectID)}`,
        score: clampScore(42 + points * 0.22 + comments * 0.45),
        evidence: `${points} points, ${comments} commentaires`,
      }
      return {
        ...signal,
        sellableOffer: buildSellableOffer(signal),
      }
    })
    .filter(notEmpty)
}

async function collectNpm(query: string, fetchImpl: FetchImpl): Promise<ScoutSourceSignal[]> {
  const data = asRecord(
    await fetchJson(
      fetchImpl,
      buildUrl('https://registry.npmjs.org/-/v1/search', { text: query, size: 3 })
    )
  )
  return asArray(data.objects)
    .map((item) => {
      const row = asRecord(item)
      const packageData = asRecord(row.package)
      const score = asRecord(row.score)
      const title = asText(packageData.name)
      if (!title) return null
      const finalScore = asNumber(score.final)
      const signal = {
        sourceId: 'npm' as const,
        sourceLabel: 'npm Registry',
        signalType: 'competition' as const,
        title,
        url: asRecord(packageData.links).npm
          ? String(asRecord(packageData.links).npm)
          : `https://www.npmjs.com/package/${encodeURIComponent(title)}`,
        score: clampScore(28 + finalScore * 42),
        evidence: asText(packageData.description) || `score npm ${finalScore.toFixed(2)}`,
      }
      return {
        ...signal,
        sellableOffer: buildSellableOffer(signal),
      }
    })
    .filter(notEmpty)
}

async function collectReddit(query: string, fetchImpl: FetchImpl): Promise<ScoutSourceSignal[]> {
  const data = asRecord(
    await fetchJson(
      fetchImpl,
      buildUrl('https://www.reddit.com/search.json', {
        q: query,
        sort: 'new',
        limit: 3,
      })
    )
  )
  const children = asArray(asRecord(data.data).children)
  return children
    .map((item) => {
      const row = asRecord(asRecord(item).data)
      const title = asText(row.title)
      if (!title) return null
      const score = asNumber(row.score)
      const comments = asNumber(row.num_comments)
      const signal = {
        sourceId: 'reddit' as const,
        sourceLabel: 'Reddit',
        signalType: 'pain' as const,
        title,
        url: `https://www.reddit.com${asText(row.permalink)}`,
        score: clampScore(40 + score * 0.16 + comments * 0.5),
        evidence: `${score} votes, ${comments} commentaires`,
      }
      return {
        ...signal,
        sellableOffer: buildSellableOffer(signal),
      }
    })
    .filter(notEmpty)
}

async function collectGithub(query: string, fetchImpl: FetchImpl): Promise<ScoutSourceSignal[]> {
  const data = asRecord(
    await fetchJson(
      fetchImpl,
      buildUrl('https://api.github.com/search/issues', {
        q: `${query} is:issue`,
        sort: 'comments',
        order: 'desc',
        per_page: 3,
      })
    )
  )
  return asArray(data.items)
    .map((item) => {
      const row = asRecord(item)
      const title = asText(row.title)
      if (!title) return null
      const comments = asNumber(row.comments)
      const signal = {
        sourceId: 'github' as const,
        sourceLabel: 'GitHub',
        signalType: 'buildability' as const,
        title,
        url: asText(row.html_url),
        score: clampScore(36 + comments * 2),
        evidence: `${comments} commentaires sur issue`,
      }
      return {
        ...signal,
        sellableOffer: buildSellableOffer(signal),
      }
    })
    .filter(notEmpty)
}

async function collectStackExchange(
  query: string,
  fetchImpl: FetchImpl
): Promise<ScoutSourceSignal[]> {
  const data = asRecord(
    await fetchJson(
      fetchImpl,
      buildUrl('https://api.stackexchange.com/2.3/search/advanced', {
        order: 'desc',
        sort: 'activity',
        q: query,
        site: 'stackoverflow',
        pagesize: 3,
      })
    )
  )
  return asArray(data.items)
    .map((item) => {
      const row = asRecord(item)
      const title = asText(row.title)
      if (!title) return null
      const score = asNumber(row.score)
      const answers = asNumber(row.answer_count)
      const signal = {
        sourceId: 'stack-exchange' as const,
        sourceLabel: 'Stack Exchange',
        signalType: 'pain' as const,
        title,
        url: asText(row.link),
        score: clampScore(38 + score * 1.5 + answers * 2),
        evidence: `${score} score, ${answers} réponses`,
      }
      return {
        ...signal,
        sellableOffer: buildSellableOffer(signal),
      }
    })
    .filter(notEmpty)
}

const LIVE_COLLECTORS: Array<{
  sourceId: ScoutSourceId
  run: (query: string, fetchImpl: FetchImpl) => Promise<ScoutSourceSignal[]>
}> = [
  { sourceId: 'reddit', run: collectReddit },
  { sourceId: 'hacker-news', run: collectHackerNews },
  { sourceId: 'github', run: collectGithub },
  { sourceId: 'npm', run: collectNpm },
  { sourceId: 'stack-exchange', run: collectStackExchange },
]

export async function collectFreeScoutSignals(input: {
  query: string
  fetchImpl?: FetchImpl
  now?: () => Date
}): Promise<ScoutSourceCollection> {
  const generatedAt = (input.now ?? (() => new Date()))().toISOString()
  const fetchImpl = input.fetchImpl ?? globalThis.fetch?.bind(globalThis)

  if (!fetchImpl || (!input.fetchImpl && process.env.NODE_ENV === 'test')) {
    return { generatedAt, signals: [], failures: [] }
  }

  const results = await Promise.allSettled(
    LIVE_COLLECTORS.map(async (collector) => ({
      sourceId: collector.sourceId,
      signals: await collector.run(input.query, fetchImpl),
    }))
  )

  const signals: ScoutSourceSignal[] = []
  const failures: ScoutSourceCollection['failures'] = []
  results.forEach((result, index) => {
    const sourceId = LIVE_COLLECTORS[index].sourceId
    if (result.status === 'fulfilled') {
      signals.push(...result.value.signals)
    } else {
      failures.push({
        sourceId,
        reason: result.reason instanceof Error ? result.reason.message : 'source unavailable',
      })
    }
  })

  return {
    generatedAt,
    signals: signals.sort((a, b) => b.score - a.score).slice(0, 12),
    failures,
  }
}

export function buildScoutSourceBrief(collection: ScoutSourceCollection): string {
  const topSignals = collection.signals.length
    ? collection.signals
        .slice(0, 8)
        .map(
          (signal, index) =>
            `${index + 1}. ${signal.sourceLabel} [${signal.signalType}] score ${signal.score}/100 - ${signal.title} (${signal.evidence})`
        )
        .join('\n')
    : FREE_SCOUT_SOURCES.slice(0, 5)
        .map(
          (source) =>
            `- ${source.label} [${source.signalType}] ${source.auth === 'token_required' ? 'token requis' : 'sans coût'} : ${source.reason}`
        )
        .join('\n')

  const failures = collection.failures.length
    ? `\nSources indisponibles maintenant : ${collection.failures
        .map((failure) => `${failure.sourceId} (${failure.reason})`)
        .join(', ')}.`
    : ''

  return `

Sources gratuites Scout (${collection.generatedAt}) :
${topSignals}${failures}

Scoring obligatoire avant proposition :
- pain_intensity : douleur explicite, fréquence, urgence.
- trend_velocity : signaux récents et croissance des discussions.
- buyer_likelihood : capacité et volonté de payer, B2B prioritaire.
- competition_gap : alternatives existantes, angle différenciable.
- buildability : produit/service vendable rapidement par solo founder.
- revenue_path : landing + checkout + campagne mesurable.

Ne propose qu'une venture avec chemin de revenu clair. Si les signaux sont faibles, choisis un angle plus étroit. La suite devra pouvoir décider scale/cut sur ROI attribuable.
`.trim()
}

export function buildScoutSourceStatuses(
  collection: ScoutSourceCollection,
  query = 'autopilot revenue micro-SaaS'
): ScoutSourceStatusReport {
  const signalsBySource = new Map<ScoutSourceId, ScoutSourceSignal[]>()
  collection.signals.forEach((signal) => {
    const list = signalsBySource.get(signal.sourceId) ?? []
    list.push(signal)
    signalsBySource.set(signal.sourceId, list)
  })

  const failuresBySource = new Map<ScoutSourceId, string>()
  collection.failures.forEach((failure) => failuresBySource.set(failure.sourceId, failure.reason))

  const sources = FREE_SCOUT_SOURCES.map((source): ScoutSourceStatusRow => {
    const signals = (signalsBySource.get(source.id) ?? []).sort((a, b) => b.score - a.score)
    const failure = failuresBySource.get(source.id) ?? null
    const needsToken = source.auth === 'token_required'
    const status: ScoutSourceStatus = signals.length
      ? 'live'
      : needsToken
        ? 'config_required'
        : failure
          ? 'degraded'
          : 'planned'

    return {
      id: source.id,
      label: source.label,
      priority: source.priority,
      status,
      cost: source.cost,
      auth: source.auth,
      signalType: source.signalType,
      endpoint: source.endpoint,
      reason: source.reason,
      signalCount: signals.length,
      topSignal: signals[0]?.title ?? null,
      topScore: signals[0]?.score ?? null,
      lastError: needsToken ? 'Token API requis avant activation live.' : failure,
    }
  })

  return {
    checkedAt: collection.generatedAt,
    query,
    summary: {
      live: sources.filter((source) => source.status === 'live').length,
      degraded: sources.filter((source) => source.status === 'degraded').length,
      configRequired: sources.filter((source) => source.status === 'config_required').length,
      planned: sources.filter((source) => source.status === 'planned').length,
    },
    sources,
  }
}
