import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { requireAllowedUser } from '@/lib/auth-server'
import {
  processDueProspectFollowUps,
  type ProspectScheduleSupabase,
} from '@/lib/prospect/scheduled-follow-ups'

export async function POST() {
  const cookieStore = await cookies()
  const { user, supabase, response } = await requireAllowedUser(cookieStore)
  if (response) return response

  const processed = await processDueProspectFollowUps({
    supabase: supabase as unknown as ProspectScheduleSupabase,
    userId: user!.id,
    nowIso: new Date().toISOString(),
  })

  return NextResponse.json({
    ok: true,
    processed,
  })
}
