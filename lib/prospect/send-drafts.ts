import { appendProspectActivity } from './activity'
import { buildProspectActivityInsert } from './activity-log'
import { getFollowUpRank, scheduleNextFollowUpAt } from './follow-up'
import {
  resolveEmailDeliveryStatus,
  sendProspectEmail,
  type ProspectEmailSendResult,
} from './email-delivery'

type ProspectRow = {
  id: string
  user_id: string
  company_name: string | null
  contact_email: string | null
  status: string | null
  pipeline_status: string | null
  metadata: Record<string, unknown> | null
}

type CampaignDraftRow = {
  id: string
  user_id: string
  content: string | null
  status: string | null
  metadata: Record<string, unknown> | null
  created_at: string | null
}

type UserSettingsRow = {
  prospect_outreach_email?: string | null
}

type QueryResult<T> = Promise<{ data: T[] | null; error: { message: string } | null }>
type MaybeSingleResult<T> = Promise<{ data: T | null; error: { message: string } | null }>

interface SelectBuilder<TSingle, TMany> extends PromiseLike<{ data: TMany[] | null; error: { message: string } | null }> {
  eq(field: string, value: unknown): SelectBuilder<TSingle, TMany>
  in?(field: string, values: unknown[]): SelectBuilder<TSingle, TMany>
  order?(field: string, options?: { ascending?: boolean }): SelectBuilder<TSingle, TMany>
  limit?(count: number): SelectBuilder<TSingle, TMany>
  maybeSingle(): MaybeSingleResult<TSingle>
}

export interface ProspectDraftSendSupabase {
  from(table: string): {
    select(columns?: string): SelectBuilder<
      UserSettingsRow | ProspectRow | CampaignDraftRow,
      ProspectRow | CampaignDraftRow
    >
    update(patch: Record<string, unknown>): {
      eq(field: string, value: unknown): PromiseLike<{ error: { message: string } | null }>
    }
    insert(row: Record<string, unknown> | Record<string, unknown>[]): PromiseLike<{
      error: { message: string } | null
    }>
  }
}

export interface SendProspectDraftsInput {
  supabase: ProspectDraftSendSupabase
  userId: string
  prospectIds: string[]
  now?: () => Date
  prospectEmailSender?: (input: {
    from: string
    to: string
    subject: string
    text: string
  }) => Promise<ProspectEmailSendResult>
}

export interface SendProspectDraftsResult {
  processed: number
  sent: number
  failed: number
  results: Array<
    | { ok: true; prospectId: string; draftId: string; provider: string; messageId: string | null }
    | { ok: false; prospectId: string; error: string }
  >
}

async function getUserProspectOutreachEmail(input: {
  supabase: ProspectDraftSendSupabase
  userId: string
}): Promise<string | null> {
  const { data, error } = await input.supabase
    .from('user_settings')
    .select('prospect_outreach_email')
    .eq('user_id', input.userId)
    .maybeSingle()

  if (error) throw new Error(error.message)
  const value = (data as UserSettingsRow | null)?.prospect_outreach_email
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function asNonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
}

function asOutreachKind(value: unknown): 'initial' | 'follow_up_1' | 'follow_up_2' | 'follow_up_3' {
  if (value === 'follow_up_1' || value === 'follow_up_2' || value === 'follow_up_3') return value
  return 'initial'
}

async function update(
  query: PromiseLike<{ error: { message: string } | null }>
): Promise<void> {
  const { error } = await query
  if (error) throw new Error(error.message)
}

