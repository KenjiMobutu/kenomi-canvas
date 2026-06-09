import { connect as tlsConnect, type ConnectionOptions as TlsConnectionOptions, TLSSocket } from 'node:tls'
import { buildProspectActivityInsert } from './activity-log'
import { buildInboxSyncMutations, type InboxMessageLike } from './inbox-sync-processor'
import { parseImapSearchIds, parseMessageHeaders, resolveInboxSyncConfig } from './inbox-sync'
import { buildProspectStageActivity, buildProspectStagePatch } from './stage-transition'

interface ProspectInboxQuery {
  select(columns?: string): ProspectInboxQuery
  update(values: Record<string, unknown>): ProspectInboxQuery
  insert(values: Record<string, unknown> | Array<Record<string, unknown>>): ProspectInboxQuery
  eq(field: string, value: unknown): ProspectInboxQuery
  then<TResult1 = { data: unknown; error: { message: string } | null }, TResult2 = never>(
    onfulfilled?:
      | ((value: { data: unknown; error: { message: string } | null }) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): PromiseLike<TResult1 | TResult2>
}

export interface ProspectInboxSyncSupabase {
  from(table: 'prospects' | 'prospect_activities'): ProspectInboxQuery
}

export interface InboxTransport {
  listUnreadMessages(limit?: number): Promise<InboxMessageLike[]>
  markSeen(messageId: string): Promise<void>
}

export type InboxTransportFactory = (config: {
  host: string
  port: number
  secure: boolean
  username: string
  password: string
  mailbox: string
}) => InboxTransport

export interface InboxSyncResult {
  processed: number
  bounced: number
  autoAcknowledged: number
  replied: number
  ignored: number
}

function appendOperatorNote(current: unknown, note: string) {
  const currentText = typeof current === 'string' ? current.trim() : ''
  if (!currentText) return note
  if (currentText.includes(note)) return currentText
  return `${currentText} | ${note}`
}

function extractFetchLiteral(raw: string): string {
  const marker = raw.match(/\{(\d+)\}\r?\n/)
  if (!marker) return raw
  const full = marker[0]
  const index = raw.indexOf(full)
  if (index < 0) return raw
  const start = index + full.length
  const tail = raw.slice(start)
  const end = tail.search(/\r?\n[A-Z0-9]+ (OK|NO|BAD)/)
  return end >= 0 ? tail.slice(0, end) : tail
}

async function withImapSession<T>(
  config: {
    host: string
    port: number
    secure: boolean
    username: string
    password: string
    mailbox: string
  },
  fn: (session: {
    run(command: string): Promise<string>
  }) => Promise<T>
) {
  const options: TlsConnectionOptions = {
    host: config.host,
    port: config.port,
    rejectUnauthorized: false,
  }

  const socket = await new Promise<TLSSocket>((resolve, reject) => {
    const client = tlsConnect(options, () => resolve(client))
    client.once('error', reject)
  })

  socket.setEncoding('utf8')

  let buffer = ''
  const waitForTagged = (tag: string) =>
    new Promise<string>((resolve, reject) => {
      const onData = (chunk: string) => {
        buffer += chunk
        const regex = new RegExp(`\\r?\\n${tag} (OK|NO|BAD)[^\\r\\n]*`, 'i')
        if (regex.test(buffer)) {
          cleanup()
          const output = buffer
          buffer = ''
          if (new RegExp(`\\r?\\n${tag} OK`, 'i').test(output)) {
            resolve(output)
          } else {
            reject(new Error(output.trim()))
          }
        }
      }
      const onError = (error: Error) => {
        cleanup()
        reject(error)
      }
      const cleanup = () => {
        socket.off('data', onData)
        socket.off('error', onError)
      }
      socket.on('data', onData)
      socket.on('error', onError)
    })

  const run = async (command: string) => {
    const tag = `A${Math.random().toString(36).slice(2, 8).toUpperCase()}`
    socket.write(`${tag} ${command}\r\n`)
    return waitForTagged(tag)
  }

  // drain server greeting
  await new Promise<void>((resolve) => {
    const onData = (chunk: string) => {
      buffer += chunk
      if (/\* OK/i.test(buffer)) {
        socket.off('data', onData)
        buffer = ''
        resolve()
      }
    }
    socket.on('data', onData)
  })

  try {
    await run(`LOGIN ${JSON.stringify(config.username)} ${JSON.stringify(config.password)}`)
    await run(`SELECT ${config.mailbox}`)
    return await fn({ run })
  } finally {
    try {
      await run('LOGOUT')
    } catch {
      // noop
    }
    socket.end()
  }
}

export function createTlsInboxTransport(input: {
  host: string
  port: number
  secure: boolean
  username: string
  password: string
  mailbox?: string
}): InboxTransport {
  return {
    async listUnreadMessages(limit = 10) {
      return withImapSession(
        {
          host: input.host,
          port: input.port,
          secure: input.secure,
          username: input.username,
          password: input.password,
          mailbox: input.mailbox ?? 'INBOX',
        },
        async (session) => {
          const searchRaw = await session.run('SEARCH UNSEEN')
          const ids = parseImapSearchIds(searchRaw).slice(0, limit)
          const messages: InboxMessageLike[] = []

          for (const id of ids) {
            const headerRaw = await session.run(
              `FETCH ${id} BODY.PEEK[HEADER.FIELDS (FROM TO SUBJECT DATE MESSAGE-ID IN-REPLY-TO REFERENCES)]`
            )
            const bodyRaw = await session.run(`FETCH ${id} BODY.PEEK[TEXT]`)
            const headers = parseMessageHeaders(extractFetchLiteral(headerRaw))

            messages.push({
              id,
              from: headers.from ?? null,
              subject: headers.subject ?? null,
              body: extractFetchLiteral(bodyRaw),
            })
          }

          return messages
        }
      )
    },
    async markSeen(messageId: string) {
      await withImapSession(
        {
          host: input.host,
          port: input.port,
          secure: input.secure,
          username: input.username,
          password: input.password,
          mailbox: input.mailbox ?? 'INBOX',
        },
        async (session) => {
          await session.run(`STORE ${messageId} +FLAGS (\\Seen)`)
        }
      )
    },
  }
}

export async function runInboxSync(input: {
  supabase: ProspectInboxSyncSupabase
  userId: string
  now?: Date
  env?: NodeJS.ProcessEnv
  transport?: InboxTransport
  transportFactory?: InboxTransportFactory
  limit?: number
  markSeen?: boolean
}): Promise<InboxSyncResult> {
  const now = input.now ?? new Date()
  const nowIso = now.toISOString()
  const config = resolveInboxSyncConfig(input.env ?? process.env)
  const transport =
    input.transport ??
    (config.enabled && config.host && config.username && config.password
      ? (input.transportFactory ?? createTlsInboxTransport)({
          host: config.host,
          port: config.port ?? 993,
          secure: config.secure,
          username: config.username,
          password: config.password,
          mailbox: config.mailbox,
        })
      : null)

  if (!transport) {
    return { processed: 0, bounced: 0, autoAcknowledged: 0, replied: 0, ignored: 0 }
  }

  const prospectsRes = await input.supabase
    .from('prospects')
    .select(
      'id,user_id,company_name,contact_email,pipeline_status,status,operator_notes,metadata,last_outreach_kind'
    )
    .eq('user_id', input.userId)

  if (prospectsRes.error) throw new Error(prospectsRes.error.message)
  const prospects = Array.isArray(prospectsRes.data) ? prospectsRes.data : []
  const messages = await transport.listUnreadMessages(input.limit ?? 20)
  const { mutations } = buildInboxSyncMutations({
    prospects: prospects as never,
    messages,
    nowIso,
  })

  let bounced = 0
  let autoAcknowledged = 0
  let replied = 0

  const prospectsById = new Map(
    (prospects as Array<Record<string, unknown>>).map((row) => [String(row.id), row])
  )

  for (const mutation of mutations) {
    const current = prospectsById.get(mutation.prospectId)
    if (!current) continue

    let patch: Record<string, unknown>
    let activityType: ReturnType<typeof buildProspectStageActivity>['eventType'] | 'note_updated'
    let activityDetail: string

    if (mutation.nextStatus === 'lost' || mutation.nextStatus === 'replied') {
      patch = buildProspectStagePatch({
        currentMetadata:
          current.metadata && typeof current.metadata === 'object'
            ? (current.metadata as Record<string, unknown>)
            : null,
        nextStatus: mutation.nextStatus,
        nowIso,
        currentOutreachKind:
          typeof current.last_outreach_kind === 'string' ? current.last_outreach_kind : null,
      })
      patch.operator_notes = appendOperatorNote(current.operator_notes, mutation.note)
      const activity = buildProspectStageActivity({ nextStatus: mutation.nextStatus })
      activityType = activity.eventType
      activityDetail = mutation.note
    } else {
      patch = {
        operator_notes: appendOperatorNote(current.operator_notes, mutation.note),
        updated_at: nowIso,
        last_activity_at: nowIso,
      }
      activityType = 'note_updated'
      activityDetail = mutation.note
    }

    const updateRes = await input.supabase
      .from('prospects')
      .update(patch)
      .eq('id', mutation.prospectId)
      .eq('user_id', input.userId)
    if (updateRes.error) throw new Error(updateRes.error.message)

    const activityRes = await input.supabase.from('prospect_activities').insert(
      buildProspectActivityInsert({
        prospectId: mutation.prospectId,
        userId: input.userId,
        type: activityType,
        detail: activityDetail,
        metadata: {
          source: 'inbox_sync',
          message_id: mutation.messageId,
          classification: mutation.classification,
        },
        nowIso,
      })
    )
    if (activityRes.error) throw new Error(activityRes.error.message)

    if (mutation.classification === 'bounce') bounced += 1
    if (mutation.classification === 'auto_ack') autoAcknowledged += 1
    if (mutation.classification === 'human_reply') replied += 1

    if (input.markSeen !== false) {
      await transport.markSeen(mutation.messageId)
    }
  }

  return {
    processed: mutations.length,
    bounced,
    autoAcknowledged,
    replied,
    ignored: Math.max(0, messages.length - mutations.length),
  }
}
