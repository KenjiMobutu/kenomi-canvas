import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { requireAllowedUser } from '@/lib/auth-server'
import { redactPrivacyExport } from '@/lib/privacy-export'

export async function GET() {
  const cookieStore = await cookies()
  const { user, supabase, response } = await requireAllowedUser(cookieStore)
  if (response) return response

  const [settingsRes, venturesRes, conversationsRes, agentRunsRes] = await Promise.all([
    supabase.from('user_settings').select('*').eq('user_id', user!.id).maybeSingle(),
    supabase.from('ventures').select('id, name, niche, stage, score, created_at').eq('user_id', user!.id),
    supabase.from('conversations').select('id, topic, created_at').eq('user_id', user!.id),
    supabase.from('agent_runs').select('id, agent_id, model, duration_ms, created_at').eq('user_id', user!.id),
  ])

  return NextResponse.json(redactPrivacyExport({
    exported_at: new Date().toISOString(),
    user: { id: user!.id, email: user!.email },
    settings: settingsRes.data,
    ventures: venturesRes.data ?? [],
    conversations: conversationsRes.data ?? [],
    agent_runs: agentRunsRes.data ?? [],
  }))
}
