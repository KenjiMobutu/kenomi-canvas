import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { requireAllowedUser } from '@/lib/auth-server'
import { apiError } from '@/lib/api-response'
import { buildCashOutcomeSnapshot } from '@/lib/studio/cash-outcomes'

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
    const [activities, payments, prospects] = await Promise.all([
      readTable(
        supabase
          .from('prospect_activities')
          .select('type, created_at')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(400)
      ),
      readTable(
        supabase
          .from('payments')
          .select('status, created_at, amount_eur, collected_amount_eur')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(400)
      ),
      readTable(
        supabase
          .from('prospects')
          .select('source, band, pipeline_status, approval_status')
          .eq('user_id', userId)
          .order('updated_at', { ascending: false })
          .limit(400)
      ),
    ])

    return NextResponse.json({
      ok: true,
      outcomes: buildCashOutcomeSnapshot({ activities, payments, prospects }),
    })
  } catch (error) {
    return apiError(
      error instanceof Error ? error.message : 'Impossible de charger les cash outcomes',
      500
    )
  }
}
