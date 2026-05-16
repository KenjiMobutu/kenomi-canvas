import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { requireAllowedUser } from '@/lib/auth-server'
import { apiError } from '@/lib/api-response'

export async function GET(req: NextRequest) {
  const cookieStore = await cookies()
  const { user, supabase, response } = await requireAllowedUser(cookieStore)
  if (response) return response

  const workflowId = req.nextUrl.searchParams.get('workflow_id')
  if (!workflowId) return apiError('workflow_id requis', 400)

  // Vérifier ownership du workflow avant de retourner ses runs
  const { data: wf } = await supabase
    .from('automation_workflows')
    .select('id')
    .eq('id', workflowId)
    .eq('user_id', user!.id)
    .maybeSingle()

  if (!wf) return apiError('Not found', 404)

  const { data: runs, error } = await supabase
    .from('automation_runs')
    .select('id, status, http_status, duration_ms, error_message, triggered_at')
    .eq('workflow_id', workflowId)
    .eq('user_id', user!.id)
    .order('triggered_at', { ascending: false })
    .limit(20)

  if (error) return apiError('Erreur serveur', 500)

  return NextResponse.json(runs ?? [])
}
