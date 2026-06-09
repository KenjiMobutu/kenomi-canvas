function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
}

function rot13(value: string): string {
  return value.replace(/[a-zA-Z]/g, (char) => {
    const base = char <= 'Z' ? 65 : 97
    return String.fromCharCode(((char.charCodeAt(0) - base + 13) % 26) + base)
  })
}

function trackingCandidates(value: unknown): string[] {
  const normalized = stringOrNull(value)
  if (!normalized) return []
  const decoded = rot13(normalized)
  return decoded !== normalized ? [normalized, decoded] : [normalized]
}

function domainCandidates(values: string[]): string[] {
  const domains = new Set<string>()
  for (const value of values) {
    if (!value.includes('@')) continue
    const [, domain] = value.split('@')
    const normalized = stringOrNull(domain)?.toLowerCase()
    if (normalized) {
      domains.add(normalized)
    }
  }
  return [...domains]
}

function resolveOutreachAngle(candidates: string[], fallback?: string | null): string | null {
  const normalizedFallback = stringOrNull(fallback)
  if (normalizedFallback && candidates.includes(normalizedFallback)) {
    return normalizedFallback
  }

  const diagnosticCandidate = candidates.find((candidate) =>
    /diagnostic|outbound|follow[_-]?up/i.test(candidate)
  )
  if (diagnosticCandidate) {
    return diagnosticCandidate
  }

  return candidates[0] ?? normalizedFallback ?? null
}

interface QueryBuilder {
  select(columns?: string): QueryBuilder
  eq(field: string, value: unknown): QueryBuilder
  order(field: string, options?: { ascending?: boolean }): QueryBuilder
  limit(count: number): QueryBuilder
  maybeSingle(): Promise<{ data: unknown; error: { message: string } | null }>
  then<TResult1 = { data: unknown; error: { message: string } | null }, TResult2 = never>(
    onfulfilled?:
      | ((value: { data: unknown; error: { message: string } | null }) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): PromiseLike<TResult1 | TResult2>
}

export interface PublicLandingTrackingSupabase {
  from(table: string): QueryBuilder | any
}

interface VentureOwnerRow {
  user_id?: string | null
}

interface ProspectTrackingRow {
  id: string
  contact_email?: string | null
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

async function manyRows<T>(query: QueryBuilder): Promise<T[]> {
  const { data, error } = await query
  if (error) throw new Error(error.message)
  return (data as T[] | null) ?? []
}

export async function resolvePublicLandingTracking(
  input: PublicLandingTrackingInput
): Promise<PublicLandingTrackingResolution> {
  const emailCandidates = trackingCandidates(input.email)
  const prospectIdCandidates = trackingCandidates(input.prospectId)
  const outreachAngleCandidates = trackingCandidates(input.outreachAngle)
  const emailDomains = domainCandidates(emailCandidates)
  const email = emailCandidates[0] ?? null
  const prospectId = prospectIdCandidates[0] ?? null
  const outreachAngle = resolveOutreachAngle(outreachAngleCandidates)

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

  const prospectById = prospectIdCandidates.length
    ? await maybeSingle<ProspectTrackingRow>(
        input.supabase
          .from('prospects')
          .select('id, outreach_angle')
          .eq('id', prospectIdCandidates[0])
          .eq('user_id', userId)
      )
    : null

  const recoveredProspectById =
    !prospectById?.id && prospectIdCandidates.length > 1
      ? await maybeSingle<ProspectTrackingRow>(
          input.supabase
            .from('prospects')
            .select('id, outreach_angle')
            .eq('id', prospectIdCandidates[1])
            .eq('user_id', userId)
        )
      : null

  const resolvedProspectById = prospectById?.id ? prospectById : recoveredProspectById

  if (resolvedProspectById?.id) {
    return {
      prospectId: resolvedProspectById.id,
      email,
      outreachAngle: resolveOutreachAngle(
        outreachAngleCandidates,
        resolvedProspectById.outreach_angle
      ),
    }
  }

  if (!emailCandidates.length) {
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
      .eq('contact_email', emailCandidates[0])
      .order('created_at', { ascending: false })
      .limit(1)
  )

  const prospectByDomain =
    !prospectByEmail?.id && emailDomains.length
      ? (await manyRows<ProspectTrackingRow>(
          input.supabase
            .from('prospects')
            .select('id, contact_email, outreach_angle, created_at')
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
        )).find((row) => {
          const candidateEmail = stringOrNull(row.contact_email)?.toLowerCase()
          return emailDomains.some((domain) => candidateEmail?.endsWith(`@${domain}`) ?? false)
        }) ?? null
      : null

  const recoveredProspectByEmail =
    !prospectByEmail?.id && emailCandidates.length > 1
      ? await maybeSingle<ProspectTrackingRow>(
          input.supabase
            .from('prospects')
            .select('id, outreach_angle')
            .eq('user_id', userId)
            .eq('contact_email', emailCandidates[1])
            .order('created_at', { ascending: false })
            .limit(1)
        )
      : null

  const resolvedProspectByEmail = prospectByEmail?.id
    ? prospectByEmail
    : recoveredProspectByEmail?.id
      ? recoveredProspectByEmail
      : prospectByDomain
  const resolvedEmail =
    resolvedProspectByEmail?.id
      ? stringOrNull(resolvedProspectByEmail.contact_email) ?? emailCandidates[1] ?? email
      : email

  return {
    prospectId: stringOrNull(resolvedProspectByEmail?.id) ?? prospectId,
    email: resolvedEmail,
    outreachAngle: resolveOutreachAngle(
      outreachAngleCandidates,
      resolvedProspectByEmail?.outreach_angle
    ),
  }
}
