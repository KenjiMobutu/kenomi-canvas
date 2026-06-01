import { randomUUID } from 'crypto'
import {
  formatRetrievedProspectMemories,
  retrieveProspectMemories,
  writeProspectMemory,
} from '@/lib/memory/prospect-memory'
import { buildProspectActivityInsert } from '@/lib/prospect/activity-log'
import {
  buildProspectFollowUpDraft,
  getNextFollowUpKind,
  getNextFollowUpVersion,
  getFollowUpRank,
  requiresFollowUpApproval,
  shouldGenerateFollowUp,
} from '@/lib/prospect/follow-up'
import { buildGmailDraftPayload } from '@/lib/prospect/gmail-draft'
import type { ProspectOutreachKind } from '@/lib/prospect/types'

interface QueryBuilder {
  select(columns?: string): QueryBuilder
  eq(field: string, value: unknown): QueryBuilder
  order(field: string, options?: { ascending?: boolean }): QueryBuilder
  limit(count: number): QueryBuilder
  insert(row: Record<string, unknown> | Record<string, unknown>[]): QueryBuilder
  update(row: Record<string, unknown>): QueryBuilder
  maybeSingle(): Promise<{ data: unknown; error: { message: string } | null }>
  then<TResult1 = { data: unknown; error: { message: string } | null }, TResult2 = never>(
    onfulfilled?:
      | ((value: { data: unknown; error: { message: string } | null }) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): PromiseLike<TResult1 | TResult2>
}

export interface ProspectScheduleSupabase {
  from(table: string): QueryBuilder
}

export interface ProspectFollowUpRow {
  id: string
  company_name: string
  source?: string | null
  band?: string | null
  tags?: string[] | null
  contact_name?: string | null
  contact_email?: string | null
  outreach_subject?: string | null
  outreach_body?: string | null
  summary?: string | null
  operator_notes?: string | null
  pain_points?: string[]
  metadata?: Record<string, unknown> | null
  pipeline_status?: string | null
  next_followup_at?: string | null
  follow_up_count?: number | null
  follow_up_version?: number | null
  last_outreach_kind?: string | null
}

function asOutreachKind(value: unknown): ProspectOutreachKind {
  switch (value) {
    case 'follow_up_1':
    case 'follow_up_2':
    case 'follow_up_3':
      return value
    default:
      return 'initial'
  }
}

function buildFollowUpMemoryQuery(row: ProspectFollowUpRow) {
  const metadata =
    row.metadata && typeof row.metadata === 'object'
      ? (row.metadata as Record<string, unknown>)
      : {}
  const summary = typeof metadata.summary === 'string' ? metadata.summary : ''
  return [row.company_name, summary, row.operator_notes ?? ''].filter(Boolean).join(' ').trim()
}

export async function writeProspectMemoryBestEffort(input: Parameters<typeof writeProspectMemory>[0]) {
  try {
    await writeProspectMemory(input)
  } catch (error) {
    console.error('prospect memory write failed', error)
  }
}

async function createFollowUpApproval(input: {
  supabase: ProspectScheduleSupabase
  userId: string
  prospect: ProspectFollowUpRow
  kind: ProspectOutreachKind
  subject: string
  body: string
  nowIso: string
  followUpVersion: number
}) {
  const { data: existingActions, error: existingActionError } = await input.supabase
    .from('autonomy_actions')
    .select('id, input, status, action_type')
    .eq('user_id', input.userId)
    .eq('action_type', 'send_follow_up')
    .eq('status', 'blocked')
    .order('created_at', { ascending: false })
    .limit(100)

  if (existingActionError) throw new Error(existingActionError.message)
  const actions = Array.isArray(existingActions) ? existingActions : existingActions ? [existingActions] : []
  const openAction = (actions as Array<{ id?: string; input?: Record<string, unknown> | null }>).find(
    (action) => action.input?.prospect_id === input.prospect.id
  )
  if (openAction?.id) return

  const { data: actionData, error: actionError } = await input.supabase
    .from('autonomy_actions')
    .insert({
      user_id: input.userId,
      venture_id: null,
      action_type: 'send_follow_up',
      risk_level: 'medium',
      status: 'blocked',
      input: {
        prospect_id: input.prospect.id,
        channel: 'email',
        company_name: input.prospect.company_name,
        contact_name: input.prospect.contact_name ?? null,
        outreach_subject: input.subject,
        outreach_body: input.body,
        outreach_kind: input.kind,
        follow_up_count: getFollowUpRank(input.kind),
        follow_up_version: input.followUpVersion,
      },
      output: {},
      created_at: input.nowIso,
      updated_at: input.nowIso,
    })
    .select('id')
    .maybeSingle()

  const insertedAction = actionData as { id?: string } | null
  if (actionError || !insertedAction?.id) {
    throw new Error(actionError?.message ?? 'Impossible de créer l’action send_follow_up')
  }

  const { error: approvalError } = await input.supabase.from('human_approvals').insert({
    user_id: input.userId,
    action_id: insertedAction.id,
    status: 'pending',
    approved_by: null,
    approved_at: null,
    reason: null,
    created_at: input.nowIso,
    updated_at: input.nowIso,
  })

  if (approvalError) throw new Error(approvalError.message)
}

export async function materializeFollowUpDraft(input: {
  supabase: ProspectScheduleSupabase
  userId: string
  prospect: ProspectFollowUpRow
  kind: ProspectOutreachKind
  subject: string
  body: string
  nowIso: string
  followUpVersion: number
}) {
  const draftId = randomUUID()
  const draft = buildGmailDraftPayload({
    prospectId: input.prospect.id,
    companyName: input.prospect.company_name,
    contactName: input.prospect.contact_name ?? null,
    to: input.prospect.contact_email ?? null,
    subject: input.subject,
    body: input.body,
    outreachKind: input.kind,
    followUpCount: getFollowUpRank(input.kind),
    followUpVersion: input.followUpVersion,
  })

  const { error } = await input.supabase.from('campaign_drafts').insert({
    id: draftId,
    user_id: input.userId,
    venture_id: null,
    channel: draft.channel,
    content: draft.content,
    status: draft.status,
    metadata: {
      ...draft.metadata,
      provider: draft.provider,
    },
    created_at: input.nowIso,
    updated_at: input.nowIso,
  })

  if (error) throw new Error(error.message)
  return draftId
}

export async function processDueProspectFollowUps(input: {
  supabase: ProspectScheduleSupabase
  userId: string
  nowIso: string
}) {
  const { data, error } = await input.supabase
    .from('prospects')
    .select(
      'id, company_name, source, band, contact_name, contact_email, outreach_subject, outreach_body, pipeline_status, next_followup_at, follow_up_count, follow_up_version, last_outreach_kind, operator_notes, metadata, tags'
    )
    .eq('user_id', input.userId)
    .order('next_followup_at', { ascending: true })
    .limit(100)

  if (error) throw new Error(error.message)

  const rows = ((data ?? []) as ProspectFollowUpRow[])
  let processed = 0

  for (const row of rows) {
    if (!shouldGenerateFollowUp({ ...row, nowIso: input.nowIso })) continue

    const metadata =
      row.metadata && typeof row.metadata === 'object'
        ? (row.metadata as Record<string, unknown>)
        : {}
    const kind = getNextFollowUpKind(row.follow_up_count ?? 0)
    if (!kind) continue

    const followUpVersion = getNextFollowUpVersion({
      currentKind: row.last_outreach_kind,
      currentVersion: row.follow_up_version,
      targetKind: kind,
    })
    const memoryContext = formatRetrievedProspectMemories(
      await retrieveProspectMemories({
        userId: input.userId,
        query: buildFollowUpMemoryQuery(row),
        limit: 3,
      })
    )
    const draft = buildProspectFollowUpDraft({
      companyName: row.company_name,
      contactName: row.contact_name ?? null,
      summary: typeof metadata.summary === 'string' ? metadata.summary : null,
      painPoints: Array.isArray(metadata.pain_points)
        ? metadata.pain_points.filter((value): value is string => typeof value === 'string')
        : [],
      previousSubject: row.outreach_subject ?? null,
      operatorNotes: [row.operator_notes ?? '', memoryContext].filter(Boolean).join('\n\n') || null,
      kind,
    })

    let draftId: string | null = null
    const approvalRequired = requiresFollowUpApproval(kind)
    if (!approvalRequired) {
      draftId = await materializeFollowUpDraft({
        supabase: input.supabase,
        userId: input.userId,
        prospect: row,
        kind,
        subject: draft.subject,
        body: draft.body,
        nowIso: input.nowIso,
        followUpVersion,
      })
    }

    const patch: Record<string, unknown> = {
      outreach_subject: draft.subject,
      outreach_body: draft.body,
      pipeline_status: approvalRequired ? 'awaiting_approval' : 'follow_up_due',
      last_outreach_kind: kind,
      last_follow_up_generated_at: input.nowIso,
      follow_up_version: followUpVersion,
      last_activity_at: input.nowIso,
      updated_at: input.nowIso,
    }
    if (draftId) {
      patch.draft_provider = 'gmail'
      patch.draft_external_id = draftId
      patch.draft_created_at = input.nowIso
    }

    const { error: updateError } = await input.supabase
      .from('prospects')
      .update(patch)
      .eq('id', row.id)
      .eq('user_id', input.userId)
    if (updateError) throw new Error(updateError.message)

    const activityRows = [
      buildProspectActivityInsert({
        prospectId: row.id,
        userId: input.userId,
        type: 'follow_up_generated',
        detail: `${kind} draft generated`,
        metadata: { outreach_kind: kind, follow_up_version: followUpVersion, approval_required: approvalRequired },
        nowIso: input.nowIso,
      }),
    ]
    if (approvalRequired) {
      activityRows.push(
        buildProspectActivityInsert({
          prospectId: row.id,
          userId: input.userId,
          type: 'approval_created',
          detail: 'send_follow_up approval created',
          metadata: { outreach_kind: kind, follow_up_version: followUpVersion },
          nowIso: input.nowIso,
        })
      )
    } else {
      activityRows.push(
        buildProspectActivityInsert({
          prospectId: row.id,
          userId: input.userId,
          type: 'gmail_draft_created',
          detail: `Gmail draft ${draftId} created`,
          metadata: { outreach_kind: kind, follow_up_version: followUpVersion },
          nowIso: input.nowIso,
        })
      )
    }
    const { error: activityError } = await input.supabase.from('prospect_activities').insert(activityRows)
    if (activityError) throw new Error(activityError.message)

    if (approvalRequired) {
      await createFollowUpApproval({
        supabase: input.supabase,
        userId: input.userId,
        prospect: row,
        kind,
        subject: draft.subject,
        body: draft.body,
        nowIso: input.nowIso,
        followUpVersion,
      })
    }

    await writeProspectMemoryBestEffort({
      userId: input.userId,
      prospectId: row.id,
      companyName: row.company_name,
      memoryKind: 'follow_up_generated',
      pipelineStatus: approvalRequired ? 'awaiting_approval' : 'follow_up_due',
      band: row.band ?? 'warm',
      source: row.source ?? 'other',
      createdAt: input.nowIso,
      summary: typeof metadata.summary === 'string' ? metadata.summary : null,
      painPoints: Array.isArray(metadata.pain_points)
        ? metadata.pain_points.filter((value): value is string => typeof value === 'string')
        : [],
      tags: Array.isArray(row.tags) ? row.tags.filter((value): value is string => typeof value === 'string') : [],
      outreachKind: kind,
    })

    processed += 1
  }

  return { processed }
}
