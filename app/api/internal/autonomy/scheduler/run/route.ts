import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import {
  runBusinessScheduler,
  type BusinessScheduleKey,
  type BusinessScheduleSupabase,
} from '@/lib/autonomy/scheduler'
import { supabaseAdmin } from '@/lib/supabase-admin'

const schedulerSchema = z.object({
  limit: z.number().int().min(1).max(20).optional(),
  user_id: z.string().uuid().optional(),
  schedule_keys: z
    .array(z.enum(['scout', 'prospect', 'follow_ups', 'devops']))
    .min(1)
    .max(4)
    .optional(),
})

function isSchedulerAuthorized(request: NextRequest): boolean {
  const secret = process.env.AUTONOMY_SCHEDULER_SECRET ?? process.env.AUTONOMY_WORKER_SECRET
  if (!secret) return false
  return request.headers.get('x-autonomy-scheduler-token') === secret
}

export async function POST(request: NextRequest) {
  if (!isSchedulerAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized scheduler' }, { status: 401 })
  }

  const parsed = schedulerSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Payload scheduler invalide' }, { status: 400 })
  }

  const report = await runBusinessScheduler({
    supabase: supabaseAdmin as unknown as BusinessScheduleSupabase,
    now: new Date(),
    limit: parsed.data.limit ?? 10,
    userId: parsed.data.user_id,
    scheduleKeys: parsed.data.schedule_keys as BusinessScheduleKey[] | undefined,
  })

  return NextResponse.json({
    ok: true,
    enqueued: report.filter((item) => item.status === 'enqueued').length,
    report,
  })
}
