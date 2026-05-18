export const VENTURE_EVENT_TYPES = [
  'page_view',
  'cta_click',
  'waitlist_signup',
  'checkout_started',
  'payment_succeeded',
  'campaign_published',
  'decision',
] as const

export type VentureEventType = (typeof VENTURE_EVENT_TYPES)[number]

export interface VentureEventInput {
  userId: string
  ventureId: string
  eventType: VentureEventType
  source?: string
  value?: number | null
  metadata?: Record<string, unknown>
  occurredAt?: Date
}

export interface PublicVentureEventInput {
  slug: string
  eventType: VentureEventType
  source?: string
  value?: number | null
  metadata?: Record<string, unknown>
  occurredAt?: Date
}

interface VentureLookup {
  id: string
  user_id: string
}

interface QueryBuilder {
  select(columns?: string): QueryBuilder
  eq(field: string, value: unknown): QueryBuilder
  maybeSingle(): Promise<{ data: unknown; error: { message: string } | null }>
  insert(row: Record<string, unknown>): Promise<{ error: { message: string } | null }>
}

export interface VentureEventSupabase {
  from(table: string): QueryBuilder
}

export function isVentureEventType(value: string): value is VentureEventType {
  return VENTURE_EVENT_TYPES.includes(value as VentureEventType)
}

export function buildVentureEventInsert(input: VentureEventInput): Record<string, unknown> {
  return {
    user_id: input.userId,
    venture_id: input.ventureId,
    event_type: input.eventType,
    source: input.source ?? 'kenomi',
    value: input.value ?? null,
    metadata: input.metadata ?? {},
    occurred_at: (input.occurredAt ?? new Date()).toISOString(),
  }
}

export async function recordVentureEventBySlug(
  supabase: VentureEventSupabase,
  input: PublicVentureEventInput
): Promise<{ ok: true; ventureId: string } | { ok: false; error: string }> {
  const { data, error } = await supabase
    .from('ventures')
    .select('id, user_id')
    .eq('slug', input.slug)
    .maybeSingle()

  if (error) return { ok: false, error: error.message }
  const venture = data as VentureLookup | null
  if (!venture) return { ok: false, error: 'venture_not_found' }

  const insert = await supabase.from('venture_events').insert(
    buildVentureEventInsert({
      userId: venture.user_id,
      ventureId: venture.id,
      eventType: input.eventType,
      source: input.source,
      value: input.value,
      metadata: input.metadata,
      occurredAt: input.occurredAt,
    })
  )

  if (insert.error) return { ok: false, error: insert.error.message }
  return { ok: true, ventureId: venture.id }
}

export async function recordVentureEventBySlugSafely(
  supabase: VentureEventSupabase,
  input: PublicVentureEventInput
): Promise<void> {
  try {
    const result = await recordVentureEventBySlug(supabase, input)
    if (!result.ok) console.warn('[venture-events]', result.error)
  } catch (error) {
    console.warn('[venture-events]', error instanceof Error ? error.message : String(error))
  }
}
