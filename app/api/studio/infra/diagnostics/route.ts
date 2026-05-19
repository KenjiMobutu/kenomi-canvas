import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { requireAllowedUser } from '@/lib/auth-server'
import {
  collectInfraDiagnostics,
  type InfraDiagnosticsSupabase,
} from '@/lib/infra-diagnostics-runner'

export async function GET() {
  const cookieStore = await cookies()
  const { user, supabase, response } = await requireAllowedUser(cookieStore)
  if (response) return response

  const diagnostics = await collectInfraDiagnostics({
    supabase: supabase as unknown as InfraDiagnosticsSupabase,
    userId: user!.id,
  })

  return NextResponse.json(diagnostics, { status: diagnostics.summary.ok ? 200 : 207 })
}
