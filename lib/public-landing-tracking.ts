function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
}

interface QueryBuilder {
  select(columns?: string): QueryBuilder
  eq(field: string, value: unknown): QueryBuilder
  order(field: string, options?: { ascending?: boolean }): QueryBuilder
  limit(count: number): QueryBuilder
  maybeSingle(): Promise<{ data: unknown; error: { message: string } | null }>
}

export interface PublicLandingTrackingSupabase {
  from(table: string): QueryBuilder | any
}

interface VentureOwnerRow {
  user_id?: string | null
}

interface ProspectTrackingRow {
  id: string
  outreach_angle?: string | null
}

export interface PublicLandingTrackingInput {
  supabase: PublicLandingTrackingSupabase
  ventureId: string
  prospectId?: string | null
  email?: string | null
  outreachAngle?: string | null
}

export interface PublicLandingTrackingResolution {
  prospectId: string | null
  email: string | null
  outreachAngle: string | null
}

async function maybeSingle<T>(query: QueryBuilder): Promise<T | null> {
  const { data, error } = await query.maybeSingle()
  if (error) throw new Error(error.message)
  return data as T | null
}

export async function resolvePublicLandingTracking(
  input: PublicLandingTrackingInput
): Promise<PublicLandingTrackingResolution> {
  const email = stringOrNull(input.email)
  const prospectId = stringOrNull(input.prospectId)
  const outreachAngle = stringOrNull(input.outreachAngle)

  const venture = await maybeSingle<VentureOwnerRow>(
    input.supabase.from('ventures').select('user_id').eq('id', input.ventureId)
  )
  const userId = stringOrNull(venture?.user_id)

  if (!userId) {
    return {
      prospectId,
      email,
      outreachAngle,
    }
  }

  const prospectById = prospectId
    ? await maybeSingle<ProspectTrackingRow>(
        input.supabase
          .from('prospects')
          .select('id, outreach_angle')
          .eq('id', prospectId)
          .eq('user_id', userId)
      )
    : null

  if (prospectById?.id) {
    return {
      prospectId: prospectById.id,
      email,
      outreachAngle: outreachAngle ?? stringOrNull(prospectById.outreach_angle),
    }
  }

  if (!email) {
    return {
      prospectId,
      email,
      outreachAngle,
    }
  }

  const prospectByEmail = await maybeSingle<ProspectTrackingRow>(
    input.supabase
      .from('prospects')
      .select('id, outreach_angle')
      .eq('user_id', userId)
      .eq('contact_email', email)
      .order('created_at', { ascending: false })
      .limit(1)
  )

  return {
    prospectId: stringOrNull(prospectByEmail?.id) ?? prospectId,
    email,
    outreachAngle: outreachAngle ?? stringOrNull(prospectByEmail?.outreach_angle),
  }
}
