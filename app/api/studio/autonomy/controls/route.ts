import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAllowedUser } from '@/lib/auth-server'
import { getAutonomyConfig } from '@/lib/autonomy/config'
import {
  ensureAutonomyControlForUser,
  updateAutonomyControlForUser,
  type AutonomyControlSupabase,
} from '@/lib/autonomy/controls'

const controlPatchSchema = z.object({
  status: z.enum(['active', 'paused']).optional(),
  reason: z.string().trim().max(500).nullable().optional(),
  maxSchedulerJobsPerRun: z.number().int().min(1).max(20).optional(),
  maxWorkerJobsPerDrain: z.number().int().min(1).max(10).optional(),
})

async function getBacklogCounts(supabase: unknown, userId: string) {
  const client = supabase as {
    from(table: string): {
      select(columns?: string): {
        eq(
          field: string,
          value: unknown
        ): {
          in(
            field: string,
            values: unknown[]
          ): {
            limit(count: number): Promise<{
              data: Array<{ status?: string }> | null
              error: { message: string } | null
            }>
          }
        }
      }
    }
  }

  const { data, error } = await client
    .from('autonomy_jobs')
    .select('status')
    .eq('user_id', userId)
    .in('status', ['queued', 'running', 'failed'])
    .limit(500)

  if (error) throw new Error(error.message)

  return (data ?? []).reduce(
    (counts, row) => {
      if (row.status === 'queued') counts.queued += 1
      if (row.status === 'running') counts.running += 1
      if (row.status === 'failed') counts.failed += 1
      return counts
    },
    { queued: 0, running: 0, failed: 0 }
  )
}

export async function GET() {
  const cookieStore = await cookies()
  const { user, supabase, response } = await requireAllowedUser(cookieStore)
  if (response) return response

  const [control, backlog] = await Promise.all([
    ensureAutonomyControlForUser({
      supabase: supabase as unknown as AutonomyControlSupabase,
      userId: user!.id,
      now: new Date(),
    }),
    getBacklogCounts(supabase, user!.id),
  ])

  return NextResponse.json({
    ok: true,
    control,
    backlog,
    env: getAutonomyConfig(),
  })
}

export async function PATCH(request: Request) {
  const cookieStore = await cookies()
  const { user, supabase, response } = await requireAllowedUser(cookieStore)
  if (response) return response

  const parsed = controlPatchSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Payload contrôle autonomie invalide' }, { status: 400 })
  }

  const control = await updateAutonomyControlForUser({
    supabase: supabase as unknown as AutonomyControlSupabase,
    userId: user!.id,
    now: new Date(),
    status: parsed.data.status,
    reason: parsed.data.reason,
    maxSchedulerJobsPerRun: parsed.data.maxSchedulerJobsPerRun,
    maxWorkerJobsPerDrain: parsed.data.maxWorkerJobsPerDrain,
  })
  const backlog = await getBacklogCounts(supabase, user!.id)

  return NextResponse.json({
    ok: true,
    control,
    backlog,
    env: getAutonomyConfig(),
  })
}
