import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAllowedUser } from '@/lib/auth-server'
import { buildProspectActivityInsert } from '@/lib/prospect/activity-log'
import { buildProspectViews, summarizeProspects } from '@/lib/prospect/api-view'
import { normalizeProspectTags } from '@/lib/prospect/crm-fields'
import {
  buildProspectFollowUpDraft,
  getNextFollowUpVersion,
  getFollowUpRank,
  scheduleNextFollowUpAt,
} from '@/lib/prospect/follow-up'
import {
  materializeFollowUpDraft,
  type ProspectScheduleSupabase,
  writeProspectMemoryBestEffort,
} from '@/lib/prospect/scheduled-follow-ups'
import {
  buildConversationEventInsert,
  conversationEventTypes,
  summarizeConversationEvents,
  type ProspectConversationEventRow,
} from '@/lib/revenue/objections'
import { deriveMessageMetadata } from '@/lib/revenue/message-truth'
import {
  buildProspectStageActivity,
  buildProspectStagePatch,
} from '@/lib/prospect/stage-transition'
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
      | ((value: {
          data: unknown
          error: { message: string } | null
        }) => TResult1 | PromiseLike<TResult1>)
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
  offer_id: z.string().uuid().nullable().optional(),
  offer_variant: z.string().max(200).nullable().optional(),
  outreach_angle: z.string().max(200).nullable().optional(),
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
  offer_id: z.string().uuid().nullable().optional(),
  offer_variant: z.string().max(200).nullable().optional(),
  outreach_angle: z.string().max(200).nullable().optional(),
  conversation_event_type: z.enum(conversationEventTypes).optional(),
  conversation_event_value: z.string().max(200).nullable().optional(),
  conversation_notes: z.string().max(2000).nullable().optional(),
})

function normalizeProspectStagePayload(input: unknown): unknown {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return input
  const body = input as Record<string, unknown>
  return {
    ...body,
    conversation_event_type: body.conversation_event_type ?? body.conversationEventType,
    conversation_event_value: body.conversation_event_value ?? body.conversationEventValue,
    conversation_notes: body.conversation_notes ?? body.conversationNotes,
  }
}

async function single<T>(query: SingleQueryBuilder): Promise<T | null> {
  const { data, error } = await query.single()
  if (error) throw new Error(error.message)
  return data as T | null
}

