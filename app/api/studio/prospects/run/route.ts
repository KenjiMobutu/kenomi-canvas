import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAllowedUser } from '@/lib/auth-server'
import { isRateLimited } from '@/lib/rate-limit'
import { apiError } from '@/lib/api-response'

interface QueryBuilder {
  select(columns?: string): QueryBuilder
  eq(field: string, value: unknown): QueryBuilder
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
const focusValues = ['prospect', 'crm', 'reply'] as const

const prospectRunSchema = z.object({
  prompt: z.string().trim().min(1).optional(),
  companyName: z.string().trim().min(1).optional(),
  source: z.enum(sourceValues).optional(),
  contactName: z.string().trim().min(1).optional(),
  contactEmail: z.string().trim().email().optional(),
  contactRole: z.string().trim().min(1).optional(),
  focus: z.enum(focusValues).optional(),
  signals: z.array(z.string().trim().min(1)).optional(),
})

async function single<T>(query: SingleQueryBuilder): Promise<T | null> {
  const { data, error } = await query.single()
  if (error) throw new Error(error.message)
  return data as T | null
}

function buildProspectPrompt(input: z.infer<typeof prospectRunSchema>): string {
  const lines = ['Lance un run Prospect concret et retourne un prospect exploitable.']
  if (input.companyName) lines.push(`Entreprise prioritaire: ${input.companyName}`)
  if (input.source) lines.push(`Source prioritaire: ${input.source}`)
  if (input.contactName) lines.push(`Contact connu: ${input.contactName}`)
  if (input.contactRole) lines.push(`Rôle: ${input.contactRole}`)
  if (input.signals?.length) lines.push(`Signaux détectés: ${input.signals.join(' | ')}`)
  if (input.focus) lines.push(`Focus: ${input.focus}`)
  return input.prompt ?? lines.join('\n')
}

export async function POST(request: Request) {
  const cookieStore = await cookies()
  const { user, supabase, response } = await requireAllowedUser(cookieStore)
  if (response) return response

  if (isRateLimited(`prospect-run:${user!.id}`, { limit: 6, windowMs: 60_000 })) {
    return apiError('Trop de runs Prospect. Réessayez dans une minute.', 429)
  }

  const parsed = prospectRunSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return apiError('Payload Prospect invalide', 400)
  }

  const prompt = buildProspectPrompt(parsed.data)
  const nowIso = new Date().toISOString()

  const job = await single<{ id?: string }>(
    supabase
      .from('autonomy_jobs')
      .insert({
        user_id: user!.id,
        venture_id: null,
        kind: 'run_agent',
        status: 'queued',
        attempt_count: 0,
        next_run_at: nowIso,
        payload: {
          agentId: 'prospect',
          source: parsed.data.source ?? null,
          focus: parsed.data.focus ?? 'prospect',
          prompt,
          input: parsed.data,
        },
        created_at: nowIso,
        updated_at: nowIso,
      })
      .select('id')
  )

  if (!job?.id) {
    return apiError("Impossible de créer le job Prospect", 500)
  }

  return NextResponse.json(
    {
      ok: true,
      jobId: job.id,
      jobStatus: 'queued',
      message: 'Prospect mis en file pour exécution par le worker',
    },
    { status: 202 }
  )
}
