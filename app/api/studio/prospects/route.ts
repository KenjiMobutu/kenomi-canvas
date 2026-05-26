import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { z } from 'zod'
import { requireAllowedUser } from '@/lib/auth-server'
import {
  formatRetrievedProspectMemories,
  retrieveProspectMemories,
  writeProspectMemory,
} from '@/lib/memory/prospect-memory'
import { buildProspectActivityInsert } from '@/lib/prospect/activity-log'
import { buildProspectViews, summarizeProspects } from '@/lib/prospect/api-view'
import { normalizeProspectTags } from '@/lib/prospect/crm-fields'
import {
  buildProspectFollowUpDraft,
  getNextFollowUpKind,
  getNextFollowUpVersion,
  getFollowUpRank,
  requiresFollowUpApproval,
  scheduleNextFollowUpAt,
  shouldGenerateFollowUp,
} from '@/lib/prospect/follow-up'
import { buildGmailDraftPayload } from '@/lib/prospect/gmail-draft'
import { buildProspectStageActivity, buildProspectStagePatch } from '@/lib/prospect/stage-transition'
import type {
  ProspectActivityRow,
  ProspectActivityType,
  ProspectOutreachKind,
} from '@/lib/prospect/types'

interface QueryBuilder {
  select(columns?: string): QueryBuilder
  eq(field: string, value: unknown): QueryBuilder
  order(field: string, options?: { ascending?: boolean }): QueryBuilder
  limit(count: number): QueryBuilder
  insert(row: Record<string, unknown> | Record<string, unknown>[]): QueryBuilder
  update(row: Record<string, unknown>): QueryBuilder
  maybeSingle(): Promise<{ data: unknown; error: { message: string } | null }>
  single(): Promise<{ data: unknown; error: { message: string } | null }>
  then<TResult1 = { data: unknown; error: { message: string } | null }, TResult2 = never>(
    onfulfilled?:
      | ((value: { data: unknown; error: { message: string } | null }) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): PromiseLike<TResult1 | TResult2>
}

interface SingleQueryBuilder {
  select(columns?: string): SingleQueryBuilder
  eq(field: string, value: unknown): SingleQueryBuilder
  maybeSingle(): PromiseLike<{ data: unknown; error: { message: string } | null }>
  single(): PromiseLike<{ data: unknown; error: { message: string } | null }>
}

function asSingleQueryBuilder(query: unknown): SingleQueryBuilder {
  return query as SingleQueryBuilder
}

const sourceValues = ['linkedin', 'malt', 'upwork', 'indeed', 'reddit', 'other'] as const

const prospectSchema = z.object({
  id: z.string().optional(),
  source: z.enum(sourceValues),
  source_url: z.string().min(1).nullable().optional(),
  company_name: z.string().min(1),
  contact_name: z.string().min(1).nullable().optional(),
  contact_email: z.string().min(3).nullable().optional(),
  contact_role: z.string().min(1).nullable().optional(),
  score: z.number().int().min(0).max(100),
  band: z.enum(['hot', 'warm', 'cold']),
  status: z.string().min(1).optional(),
  outreach_subject: z.string().min(1),
  outreach_body: z.string().min(1),
  crm_record_id: z.string().nullable().optional(),
  last_contacted_at: z.string().nullable().optional(),
  next_followup_at: z.string().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
})

const prospectStageSchema = z.object({
  id: z.string().min(1),
  status: z.enum(['sent', 'replied', 'won', 'lost']).optional(),
  action: z.enum(['mark_follow_up_sent', 'skip_follow_up', 'regenerate_follow_up']).optional(),
  operator_notes: z.string().max(4000).optional(),
  next_action: z.string().max(1000).optional(),
  tags: z.array(z.string().min(1)).max(20).optional(),
  next_followup_at: z.string().nullable().optional(),
})

async function single<T>(query: SingleQueryBuilder): Promise<T | null> {
  const { data, error } = await query.single()
  if (error) throw new Error(error.message)
  return data as T | null
}

async function maybeSingle<T>(
  query: Pick<SingleQueryBuilder, 'maybeSingle'>
): Promise<T | null> {
  const { data, error } = await query.maybeSingle()
  if (error) throw new Error(error.message)
  return data as T | null
}

function groupActivitiesByProspectId(rows: ProspectActivityRow[]) {
  const grouped: Record<string, ProspectActivityRow[]> = {}
  for (const row of rows) {
    if (!grouped[row.prospect_id]) grouped[row.prospect_id] = []
    grouped[row.prospect_id].push(row)
  }
  return grouped
}

function asText(value: unknown) {
  return typeof value === 'string' ? value : null
}

interface ProspectFollowUpRow {
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

function buildFollowUpMemoryQuery(row: ProspectFollowUpRow) {
  const metadata =
    row.metadata && typeof row.metadata === 'object'
      ? (row.metadata as Record<string, unknown>)
      : {}
  const summary = typeof metadata.summary === 'string' ? metadata.summary : ''
  return [row.company_name, summary, row.operator_notes ?? ''].filter(Boolean).join(' ').trim()
}

async function writeProspectMemoryBestEffort(
  input: Parameters<typeof writeProspectMemory>[0]
) {
  try {
    await writeProspectMemory(input)
  } catch (error) {
    console.error('prospect memory write failed', error)
  }
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

async function createFollowUpApproval(input: {
  supabase: Awaited<ReturnType<typeof requireAllowedUser>>['supabase']
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

  if (existingActionError) throw new Error(existingActionError.message)
  const openAction = ((existingActions ?? []) as Array<{ id?: string; input?: Record<string, unknown> | null }>)
    .find((action) => action.input?.prospect_id === input.prospect.id)
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
    .single()

  if (actionError || !actionData?.id) {
    throw new Error(actionError?.message ?? 'Impossible de créer l’action send_follow_up')
  }

  const { error: approvalError } = await input.supabase.from('human_approvals').insert({
    user_id: input.userId,
    action_id: actionData.id,
    status: 'pending',
    approved_by: null,
    approved_at: null,
    reason: null,
    created_at: input.nowIso,
    updated_at: input.nowIso,
  })

  if (approvalError) throw new Error(approvalError.message)
}

async function materializeFollowUpDraft(input: {
  supabase: Awaited<ReturnType<typeof requireAllowedUser>>['supabase']
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

async function processDueProspectFollowUps(input: {
  supabase: Awaited<ReturnType<typeof requireAllowedUser>>['supabase']
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

  const rows = (data ?? []) as ProspectFollowUpRow[]

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
  }
}

export async function GET(request: Request) {
  const cookieStore = await cookies()
  const { user, supabase, response } = await requireAllowedUser(cookieStore)
  if (response) return response
  const nowIso = new Date().toISOString()
  await processDueProspectFollowUps({ supabase, userId: user!.id, nowIso })

  const url = new URL(request.url)
  const statusFilter = url.searchParams.get('status')
  const bandFilter = url.searchParams.get('band')
  const sourceFilter = url.searchParams.get('source')
  const tagFilter = url.searchParams.get('tag')?.trim().toLowerCase() ?? ''
  const search = url.searchParams.get('q')?.trim().toLowerCase() ?? ''

  const [prospects, settings, actions, approvals, activities] = await Promise.all([
    supabase
      .from('prospects')
      .select('*')
      .eq('user_id', user!.id)
      .order('created_at', { ascending: false })
      .limit(100),
    supabase
      .from('user_settings')
      .select('prospect_sources, prospect_outreach_email, prospect_crm_provider')
      .eq('user_id', user!.id)
      .maybeSingle(),
    supabase
      .from('autonomy_actions')
      .select('id, action_type, status, input, created_at')
      .eq('user_id', user!.id)
      .order('created_at', { ascending: false })
      .limit(300),
    supabase
      .from('human_approvals')
      .select('id, action_id, status, created_at, updated_at')
      .eq('user_id', user!.id)
      .order('created_at', { ascending: false })
      .limit(200),
    supabase
      .from('prospect_activities')
      .select('id, prospect_id, user_id, type, detail, metadata, created_at')
      .eq('user_id', user!.id)
      .order('created_at', { ascending: false })
      .limit(500),
  ])

  const errors = [
    prospects.error && { section: 'prospects', message: prospects.error.message },
    settings.error && { section: 'settings', message: settings.error.message },
    actions.error && { section: 'actions', message: actions.error.message },
    approvals.error && { section: 'approvals', message: approvals.error.message },
    activities.error && { section: 'activities', message: activities.error.message },
  ].filter(Boolean)

  const prospectRows = (prospects.data ?? []) as Array<Record<string, unknown>>
  const activityRows = (activities.data ?? []) as ProspectActivityRow[]
  const enrichedProspects = buildProspectViews({
    prospects: prospectRows as Array<{ id: string; [key: string]: unknown }>,
    actions: (actions.data ?? []) as Array<{
      id: string
      action_type?: string | null
      status?: string | null
      input?: Record<string, unknown> | null
      created_at?: string | null
    }>,
    approvals: (approvals.data ?? []) as Array<{
      id: string
      action_id: string
      status?: string | null
      created_at?: string | null
      updated_at?: string | null
    }>,
    activitiesByProspectId: groupActivitiesByProspectId(activityRows),
    nowIso,
  })
  const filteredProspects = enrichedProspects.filter((prospect) => {
    if (statusFilter && prospect.pipeline_status !== statusFilter) return false
    if (bandFilter && prospect.band !== bandFilter) return false
    if (sourceFilter && prospect.source !== sourceFilter) return false
    if (tagFilter && !prospect.tags.includes(tagFilter)) return false
    if (search) {
      const haystack = [
        prospect.company_name,
        asText(prospect.contact_name),
        asText(prospect.summary),
        prospect.operator_notes,
        prospect.next_action,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      if (!haystack.includes(search)) return false
    }
    return true
  })
  const summary = summarizeProspects(filteredProspects)

  return NextResponse.json(
    {
      ok: errors.length === 0,
      prospects: filteredProspects,
      settings: settings.data ?? null,
      summary: {
        total: filteredProspects.length,
        ...summary,
      },
      errors,
    },
    { status: errors.length === 0 ? 200 : 207 }
  )
}

export async function POST(request: Request) {
  const cookieStore = await cookies()
  const { user, supabase, response } = await requireAllowedUser(cookieStore)
  if (response) return response

  const parsed = prospectSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Payload prospect invalide' }, { status: 400 })
  }

  const nowIso = parsed.data.updated_at ?? new Date().toISOString()
  const row = {
    user_id: user!.id,
    source: parsed.data.source,
    source_url: parsed.data.source_url ?? null,
    company_name: parsed.data.company_name,
    contact_name: parsed.data.contact_name ?? null,
    contact_email: parsed.data.contact_email ?? null,
    contact_role: parsed.data.contact_role ?? null,
    score: parsed.data.score,
    band: parsed.data.band,
    status: parsed.data.status ?? 'new',
    outreach_subject: parsed.data.outreach_subject,
    outreach_body: parsed.data.outreach_body,
    crm_record_id: parsed.data.crm_record_id ?? null,
    last_contacted_at: parsed.data.last_contacted_at ?? null,
    next_followup_at: parsed.data.next_followup_at ?? null,
    metadata: parsed.data.metadata ?? {},
    created_at: parsed.data.created_at ?? nowIso,
    updated_at: nowIso,
  }

  const prospect = parsed.data.id
    ? await single<{ id?: string }>(
        asSingleQueryBuilder(
          supabase
            .from('prospects')
            .update(row)
            .eq('id', parsed.data.id)
            .eq('user_id', user!.id)
            .select('id')
        )
      )
    : await single<{ id?: string }>(
        asSingleQueryBuilder(supabase.from('prospects').insert(row).select('id'))
      )

  return NextResponse.json({ ok: true, prospect }, { status: 200 })
}

export async function PATCH(request: Request) {
  const cookieStore = await cookies()
  const { user, supabase, response } = await requireAllowedUser(cookieStore)
  if (response) return response

  const parsed = prospectStageSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Payload transition prospect invalide' }, { status: 400 })
  }

  const current = await maybeSingle<{
    metadata?: Record<string, unknown> | null
    pipeline_status?: string | null
    status?: string | null
    operator_notes?: string | null
    next_action?: string | null
    tags?: string[] | null
    next_followup_at?: string | null
    follow_up_count?: number | null
    follow_up_version?: number | null
    last_outreach_kind?: string | null
    company_name?: string | null
    source?: string | null
    band?: string | null
    contact_name?: string | null
    contact_email?: string | null
    outreach_subject?: string | null
    outreach_body?: string | null
  }>(
    asSingleQueryBuilder(
      supabase
        .from('prospects')
        .select(
          'metadata, pipeline_status, status, operator_notes, next_action, tags, next_followup_at, follow_up_count, follow_up_version, last_outreach_kind, company_name, contact_name, contact_email, outreach_subject, outreach_body'
          + ', source, band'
        )
        .eq('id', parsed.data.id)
        .eq('user_id', user!.id)
    )
  )

  if (!current) {
    return NextResponse.json({ error: 'Prospect introuvable' }, { status: 404 })
  }

  const nowIso = new Date().toISOString()
  const patch: Record<string, unknown> = {
    updated_at: nowIso,
  }
  const activitiesToInsert: Array<{
    type: ProspectActivityType
    detail: string
    metadata?: Record<string, unknown>
  }> = []

  if (parsed.data.status) {
    const currentKind = asOutreachKind(current.last_outreach_kind)
    const followUpSent = parsed.data.status === 'sent' && currentKind !== 'initial'
    Object.assign(
      patch,
      buildProspectStagePatch({
        currentMetadata: current.metadata ?? {},
        nextStatus: parsed.data.status,
        nowIso,
        currentOutreachKind: current.last_outreach_kind,
      })
    )
    const stageActivity = followUpSent
      ? {
          eventType: 'follow_up_marked_sent' as ProspectActivityType,
          detail: `${currentKind} marked sent`,
          pipelineStatus: 'sent',
        }
      : buildProspectStageActivity({ nextStatus: parsed.data.status })
    if (followUpSent) {
      patch.status = 'follow_up'
      patch.follow_up_count = getFollowUpRank(currentKind)
    }
    activitiesToInsert.push({
      type: stageActivity.eventType,
      detail: stageActivity.detail,
      metadata: { pipeline_status: stageActivity.pipelineStatus },
    })
  }

  if (parsed.data.next_followup_at !== undefined) {
    patch.next_followup_at = parsed.data.next_followup_at
  }

  if (parsed.data.operator_notes !== undefined) {
    patch.operator_notes = parsed.data.operator_notes
    patch.last_activity_at = nowIso
    activitiesToInsert.push({
      type: 'note_updated',
      detail: 'Updated operator note',
      metadata: { note: parsed.data.operator_notes },
    })
  }

  if (parsed.data.next_action !== undefined) {
    patch.next_action = parsed.data.next_action
    patch.last_activity_at = nowIso
    activitiesToInsert.push({
      type: 'next_action_updated',
      detail: 'Updated next action',
      metadata: { next_action: parsed.data.next_action },
    })
  }

  if (parsed.data.tags !== undefined) {
    const tags = normalizeProspectTags(parsed.data.tags)
    patch.tags = tags
    patch.last_activity_at = nowIso
    activitiesToInsert.push({
      type: 'tags_updated',
      detail: 'Updated tags',
      metadata: { tags },
    })
  }

  if (parsed.data.action) {
    const currentKind = asOutreachKind(current.last_outreach_kind)
    const currentRank = getFollowUpRank(currentKind)
    if (currentKind === 'initial' || currentRank === 0) {
      return NextResponse.json({ error: 'Aucune relance en cours pour ce prospect' }, { status: 409 })
    }

    if (parsed.data.action === 'mark_follow_up_sent') {
      patch.status = 'follow_up'
      patch.pipeline_status = 'sent'
      patch.last_contacted_at = nowIso
      patch.follow_up_count = currentRank
      patch.next_followup_at = scheduleNextFollowUpAt(new Date(nowIso), currentKind)
      patch.last_activity_at = nowIso
      activitiesToInsert.push({
        type: 'follow_up_marked_sent',
        detail: `${currentKind} marked sent`,
        metadata: {
          outreach_kind: currentKind,
          follow_up_count: currentRank,
          next_followup_at: patch.next_followup_at ?? null,
        },
      })
    }

    if (parsed.data.action === 'skip_follow_up') {
      patch.status = 'follow_up'
      patch.pipeline_status = 'sent'
      patch.next_followup_at = scheduleNextFollowUpAt(new Date(nowIso), currentKind)
      patch.follow_up_count = currentRank
      patch.last_activity_at = nowIso
      activitiesToInsert.push({
        type: 'follow_up_skipped',
        detail: `${currentKind} skipped`,
        metadata: {
          outreach_kind: currentKind,
          follow_up_count: currentRank,
          next_followup_at: patch.next_followup_at ?? null,
        },
      })
    }

    if (parsed.data.action === 'regenerate_follow_up') {
      if (currentKind === 'follow_up_1') {
        return NextResponse.json({ error: 'Regenerate is reserved for queued follow-ups without approval' }, { status: 409 })
      }
      const metadata =
        current.metadata && typeof current.metadata === 'object'
          ? (current.metadata as Record<string, unknown>)
          : {}
      const nextVersion = getNextFollowUpVersion({
        currentKind,
        currentVersion: current.follow_up_version,
        targetKind: currentKind,
      })
      const regenerated = buildProspectFollowUpDraft({
        companyName: current.company_name ?? 'Unknown company',
        contactName: current.contact_name ?? null,
        summary: typeof metadata.summary === 'string' ? metadata.summary : null,
        painPoints: Array.isArray(metadata.pain_points)
          ? metadata.pain_points.filter((value): value is string => typeof value === 'string')
          : [],
        previousSubject: current.outreach_subject ?? null,
        operatorNotes: current.operator_notes ?? null,
        kind: currentKind,
      })
      const draftId = await materializeFollowUpDraft({
        supabase,
        userId: user!.id,
        prospect: {
          id: parsed.data.id,
          company_name: current.company_name ?? 'Unknown company',
          contact_name: current.contact_name ?? null,
          contact_email: current.contact_email ?? null,
        },
        kind: currentKind,
        subject: regenerated.subject,
        body: regenerated.body,
        nowIso,
        followUpVersion: nextVersion,
      })
      patch.outreach_subject = regenerated.subject
      patch.outreach_body = regenerated.body
      patch.pipeline_status = 'follow_up_due'
      patch.last_follow_up_generated_at = nowIso
      patch.follow_up_version = nextVersion
      patch.draft_provider = 'gmail'
      patch.draft_external_id = draftId
      patch.draft_created_at = nowIso
      patch.last_activity_at = nowIso
      activitiesToInsert.push({
        type: 'follow_up_regenerated',
        detail: `${currentKind} regenerated`,
        metadata: { outreach_kind: currentKind, follow_up_version: nextVersion, draft_id: draftId },
      })
      activitiesToInsert.push({
        type: 'gmail_draft_created',
        detail: `Gmail draft ${draftId} created`,
        metadata: { outreach_kind: currentKind, follow_up_version: nextVersion },
      })
    }
  }

  const prospect = await single<{ id?: string }>(
    asSingleQueryBuilder(
      supabase
        .from('prospects')
        .update(patch)
        .eq('id', parsed.data.id)
        .eq('user_id', user!.id)
        .select('id')
    )
  )

  if (activitiesToInsert.length > 0) {
    const insertRows = activitiesToInsert.map((activity) =>
      buildProspectActivityInsert({
        prospectId: parsed.data.id,
        userId: user!.id,
        type: activity.type,
        detail: activity.detail,
        metadata: activity.metadata,
        nowIso,
      })
    )

    const { error } = await supabase.from('prospect_activities').insert(insertRows)
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
  }

  const metadata =
    current.metadata && typeof current.metadata === 'object'
      ? (current.metadata as Record<string, unknown>)
      : {}
  if (parsed.data.operator_notes !== undefined && parsed.data.operator_notes.trim().length > 0) {
    await writeProspectMemoryBestEffort({
      userId: user!.id,
      prospectId: parsed.data.id,
      companyName: current.company_name ?? 'Unknown company',
      memoryKind: 'operator_note',
      pipelineStatus: typeof patch.pipeline_status === 'string' ? patch.pipeline_status : (current.pipeline_status ?? 'new'),
      band: current.band ?? 'warm',
      source: current.source ?? 'other',
      createdAt: nowIso,
      summary: typeof metadata.summary === 'string' ? metadata.summary : null,
      painPoints: Array.isArray(metadata.pain_points)
        ? metadata.pain_points.filter((value): value is string => typeof value === 'string')
        : [],
      tags: Array.isArray(current.tags) ? current.tags.filter((value): value is string => typeof value === 'string') : [],
      operatorNote: parsed.data.operator_notes,
    })
  }

  if (parsed.data.status === 'replied' || parsed.data.status === 'won' || parsed.data.status === 'lost') {
    await writeProspectMemoryBestEffort({
      userId: user!.id,
      prospectId: parsed.data.id,
      companyName: current.company_name ?? 'Unknown company',
      memoryKind:
        parsed.data.status === 'replied'
          ? 'reply_recorded'
          : parsed.data.status === 'won'
            ? 'prospect_won'
            : 'prospect_lost',
      pipelineStatus: parsed.data.status,
      band: current.band ?? 'warm',
      source: current.source ?? 'other',
      createdAt: nowIso,
      summary: typeof metadata.summary === 'string' ? metadata.summary : null,
      painPoints: Array.isArray(metadata.pain_points)
        ? metadata.pain_points.filter((value): value is string => typeof value === 'string')
        : [],
      tags: Array.isArray(current.tags) ? current.tags.filter((value): value is string => typeof value === 'string') : [],
      result: parsed.data.status,
      outreachKind: current.last_outreach_kind ?? null,
    })
  }

  return NextResponse.json({ ok: true, prospect }, { status: 200 })
}
