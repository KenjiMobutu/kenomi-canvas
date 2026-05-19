import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { requireAllowedUser } from '@/lib/auth-server'
import { buildRevenueCadenceStatus } from '@/lib/revenue-cadence'
import { buildAcquisitionRoi, type AcquisitionEventRow } from '@/lib/metrics/acquisition-roi'
import { buildRevenueProofAudit } from '@/lib/revenue-proof'

async function readTable<T>(
  query: PromiseLike<{ data: T[] | null; error: { message: string } | null }>
): Promise<T[]> {
  const { data, error } = await query
  if (error) throw new Error(error.message)
  return data ?? []
}

export async function GET() {
  const { user, supabase, response } = await requireAllowedUser(await cookies())
  if (response) return response

  try {
    const userId = user!.id
    const [events, ventureEvents, payments, campaignDrafts, actions, approvals, decisions] =
      await Promise.all([
        readTable(
          supabase
            .from('agent_events')
            .select('id, event_type, severity, metadata, created_at')
            .eq('user_id', userId)
            .like('event_type', 'revenue.%')
            .order('created_at', { ascending: false })
            .limit(20)
        ),
        readTable<AcquisitionEventRow>(
          supabase
            .from('venture_events')
            .select('venture_id, event_type, value, metadata, occurred_at')
            .eq('user_id', userId)
            .order('occurred_at', { ascending: false })
            .limit(500)
        ),
        readTable(
          supabase
            .from('payments')
            .select('status, provider_status, checkout_url')
            .order('created_at', { ascending: false })
            .limit(200)
        ),
        readTable(
          supabase
            .from('campaign_drafts')
            .select('status, published_at')
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .limit(200)
        ),
        readTable(
          supabase
            .from('autonomy_actions')
            .select('action_type, status')
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .limit(200)
        ),
        readTable(
          supabase
            .from('human_approvals')
            .select('status')
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .limit(200)
        ),
        readTable(
          supabase
            .from('decisions')
            .select('decision, created_at')
            .order('created_at', { ascending: false })
            .limit(1)
        ),
      ])
    const acquisition = buildAcquisitionRoi(ventureEvents)

    return NextResponse.json({
      ok: true,
      events,
      cadence: buildRevenueCadenceStatus({ events }),
      acquisition,
      proof: buildRevenueProofAudit({
        payments,
        campaignDrafts,
        events: ventureEvents,
        actions,
        approvals,
        acquisition,
        latestDecision: decisions[0] ?? null,
      }),
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Audit revenue indisponible' },
      { status: 500 }
    )
  }
}
