export interface InboxSyncConfig {
  enabled: boolean
  host: string | null
  port: number | null
  secure: boolean
  username: string | null
  password: string | null
  mailbox: string
}

export type InboxMessageKind = 'bounce' | 'auto_ack' | 'human_reply' | 'ignore'

export interface InboxMessageClassification {
  kind: InboxMessageKind
  prospectEmail: string | null
  reason: string
}

function normalizeEmail(value: string | null | undefined): string | null {
  if (!value) return null
  const match = value.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)
  return match ? match[0].toLowerCase() : null
}

function fallbackImapHost(smtpHost: string | undefined): string | null {
  const host = smtpHost?.trim()
  if (!host) return null
  if (host.startsWith('smtp.')) return `imap.${host.slice('smtp.'.length)}`
  return host
}

export function resolveInboxSyncConfig(
  env: NodeJS.ProcessEnv = process.env
): InboxSyncConfig {
  const username = env.IMAP_USER?.trim() || env.SMTP_USER?.trim() || null
  const password = env.IMAP_PASS?.trim() || env.SMTP_PASS?.trim() || null
  const host = env.IMAP_HOST?.trim() || fallbackImapHost(env.SMTP_HOST) || null
  const port = Number(env.IMAP_PORT?.trim() || '993')

  if (!username || !password || !host) {
    return {
      enabled: false,
      host: null,
      port: null,
      secure: true,
      username: null,
      password: null,
      mailbox: 'INBOX',
    }
  }

  return {
    enabled: true,
    host,
    port: Number.isFinite(port) ? port : 993,
    secure: true,
    username,
    password,
    mailbox: env.IMAP_MAILBOX?.trim() || 'INBOX',
  }
}

export function parseImapSearchIds(raw: string): string[] {
  const match = raw.match(/\* SEARCH\s*([0-9 ]*)/i)
  if (!match) return []
  return match[1]
    .trim()
    .split(/\s+/)
    .filter(Boolean)
}

export function parseMessageHeaders(raw: string): Record<string, string> {
  const unfolded = raw.replace(/\r?\n[ \t]+/g, ' ')
  const result: Record<string, string> = {}
  for (const line of unfolded.split(/\r?\n/)) {
    const separatorIndex = line.indexOf(':')
    if (separatorIndex <= 0) continue
    const key = line.slice(0, separatorIndex).trim().toLowerCase()
    const value = line.slice(separatorIndex + 1).trim()
    if (key) result[key] = value
  }
  return result
}

function extractBounceRecipient(body: string): string | null {
  const patterns = [
    /Final-Recipient:\s*rfc822;\s*([^\s]+)/i,
    /Original-Recipient:\s*rfc822;\s*([^\s]+)/i,
    /wasn't delivered to\s+<?([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})>?/i,
    /<([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})>:\s+Host or domain name not found/i,
  ]

  for (const pattern of patterns) {
    const match = body.match(pattern)
    const email = normalizeEmail(match?.[1] ?? null)
    if (email) return email
  }

  return null
}

export function classifyInboxMessage(input: {
  from?: string | null
  subject?: string | null
  body?: string | null
}): InboxMessageClassification {
  const from = input.from?.trim() ?? ''
  const subject = input.subject?.trim() ?? ''
  const body = input.body?.trim() ?? ''
  const fromEmail = normalizeEmail(from)
  const normalizedSubject = subject.toLowerCase()
  const normalizedBody = body.toLowerCase()

  if (
    normalizedSubject.includes('delivery status notification') ||
    normalizedSubject.includes('undelivered mail returned to sender') ||
    normalizedBody.includes('final-recipient:') ||
    normalizedBody.includes("your message wasn't delivered to") ||
    normalizedBody.includes('address not found')
  ) {
    return {
      kind: 'bounce',
      prospectEmail: extractBounceRecipient(body),
      reason: 'delivery failure detected',
    }
  }

  if (
    normalizedSubject.includes('eingangsbestätigung') ||
    normalizedBody.includes('vielen dank für ihre e-mail') ||
    normalizedBody.includes('ticketnummer') ||
    normalizedBody.includes('fallnummer') ||
    normalizedBody.includes('automatic reply') ||
    normalizedBody.includes('auto reply')
  ) {
    return {
      kind: 'auto_ack',
      prospectEmail: fromEmail,
      reason: 'ticketing or automatic acknowledgement detected',
    }
  }

  if (fromEmail) {
    return {
      kind: 'human_reply',
      prospectEmail: fromEmail,
      reason: 'direct inbox reply detected',
    }
  }

  return {
    kind: 'ignore',
    prospectEmail: null,
    reason: 'no actionable inbox signal detected',
  }
}
