import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAllowedUser } from '@/lib/auth-server'
import {
  type BusinessScheduleSupabase,
  ensureBusinessSchedulesForUser,
  runBusinessScheduler,
  updateBusinessSchedule,
  type BusinessScheduleKey,
  type BusinessScheduleStatus,
} from '@/lib/autonomy/scheduler'

const schedulePatchSchema = z.object({
  scheduleKey: z.enum(['scout', 'prospect', 'follow_ups', 'devops']),
  status: z.enum(['active', 'paused']).optional(),
  runNow: z.boolean().optional(),
  intervalMinutes: z.number().int().min(5).max(1440).optional(),
})

function sortSchedules<T extends { schedule_key: BusinessScheduleKey }>(rows: T[]): T[] {
  const order: BusinessScheduleKey[] = ['scout', 'prospect', 'follow_ups', 'devops']
  return [...rows].sort((a, b) => order.indexOf(a.schedule_key) - order.indexOf(b.schedule_key))
}

export async function GET() {
  const cookieStore = await cookies()
  const { user, supabase, response } = await requireAllowedUser(cookieStore)
  if (response) return response

  const schedules = await ensureBusinessSchedulesForUser({
    supabase: supabase as unknown as BusinessScheduleSupabase,
    userId: user!.id,
    now: new Date(),
  })

  return NextResponse.json({
    ok: true,
    schedules: sortSchedules(schedules),
  })
}

export async function PATCH(request: Request) {
  const cookieStore = await cookies()
  const { user, supabase, response } = await requireAllowedUser(cookieStore)
  if (response) return response

  const parsed = schedulePatchSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Payload schedule invalide' }, { status: 400 })
  }

  await ensureBusinessSchedulesForUser({
    supabase: supabase as unknown as BusinessScheduleSupabase,
    userId: user!.id,
    now: new Date(),
  })

  if (
    parsed.data.status !== undefined ||
    parsed.data.intervalMinutes !== undefined ||
    parsed.data.runNow !== true
  ) {
    await updateBusinessSchedule({
      supabase: supabase as unknown as BusinessScheduleSupabase,
      userId: user!.id,
      scheduleKey: parsed.data.scheduleKey,
      now: new Date(),
      status: parsed.data.status as BusinessScheduleStatus | undefined,
      intervalMinutes: parsed.data.intervalMinutes,
      nextRunAt: parsed.data.runNow ? new Date().toISOString() : undefined,
    })
  }

  if (parsed.data.runNow) {
    await runBusinessScheduler({
      supabase: supabase as unknown as BusinessScheduleSupabase,
      now: new Date(),
      limit: 4,
      userId: user!.id,
      scheduleKeys: [parsed.data.scheduleKey as BusinessScheduleKey],
    })
  }

  const schedules = await ensureBusinessSchedulesForUser({
    supabase: supabase as unknown as BusinessScheduleSupabase,
    userId: user!.id,
    now: new Date(),
  })

  return NextResponse.json({
    ok: true,
    schedules: sortSchedules(schedules),
  })
}
