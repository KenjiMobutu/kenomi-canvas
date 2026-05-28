import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { requireAllowedUser } from '@/lib/auth-server'
import { apiError } from '@/lib/api-response'
import { buildConversionTruthSnapshot } from '@/lib/revenue/conversion-truth'
import { buildWeeklyRevenueReview } from '@/lib/revenue/weekly-review'

type OfferRow = {
  id: string
  name?: string | null
}

type ProspectRow = {
  id: string
  source?: string | null
  band?: string | null
  offer_id?: string | null
  offer_variant?: string | null
  outreach_angle?: string | null
  pipeline_status?: string | null
  created_at?: string | null
}

type ProspectActivityRow = {
  prospect_id?: string | null
  type?: string | null
  created_at?: string | null
}

type ConversationEventRow = {
  prospect_id?: string | null
  event_type?: string | null
  created_at?: string | null
}

async function readTable<T>(
  query: PromiseLike<{ data: T[] | null; error: { message: string } | null }>
): Promise<T[]> {
  const { data, error } = await query
  if (error) throw new Error(error.message)
  return data ?? []
}

async function buildGeneratedReview(supabase: any, userId: string) {
  const [offers, prospects, activities, conversationEvents] = await Promise.all([
    readTable<OfferRow>(
      supabase.from('offers').select('id, name').eq('user_id', userId).order('created_at', {
        ascending: false,
      })
    ),
    readTable<ProspectRow>(
      supabase
        .from('prospects')
        .select('id, source, band, offer_id, offer_variant, outreach_angle, pipeline_status, created_at')
        .eq('user_id', userId)
        .order('updated_at', { ascending: false })
        .limit(500)
    ),
    readTable<ProspectActivityRow>(
      supabase
        .from('prospect_activities')
        .select('prospect_id, type, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(800)
    ),
    readTable<ConversationEventRow>(
      supabase
        .from('prospect_conversation_events')
        .select('prospect_id, event_type, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(800)
    ),
  ])

  return buildWeeklyRevenueReview({
    conversions: buildConversionTruthSnapshot({
      offers,
      prospects,
      activities,
      conversationEvents,
    }),
  })
}

export async function GET() {
  const cookieStore = await cookies()
  const { user, supabase, response } = await requireAllowedUser(cookieStore)
  if (response) return response

  try {
    const userId = user!.id
    const [insights, lastReviewResult] = await Promise.all([
      buildGeneratedReview(supabase, userId),
      supabase
        .from('weekly_revenue_reviews')
        .select('id, week_start, week_end, status, summary_json, created_at')
        .eq('user_id', userId)
        .order('week_start', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ])

    if (lastReviewResult.error) throw new Error(lastReviewResult.error.message)

    const lastReview = lastReviewResult.data
      ? {
          id: lastReviewResult.data.id,
          weekStart: lastReviewResult.data.week_start,
          weekEnd: lastReviewResult.data.week_end,
          status: lastReviewResult.data.status,
          createdAt: lastReviewResult.data.created_at,
          summary: lastReviewResult.data.summary_json,
        }
      : null

    return NextResponse.json({
      ok: true,
      insights,
      lastReview,
    })
  } catch (error) {
    return apiError(
      error instanceof Error ? error.message : 'Impossible de charger les weekly revenue insights',
      500
    )
  }
}

export async function POST() {
  const cookieStore = await cookies()
  const { user, supabase, response } = await requireAllowedUser(cookieStore)
  if (response) return response

  try {
    const userId = user!.id
    const summary = await buildGeneratedReview(supabase, userId)

    const { data, error } = await supabase
      .from('weekly_revenue_reviews')
      .upsert(
        {
          user_id: userId,
          week_start: summary.window.weekStart,
          week_end: summary.window.weekEnd,
          status: 'saved',
          summary_json: summary,
        },
        { onConflict: 'user_id,week_start,week_end' }
      )
      .select('id, week_start, week_end, status, summary_json, created_at')
      .single()

    if (error) throw new Error(error.message)

    return NextResponse.json({
      ok: true,
      review: {
        id: data.id,
        weekStart: data.week_start,
        weekEnd: data.week_end,
        status: data.status,
        createdAt: data.created_at,
        summary: data.summary_json,
      },
    })
  } catch (error) {
    return apiError(
      error instanceof Error ? error.message : 'Impossible d’enregistrer la weekly revenue review',
      500
    )
  }
}
