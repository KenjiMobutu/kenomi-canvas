import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { buildProspectActivityInsert } from './activity-log'
import { buildInboxSyncMutations, type InboxMessageLike } from './inbox-sync-processor'
import { parseImapSearchIds, parseMessageHeaders, resolveInboxSyncConfig } from './inbox-sync'
import { buildProspectStageActivity, buildProspectStagePatch } from './stage-transition'

const execFileAsync = promisify(execFile)

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

async function curlImap(url: string, user: string, password: string, args: string[] = []) {
  const { stdout } = await execFileAsync('curl', ['-fsS', '--url', url, '--user', `${user}:${password}`, ...args], {
    maxBuffer: 2 * 1024 * 1024,
  })
  return stdout
}

export function createCurlInboxTransport(input: {
  host: string
  username: string
  password: string
  mailbox?: string
}): InboxTransport {
  const mailbox = input.mailbox ?? 'INBOX'
  const baseUrl = `imaps://${input.host}/${mailbox}`

  return {
    async listUnreadMessages(limit = 10) {
      const searchRaw = await curlImap(baseUrl, input.username, input.password, ['-X', 'SEARCH UNSEEN'])
      const ids = parseImapSearchIds(searchRaw).slice(0, limit)
      const messages: InboxMessageLike[] = []

      for (const id of ids) {
        const headerRaw = await curlImap(
          `${baseUrl}/;MAILINDEX=${id}/;SECTION=HEADER.FIELDS%20(FROM%20TO%20SUBJECT%20DATE%20MESSAGE-ID%20IN-REPLY-TO%20REFERENCES)`,
          input.username,
          input.password
        )
        const bodyRaw = await curlImap(
          `${baseUrl}/;MAILINDEX=${id}/;SECTION=TEXT`,
          input.username,
          input.password
        )
        const headers = parseMessageHeaders(headerRaw)

        messages.push({
          id,
          from: headers.from ?? null,
          subject: headers.subject ?? null,
          body: bodyRaw,
        })
      }

      return messages
    },
    async markSeen(messageId: string) {
      await curlImap(baseUrl, input.username, input.password, ['-X', `STORE ${messageId} +FLAGS (\\Seen)`])
    },
  }
}

export async function runInboxSync(input: {
  supabase: ProspectInboxSyncSupabase
  userId: string
  now?: Date
  env?: NodeJS.ProcessEnv
  transport?: InboxTransport
  limit?: number
  markSeen?: boolean
}): Promise<InboxSyncResult> {
  const now = input.now ?? new Date()
  const nowIso = now.toISOString()
  const config = resolveInboxSyncConfig(input.env ?? process.env)
  const transport =
    input.transport ??
    (config.enabled && config.host && config.username && config.password
      ? createCurlInboxTransport({
          host: config.host,
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
