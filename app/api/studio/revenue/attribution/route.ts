import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { requireAllowedUser } from '@/lib/auth-server'
import { apiError } from '@/lib/api-response'
import { buildCashAttributionSnapshot } from '@/lib/revenue/cash-attribution'

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
    const rows = await readTable(
      supabase
        .from('payment_attributions')
        .select(
          'checkout_session_id, stripe_payment_intent_id, prospect_id, offer_id, offer_variant, outreach_angle, source, band, amount_eur, currency, payment_status, attribution_status, confidence_score, attributed_at'
        )
        .eq('user_id', user!.id)
        .order('attributed_at', { ascending: false })
        .limit(400)
    )

    return NextResponse.json({
      ok: true,
      attribution: buildCashAttributionSnapshot({ rows }),
    })
  } catch (error) {
    return apiError(
      error instanceof Error ? error.message : "Impossible de charger l'attribution cash",
      500
    )
  }
}
