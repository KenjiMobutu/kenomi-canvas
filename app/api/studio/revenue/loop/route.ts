import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { requireAllowedUser } from '@/lib/auth-server'
import { apiError } from '@/lib/api-response'
import { buildRevenueLoopSnapshot } from '@/lib/revenue-loop'
import { filterRowsByVentureIds } from '@/lib/revenue/ownership'

async function readTable<T>(
  query: PromiseLike<{ data: T[] | null; error: { message: string } | null }>
): Promise<T[]> {
  const { data, error } = await query
  if (error) throw new Error(error.message)
  return data ?? []
}

export async function GET() {
  const cookieStore = await cookies()
  const { user, supabase, response } = await requireAllowedUser(cookieStore)
  if (response) return response

  try {
    const userId = user!.id
    const [pipelines, ventures, campaignDrafts, autonomyActions, approvals] = await Promise.all([
      readTable(
        supabase
          .from('venture_pipeline')
          .select('*')
          .eq('user_id', userId)
          .order('updated_at', { ascending: false })
          .limit(50)
      ),
      readTable(
        supabase
          .from('ventures')
          .select('*')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(100)
      ),
      readTable(
        supabase
          .from('campaign_drafts')
          .select('*')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(200)
      ),
      readTable(
        supabase
          .from('autonomy_actions')
          .select('*')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(200)
      ),
      readTable(
        supabase
          .from('human_approvals')
          .select('*')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(200)
      ),
    ])
    const ventureIds = ventures.map((venture) => venture.id)
    const [landingPages, payments, decisions] = await Promise.all([
      readTable(
        supabase
          .from('landing_pages')
          .select('venture_id, statut, health_status')
          .order('created_at', { ascending: false })
          .limit(200)
      ),
      readTable(
        supabase.from('payments').select('*').order('created_at', { ascending: false }).limit(200)
      ),
      readTable(
        supabase
          .from('decisions')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(200)
      ),
    ])

    return NextResponse.json({
      ok: true,
      snapshot: buildRevenueLoopSnapshot({
        pipelines,
        ventures,
        landingPages: filterRowsByVentureIds(landingPages, ventureIds),
        payments: filterRowsByVentureIds(payments, ventureIds),
        campaignDrafts,
        autonomyActions,
        approvals,
        decisions: filterRowsByVentureIds(decisions, ventureIds),
      }),
    })
  } catch (error) {
    return apiError(
      error instanceof Error ? error.message : 'Impossible de charger la revenue loop',
      500
    )
  }
}
