import { buildProspectOutreach } from './build-outreach'
import { scoreProspect } from './score-prospect'
import type { ProspectOutput } from '@/lib/agent-output-schemas'
import { isAllowedWebhookUrl, isValidEmail } from '@/lib/security'

type FetchImpl = (url: string, init?: RequestInit) => Promise<Response>

export interface GroundedProspectOutput extends ProspectOutput {
  contact_role?: string
  contact_email: string
  source_url: string
}

interface GroundedProspectExclude {
  emails?: string[]
  sourceUrls?: string[]
  companyNames?: string[]
}

interface GithubSearchUser {
  url: string
}

interface GithubUserProfile {
  login?: string | null
  name?: string | null
  email?: string | null
  company?: string | null
  bio?: string | null
  html_url?: string | null
  blog?: string | null
  followers?: number | null
  public_repos?: number | null
  hireable?: boolean | null
}

const EMAIL_PATTERN = /([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/gi

const SEARCH_QUERIES = [
  'agency studio in:bio repos:>2 followers:>1',
  'freelance consultant in:bio repos:>2 followers:>1',
  'consultant automation in:bio repos:>2 followers:>1',
  'web agency in:bio repos:>2 followers:>1',
  'design studio in:bio repos:>2 followers:>1',
  'product studio in:bio repos:>2 followers:>1',
] as const

const SEARCH_RESULTS_PER_QUERY = 10
const PROFILE_SCAN_LIMIT = 8

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function number(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
}

function isPublicBusinessEmail(email: string): boolean {
  if (!email.includes('@')) return false
  if (!isValidEmail(email)) return false
  return !email.toLowerCase().endsWith('@users.noreply.github.com')
}

function normalizeKey(value: string): string {
  return value.trim().toLowerCase()
}

function normalizeCompanyName(profile: GithubUserProfile): string {
  const company = text(profile.company).replace(/^@+/, '')
  return company || text(profile.name) || text(profile.login)
}

function normalizeContactName(profile: GithubUserProfile): string | undefined {
  return text(profile.name) || text(profile.login) || undefined
}

function normalizeRole(profile: GithubUserProfile): string | undefined {
  const bio = text(profile.bio)
  return bio || undefined
}

function painPointsForProfile(profile: GithubUserProfile): string[] {
  const source = `${text(profile.bio)} ${text(profile.company)}`.toLowerCase()
  if (source.includes('agency') || source.includes('studio')) {
    return [
      'manual lead follow-up steals delivery time',
      'sales admin competes with client work',
    ]
  }
  if (source.includes('freelance') || source.includes('consultant')) {
    return [
      'manual follow-up can eat into billable time',
      'lead qualification competes with delivery work',
    ]
  }
  return [
    'manual lead follow-up creates avoidable delay',
    'client acquisition work competes with core delivery',
  ]
}

function buildSummary(profile: GithubUserProfile, companyName: string): string {
  const bio = text(profile.bio)
  if (bio) {
    return `${companyName} exposes a public GitHub contact and describes itself as: ${bio}.`
  }
  return `${companyName} exposes a public GitHub contact and looks like a small operator-led technical business.`
}

function fitFromProfile(profile: GithubUserProfile): 'low' | 'medium' | 'high' {
  const source = `${text(profile.bio)} ${text(profile.company)}`.toLowerCase()
  if (
    source.includes('agency') ||
    source.includes('studio') ||
    source.includes('freelance') ||
    source.includes('consultant')
  ) {
    return 'high'
  }
  return 'medium'
}

function urgencyFromProfile(profile: GithubUserProfile): 'low' | 'medium' | 'high' {
  const bio = text(profile.bio).toLowerCase()
  if (profile.hireable || bio.includes('available') || bio.includes('freelance')) return 'high'
  return 'medium'
}

async function fetchGithubJson(fetchImpl: FetchImpl, url: string, token?: string): Promise<unknown> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'kenomi-prospect/1.0',
  }
  if (token) headers.Authorization = `Bearer ${token}`
  const response = await fetchImpl(url, { headers })
  if (!response.ok) throw new Error(`GitHub HTTP ${response.status}`)
  return response.json()
}

function isGithubRequestError(error: unknown): boolean {
  return error instanceof Error && error.message.startsWith('GitHub HTTP ')
}

function buildSearchUrl(query: string): string {
  const url = new URL('https://api.github.com/search/users')
  url.searchParams.set('q', query)
  url.searchParams.set('per_page', String(SEARCH_RESULTS_PER_QUERY))
  return url.toString()
}

function extractPublicEmailFromHtml(html: string): string | null {
  const matches = html.matchAll(EMAIL_PATTERN)
  for (const match of matches) {
    const email = typeof match[1] === 'string' ? match[1].trim() : ''
    if (email && isPublicBusinessEmail(email)) return email
  }
  return null
}