export async function sendProspectDrafts(
  input: SendProspectDraftsInput
): Promise<SendProspectDraftsResult> {
  const nowIso = (input.now ?? (() => new Date()))().toISOString()
  const prospectIds = [...new Set(input.prospectIds.filter((value) => value.trim().length > 0))]
  if (!prospectIds.length) {
    return { processed: 0, sent: 0, failed: 0, results: [] }
  }

  const providerStatus = resolveEmailDeliveryStatus()
  const fromAddress =
    providerStatus.fromAddress ??
    (await getUserProspectOutreachEmail({ supabase: input.supabase, userId: input.userId }))

  if (!fromAddress) {
    throw new Error('Missing from address for prospect draft delivery')
  }

  const prospectsResult = await input.supabase
    .from('prospects')
    .select('id, user_id, company_name, contact_email, status, pipeline_status, metadata')
    .eq('user_id', input.userId)

  const draftsQuery = input.supabase
    .from('campaign_drafts')
    .select('id, user_id, content, status, metadata, created_at')
    .eq('user_id', input.userId)

  const draftsResult = await (draftsQuery.order
    ? draftsQuery.order('created_at', { ascending: false })
    : draftsQuery)

  if (prospectsResult.error) throw new Error(prospectsResult.error.message)
  if (draftsResult.error) throw new Error(draftsResult.error.message)

  const prospects = ((prospectsResult.data ?? []) as ProspectRow[]).filter((row) =>
    prospectIds.includes(row.id)
  )
  const drafts = (draftsResult.data ?? []) as CampaignDraftRow[]
  const latestDraftByProspectId = new Map<string, CampaignDraftRow>()

  for (const draft of drafts) {
    const metadata = isRecord(draft.metadata) ? draft.metadata : {}
    const draftProspectId = asNonEmptyString(metadata.prospect_id)
    if (!draftProspectId || latestDraftByProspectId.has(draftProspectId)) continue
    if (!prospectIds.includes(draftProspectId)) continue
    latestDraftByProspectId.set(draftProspectId, draft)
  }

  const results: SendProspectDraftsResult['results'] = []

  for (const prospectId of prospectIds) {
    const prospect = prospects.find((row) => row.id === prospectId)
    if (!prospect) {
      results.push({ ok: false, prospectId, error: 'Prospect not found' })
      continue
    }

    const draft = latestDraftByProspectId.get(prospectId)
    if (!draft) {
      results.push({ ok: false, prospectId, error: 'Draft not found' })
      continue
    }

    const metadata = isRecord(draft.metadata) ? draft.metadata : {}
    const subject = asNonEmptyString(metadata.title)
    const to = asNonEmptyString(prospect.contact_email) ?? asNonEmptyString(metadata.to)
    const body = draft.content ?? ''
    const outreachKind = asOutreachKind(metadata.outreach_kind)
    const followUpCount = getFollowUpRank(outreachKind)
    const nextFollowUpAt = scheduleNextFollowUpAt(new Date(nowIso), outreachKind)

    if (!subject || !to || !body.trim()) {
      results.push({ ok: false, prospectId, error: 'Draft missing subject, recipient, or body' })
      continue
    }

    try {
      const delivery = await (input.prospectEmailSender ?? ((message) => sendProspectEmail(message)))(
        {
          from: fromAddress,
          to,
          subject,
          text: body,
        }
      )

      await update(
        input.supabase
          .from('campaign_drafts')
          .update({
            status: 'published',
            published_at: nowIso,
            metadata: {
              ...metadata,
              provider: delivery.provider,
              from: fromAddress,
              delivery_status: 'sent',
              provider_message_id: delivery.messageId,
              delivery_error: null,
            },
            updated_at: nowIso,
          })
          .eq('id', draft.id)
      )

      await update(
        input.supabase
          .from('prospects')
          .update({
            status: outreachKind === 'initial' ? 'sent' : 'follow_up',
            pipeline_status: 'sent',
            draft_provider: delivery.provider,
            draft_external_id: delivery.messageId ?? draft.id,
            draft_created_at: nowIso,
            last_contacted_at: nowIso,
            last_activity_at: nowIso,
            next_followup_at: nextFollowUpAt,
            last_outreach_kind: outreachKind,
            follow_up_count: followUpCount,
            metadata: appendProspectActivity(prospect.metadata, {
              type: 'marked_sent',
              actor: 'operator',
              at: nowIso,
              detail: `Outbound sent via ${delivery.provider}`,
            }),
            updated_at: nowIso,
          })
          .eq('id', prospect.id)
      )

      await update(
        input.supabase.from('prospect_activities').insert(
          buildProspectActivityInsert({
            prospectId: prospect.id,
            userId: input.userId,
            type: 'marked_sent',
            detail: `Outbound sent via ${delivery.provider}`,
            metadata: {
              provider: delivery.provider,
              message_id: delivery.messageId,
              draft_id: draft.id,
            },
            nowIso,
          })
        )
      )

      results.push({
        ok: true,
        prospectId,
        draftId: draft.id,
        provider: delivery.provider,
        messageId: delivery.messageId,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Prospect email delivery failed'
      await update(
        input.supabase
          .from('campaign_drafts')
          .update({
            metadata: {
              ...metadata,
              from: fromAddress,
              delivery_error: message,
            },
            updated_at: nowIso,
          })
          .eq('id', draft.id)
      )
      results.push({ ok: false, prospectId, error: message })
    }
  }

  return {
    processed: results.length,
    sent: results.filter((row) => row.ok).length,
    failed: results.filter((row) => !row.ok).length,
    results,
  }
}