async function maybeSingle<T>(query: Pick<SingleQueryBuilder, 'maybeSingle'>): Promise<T | null> {
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

function buildProspectMessageMetadata(input: {
  metadata?: Record<string, unknown>
  outreachAngle?: string | null
  lastOutreachKind?: string | null
  source?: string | null
}) {
  const message = deriveMessageMetadata({
    outreach_angle: input.outreachAngle ?? null,
    last_outreach_kind: input.lastOutreachKind ?? 'initial',
    source: input.source ?? 'other',
    metadata: input.metadata ?? {},
  })
  return {
    ...(input.metadata ?? {}),
    message_family: message.messageFamily,
    message_key: message.messageKey,
    last_outreach_kind: input.lastOutreachKind ?? 'initial',
  }
}

export async function GET(request: Request) {
  const cookieStore = await cookies()
  const { user, supabase, response } = await requireAllowedUser(cookieStore)
  if (response) return response
  const nowIso = new Date().toISOString()

  const url = new URL(request.url)
  const statusFilter = url.searchParams.get('status')
  const bandFilter = url.searchParams.get('band')
  const sourceFilter = url.searchParams.get('source')
  const contactFilter = url.searchParams.get('contact')
  const tagFilter = url.searchParams.get('tag')?.trim().toLowerCase() ?? ''
  const search = url.searchParams.get('q')?.trim().toLowerCase() ?? ''

  const [prospects, settings, actions, approvals, activities, conversationEvents] = await Promise.all([
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
    supabase
      .from('prospect_conversation_events')
      .select('id, prospect_id, user_id, event_type, event_value, notes, created_at')
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
    conversationEvents.error && {
      section: 'conversation_events',
      message: conversationEvents.error.message,
    },
  ].filter(Boolean)

  const prospectRows = (prospects.data ?? []) as Array<Record<string, unknown>>
  const activityRows = (activities.data ?? []) as ProspectActivityRow[]
  const conversationRows = (conversationEvents.data ?? []) as ProspectConversationEventRow[]
  const conversationSummary = summarizeConversationEvents(conversationRows)
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
  const filteredProspects = enrichedProspects
    .filter((prospect) => {
      if (statusFilter && prospect.pipeline_status !== statusFilter) return false
      if (bandFilter && prospect.band !== bandFilter) return false
      if (sourceFilter && prospect.source !== sourceFilter) return false
      if (contactFilter === 'contactable' && prospect.contact_status !== 'contactable') return false
      if (contactFilter === 'missing_contact' && prospect.contact_status !== 'missing_contact') return false
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
    .map((prospect) => {
      const latestConversation = conversationSummary.latestByProspectId[prospect.id]
      return {
        ...prospect,
        latest_conversation_event_type: latestConversation?.eventType ?? null,
        latest_conversation_event_value: latestConversation?.eventValue ?? null,
        latest_conversation_notes: latestConversation?.notes ?? null,
        latest_conversation_at: latestConversation?.createdAt ?? null,
      }
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
      conversation: {
        totalEvents: conversationSummary.totalEvents,
        blockers: conversationSummary.blockers,
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
    offer_id: parsed.data.offer_id ?? null,
    offer_variant: parsed.data.offer_variant?.trim() || null,
    outreach_angle: parsed.data.outreach_angle?.trim() || null,
    last_contacted_at: parsed.data.last_contacted_at ?? null,
    next_followup_at: parsed.data.next_followup_at ?? null,
    metadata: buildProspectMessageMetadata({
      metadata: parsed.data.metadata ?? {},
      outreachAngle: parsed.data.outreach_angle?.trim() || null,
      lastOutreachKind: 'initial',
      source: parsed.data.source,
    }),
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

  const parsed = prospectStageSchema.safeParse(
    normalizeProspectStagePayload(await request.json().catch(() => null))
  )
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
    outreach_angle?: string | null
    outreach_subject?: string | null
    outreach_body?: string | null
  }>(
    asSingleQueryBuilder(
      supabase
        .from('prospects')
        .select(
          'metadata, pipeline_status, status, operator_notes, next_action, tags, next_followup_at, follow_up_count, follow_up_version, last_outreach_kind, company_name, contact_name, contact_email, outreach_angle, outreach_subject, outreach_body' +
            ', source, band'
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
  const currentMetadata =
    current.metadata && typeof current.metadata === 'object'
      ? (current.metadata as Record<string, unknown>)
      : {}
  const activitiesToInsert: Array<{
    type: ProspectActivityType
    detail: string
    metadata?: Record<string, unknown>
  }> = []
  const conversationEventsToInsert: Array<ReturnType<typeof buildConversationEventInsert>> = []

  if (parsed.data.status) {
    const currentKind = asOutreachKind(current.last_outreach_kind)
    const followUpSent = parsed.data.status === 'sent' && currentKind !== 'initial'
    Object.assign(
      patch,
      buildProspectStagePatch({
        currentMetadata: currentMetadata,
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

  if (parsed.data.offer_id !== undefined) {
    patch.offer_id = parsed.data.offer_id
    patch.last_activity_at = nowIso
    activitiesToInsert.push({
      type: 'next_action_updated',
      detail: 'Updated offer assignment',
      metadata: { offer_id: parsed.data.offer_id ?? null },
    })
  }

  if (parsed.data.offer_variant !== undefined) {
    patch.offer_variant = parsed.data.offer_variant?.trim() || null
    patch.last_activity_at = nowIso
    activitiesToInsert.push({
      type: 'next_action_updated',
      detail: 'Updated offer variant',
      metadata: { offer_variant: patch.offer_variant ?? null },
    })
  }

  if (parsed.data.outreach_angle !== undefined) {
    patch.outreach_angle = parsed.data.outreach_angle?.trim() || null
    patch.last_activity_at = nowIso
    activitiesToInsert.push({
      type: 'next_action_updated',
      detail: 'Updated outreach angle',
      metadata: { outreach_angle: patch.outreach_angle ?? null },
    })
  }

  const derivedConversationEventType =
    parsed.data.conversation_event_type ??
    (parsed.data.status === 'won'
      ? 'closed_won'
      : parsed.data.status === 'lost'
        ? 'closed_lost'
        : undefined)

  if (derivedConversationEventType) {
    conversationEventsToInsert.push(
      buildConversationEventInsert({
        prospectId: parsed.data.id,
        userId: user!.id,
        eventType: derivedConversationEventType,
        eventValue: parsed.data.conversation_event_value ?? null,
        notes: parsed.data.conversation_notes ?? null,
        createdAt: nowIso,
      })
    )
    activitiesToInsert.push({
      type: 'conversation_truth_recorded',
      detail: `Recorded ${derivedConversationEventType.replaceAll('_', ' ')}`,
      metadata: {
        event_type: derivedConversationEventType,
        event_value: parsed.data.conversation_event_value?.trim() || null,
      },
    })
  }

  if (parsed.data.action) {
    const currentKind = asOutreachKind(current.last_outreach_kind)
    const currentRank = getFollowUpRank(currentKind)
    if (currentKind === 'initial' || currentRank === 0) {
      return NextResponse.json(
        { error: 'Aucune relance en cours pour ce prospect' },
        { status: 409 }
      )
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
        return NextResponse.json(
          { error: 'Regenerate is reserved for queued follow-ups without approval' },
          { status: 409 }
        )
      }
      const nextVersion = getNextFollowUpVersion({
        currentKind,
        currentVersion: current.follow_up_version,
        targetKind: currentKind,
      })
      const regenerated = buildProspectFollowUpDraft({
        companyName: current.company_name ?? 'Unknown company',
        contactName: current.contact_name ?? null,
        summary: typeof currentMetadata.summary === 'string' ? currentMetadata.summary : null,
        painPoints: Array.isArray(currentMetadata.pain_points)
          ? currentMetadata.pain_points.filter((value): value is string => typeof value === 'string')
          : [],
        previousSubject: current.outreach_subject ?? null,
        operatorNotes: current.operator_notes ?? null,
        kind: currentKind,
      })
      const draftId = await materializeFollowUpDraft({
        supabase: supabase as unknown as ProspectScheduleSupabase,
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

  const nextOutreachKind =
    parsed.data.action === 'regenerate_follow_up' || parsed.data.action === 'mark_follow_up_sent'
      ? asOutreachKind(current.last_outreach_kind)
      : parsed.data.status === 'sent'
        ? asOutreachKind(current.last_outreach_kind)
        : asOutreachKind(current.last_outreach_kind)
  patch.metadata = buildProspectMessageMetadata({
    metadata: {
      ...currentMetadata,
      ...(typeof patch.metadata === 'object' && patch.metadata ? (patch.metadata as Record<string, unknown>) : {}),
    },
    outreachAngle:
      typeof patch.outreach_angle === 'string'
        ? patch.outreach_angle
        : (current.outreach_angle ?? null),
    lastOutreachKind: nextOutreachKind,
    source: current.source ?? 'other',
  })

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

  if (conversationEventsToInsert.length > 0) {
    const { error } = await supabase
      .from('prospect_conversation_events')
      .insert(conversationEventsToInsert)
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
  }

  if (parsed.data.operator_notes !== undefined && parsed.data.operator_notes.trim().length > 0) {
    await writeProspectMemoryBestEffort({
      userId: user!.id,
      prospectId: parsed.data.id,
      companyName: current.company_name ?? 'Unknown company',
      memoryKind: 'operator_note',
      pipelineStatus:
        typeof patch.pipeline_status === 'string'
          ? patch.pipeline_status
          : (current.pipeline_status ?? 'new'),
      band: current.band ?? 'warm',
      source: current.source ?? 'other',
      createdAt: nowIso,
      summary: typeof currentMetadata.summary === 'string' ? currentMetadata.summary : null,
      painPoints: Array.isArray(currentMetadata.pain_points)
        ? currentMetadata.pain_points.filter((value): value is string => typeof value === 'string')
          : [],
      tags: Array.isArray(current.tags)
        ? current.tags.filter((value): value is string => typeof value === 'string')
        : [],
      operatorNote: parsed.data.operator_notes,
    })
  }

  if (
    parsed.data.status === 'replied' ||
    parsed.data.status === 'won' ||
    parsed.data.status === 'lost'
  ) {
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
      summary: typeof currentMetadata.summary === 'string' ? currentMetadata.summary : null,
      painPoints: Array.isArray(currentMetadata.pain_points)
        ? currentMetadata.pain_points.filter((value): value is string => typeof value === 'string')
          : [],
      tags: Array.isArray(current.tags)
        ? current.tags.filter((value): value is string => typeof value === 'string')
        : [],
      result: parsed.data.status,
      outreachKind: current.last_outreach_kind ?? null,
    })
  }

  return NextResponse.json({ ok: true, prospect }, { status: 200 })
}
