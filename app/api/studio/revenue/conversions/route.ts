import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { requireAllowedUser } from '@/lib/auth-server'
import { apiError } from '@/lib/api-response'
import { buildConversionTruthSnapshot } from '@/lib/revenue/conversion-truth'

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
    const [offers, prospects, activities, conversationEvents] = await Promise.all([
      readTable(
        supabase.from('offers').select('id, name').eq('user_id', userId).order('created_at', {
          ascending: false,
        })
      ),
      readTable(
        supabase
          .from('prospects')
          .select('id, source, band, offer_id, offer_variant, outreach_angle, pipeline_status, created_at')
          .eq('user_id', userId)
          .order('updated_at', { ascending: false })
          .limit(500)
      ),
      readTable(
        supabase
          .from('prospect_activities')
          .select('prospect_id, type, created_at')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(800)
      ),
      readTable(
        supabase
          .from('prospect_conversation_events')
          .select('prospect_id, event_type, created_at')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(800)
      ),
    ])

    return NextResponse.json({
      ok: true,
      conversions: buildConversionTruthSnapshot({
        offers,
        prospects,
        activities,
        conversationEvents,
      }),
    })
  } catch (error) {
    return apiError(
      error instanceof Error ? error.message : 'Impossible de charger la conversion truth',
      500
    )
  }
}