function normalizeWebsiteUrl(value: string): string | null {
  if (!value) return null
  try {
    const url = new URL(value.startsWith('http') ? value : `https://${value}`)
    if (!isAllowedWebhookUrl(url.toString())) return null
    url.hash = ''
    return url.toString()
  } catch {
    return null
  }
}

function buildWebsiteCandidates(rawUrl: string): string[] {
  const normalized = normalizeWebsiteUrl(rawUrl)
  if (!normalized) return []
  const root = new URL(normalized)
  const home = new URL('/', root).toString()
  const contact = new URL('/contact', root).toString()
  const contactUs = new URL('/contact-us', root).toString()
  return [...new Set([home, contact, contactUs])]
}

async function resolveProfileEmail(
  profile: GithubUserProfile,
  fetchImpl: FetchImpl,
  token?: string
): Promise<string | null> {
  const directEmail = text(profile.email)
  if (directEmail && isPublicBusinessEmail(directEmail)) return directEmail

  const websiteUrls = buildWebsiteCandidates(text(profile.blog))
  for (const url of websiteUrls) {
    try {
      const response = await fetchImpl(url, {
        headers: {
          Accept: 'text/html,application/xhtml+xml',
          'User-Agent': 'kenomi-prospect/1.0',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        signal: AbortSignal.timeout(5000),
      })
      if (!response.ok) continue
      const html = await response.text()
      const websiteEmail = extractPublicEmailFromHtml(html)
      if (websiteEmail) return websiteEmail
    } catch {
      continue
    }
  }

  return null
}

async function asGroundedProspect(
  profile: GithubUserProfile,
  fetchImpl: FetchImpl,
  token: string,
  exclude?: GroundedProspectExclude
): Promise<GroundedProspectOutput | null> {
  const contactEmail = await resolveProfileEmail(profile, fetchImpl, token)
  const sourceUrl = text(profile.html_url)
  const companyName = normalizeCompanyName(profile)
  if (!companyName || !contactEmail || !sourceUrl || !isPublicBusinessEmail(contactEmail)) return null

  const excludedEmails = new Set((exclude?.emails ?? []).map(normalizeKey))
  const excludedSourceUrls = new Set((exclude?.sourceUrls ?? []).map(normalizeKey))
  const excludedCompanyNames = new Set((exclude?.companyNames ?? []).map(normalizeKey))

  if (
    excludedEmails.has(normalizeKey(contactEmail)) ||
    excludedSourceUrls.has(normalizeKey(sourceUrl)) ||
    excludedCompanyNames.has(normalizeKey(companyName))
  ) {
    return null
  }

  const painPoints = painPointsForProfile(profile)
  const scoring = scoreProspect({
    companyName,
    source: 'other',
    signals: [
      text(profile.bio),
      text(profile.company),
      text(profile.blog),
      number(profile.followers) > 1 ? 'public audience' : '',
      number(profile.public_repos) > 2 ? 'active public work' : '',
      profile.hireable ? 'hireable' : '',
    ].filter((value) => value.length > 0),
    fit: fitFromProfile(profile),
    urgency: urgencyFromProfile(profile),
  })

  const outreach = buildProspectOutreach({
    companyName,
    contactName: normalizeContactName(profile) ?? null,
    source: 'other',
    score: scoring.score,
    band: scoring.band,
    painPoints,
    focus: 'prospect',
  })

  return {
    company_name: companyName,
    source: 'other',
    contact_name: normalizeContactName(profile),
    contact_role: normalizeRole(profile),
    contact_email: contactEmail,
    source_url: sourceUrl,
    score: scoring.score,
    band: scoring.band,
    summary: buildSummary(profile, companyName),
    pain_points: painPoints,
    outreach_subject: outreach.subject,
    outreach_body: outreach.body,
    cta: outreach.cta,
  }
}

export async function findGroundedGithubProspect(input: {
  query: string
  fetchImpl?: FetchImpl
  githubToken?: string
  exclude?: GroundedProspectExclude
}): Promise<GroundedProspectOutput | null> {
  const fetchImpl = input.fetchImpl ?? globalThis.fetch?.bind(globalThis)
  if (!fetchImpl) return null

  const token = input.githubToken ?? process.env.GITHUB_TOKEN ?? ''

  for (const query of SEARCH_QUERIES) {
    let search: Record<string, unknown>
    try {
      search = record(await fetchGithubJson(fetchImpl, buildSearchUrl(query), token))
    } catch (error) {
      if (isGithubRequestError(error)) continue
      throw error
    }
    const items = Array.isArray(search.items) ? (search.items as GithubSearchUser[]) : []

    for (const item of items.slice(0, PROFILE_SCAN_LIMIT)) {
      let profile: GithubUserProfile
      try {
        profile = (await fetchGithubJson(fetchImpl, item.url, token)) as GithubUserProfile
      } catch (error) {
        if (isGithubRequestError(error)) continue
        throw error
      }
      const candidate = await asGroundedProspect(profile, fetchImpl, token, input.exclude)
      if (candidate) return candidate
    }
  }

  return null
}
