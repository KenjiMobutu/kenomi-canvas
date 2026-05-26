import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAllowedUser } from '@/lib/auth-server'
import { buildProspectActivityInsert } from '@/lib/prospect/activity-log'
import { buildProspectViews, summarizeProspects } from '@/lib/prospect/api-view'
import { normalizeProspectTags } from '@/lib/prospect/crm-fields'
import { buildProspectStageActivity, buildProspectStagePatch } from '@/lib/prospect/stage-transition'
import type { ProspectActivityRow, ProspectActivityType } from '@/lib/prospect/types'

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
  operator_notes: z.string().max(4000).optional(),
  next_action: z.string().max(1000).optional(),
  tags: z.array(z.string().min(1)).max(20).optional(),
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

export async function GET(request: Request) {
  const cookieStore = await cookies()
  const { user, supabase, response } = await requireAllowedUser(cookieStore)
  if (response) return response

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
      .eq('action_type', 'send_outreach')
      .order('created_at', { ascending: false })
      .limit(200),
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
    operator_notes?: string | null
    next_action?: string | null
    tags?: string[] | null
  }>(
    asSingleQueryBuilder(
      supabase
        .from('prospects')
        .select('metadata, pipeline_status, operator_notes, next_action, tags')
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
    Object.assign(
      patch,
      buildProspectStagePatch({
        currentMetadata: current.metadata ?? {},
        nextStatus: parsed.data.status,
        nowIso,
      })
    )
    const stageActivity = buildProspectStageActivity({ nextStatus: parsed.data.status })
    activitiesToInsert.push({
      type: stageActivity.eventType,
      detail: stageActivity.detail,
      metadata: { pipeline_status: stageActivity.pipelineStatus },
    })
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

  return NextResponse.json({ ok: true, prospect }, { status: 200 })
}
