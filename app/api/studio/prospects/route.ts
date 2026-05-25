import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAllowedUser } from '@/lib/auth-server'
import type { ProspectBand } from '@/lib/prospect/types'

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
  single(): PromiseLike<{ data: unknown; error: { message: string } | null }>
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

async function single<T>(query: SingleQueryBuilder): Promise<T | null> {
  const { data, error } = await query.single()
  if (error) throw new Error(error.message)
  return data as T | null
}

function summarizeProspects(rows: Array<Record<string, unknown>>) {
  const now = Date.now()
  const initial = {
    hot: 0,
    warm: 0,
    cold: 0,
    readyToContact: 0,
    dueFollowups: 0,
  }
  return rows.reduce<typeof initial>((acc, row) => {
    const band = row.band as ProspectBand | undefined
    const status = typeof row.status === 'string' ? row.status : 'new'
    const nextFollowupAt = typeof row.next_followup_at === 'string' ? row.next_followup_at : null

    if (band === 'hot') acc.hot += 1
    if (band === 'warm') acc.warm += 1
    if (band === 'cold') acc.cold += 1
    if (status === 'ready_to_contact') acc.readyToContact += 1
    if (nextFollowupAt && new Date(nextFollowupAt).getTime() <= now) acc.dueFollowups += 1
    return acc
  }, initial)
}

export async function GET() {
  const cookieStore = await cookies()
  const { user, supabase, response } = await requireAllowedUser(cookieStore)
  if (response) return response

  const [prospects, settings] = await Promise.all([
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
  ])

  const errors = [
    prospects.error && { section: 'prospects', message: prospects.error.message },
    settings.error && { section: 'settings', message: settings.error.message },
  ].filter(Boolean)

  const prospectRows = (prospects.data ?? []) as Array<Record<string, unknown>>
  const enrichedProspects = prospectRows.map((row) => {
    const metadata =
      row.metadata && typeof row.metadata === 'object'
        ? (row.metadata as Record<string, unknown>)
        : {}
    return {
      ...row,
      summary: typeof metadata.summary === 'string' ? metadata.summary : null,
      pain_points: Array.isArray(metadata.pain_points) ? metadata.pain_points : [],
      cta: typeof metadata.cta === 'string' ? metadata.cta : null,
    }
  })
  const summary = summarizeProspects(prospectRows)

  return NextResponse.json(
    {
      ok: errors.length === 0,
      prospects: enrichedProspects,
      settings: settings.data ?? null,
      summary: {
        total: prospectRows.length,
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
        supabase
          .from('prospects')
          .update(row)
          .eq('id', parsed.data.id)
          .eq('user_id', user!.id)
          .select('id')
      )
    : await single<{ id?: string }>(supabase.from('prospects').insert(row).select('id'))

  return NextResponse.json({ ok: true, prospect }, { status: 200 })
}
