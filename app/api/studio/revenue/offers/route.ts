import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAllowedUser } from '@/lib/auth-server'
import { apiError } from '@/lib/api-response'
import { buildOfferSnapshots, normalizeOfferText, type OfferProspectRow, type OfferRow } from '@/lib/revenue/offers'

async function readTable<T>(
  query: PromiseLike<{ data: T[] | null; error: { message: string } | null }>
): Promise<T[]> {
  const { data, error } = await query
  if (error) throw new Error(error.message)
  return data ?? []
}

const offerSchema = z.object({
  name: z.string().min(1),
  category: z.string().min(1).optional().nullable(),
  target_icp: z.string().min(1).optional().nullable(),
  default_price_eur: z.number().nonnegative().optional().nullable(),
})

export async function GET() {
  const cookieStore = await cookies()
  const { user, supabase, response } = await requireAllowedUser(cookieStore)
  if (response) return response

  try {
    const userId = user!.id
    const [offers, prospects] = await Promise.all([
      readTable(
        supabase
          .from('offers')
          .select('id, name, category, target_icp')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(100)
      ),
      readTable(
        supabase
          .from('prospects')
          .select('offer_id, pipeline_status')
          .eq('user_id', userId)
          .order('updated_at', { ascending: false })
          .limit(500)
      ),
    ])

    return NextResponse.json({
      ok: true,
      offers: buildOfferSnapshots({
        offers: offers as OfferRow[],
        prospects: prospects as OfferProspectRow[],
      }),
    })
  } catch (error) {
    return apiError(
      error instanceof Error ? error.message : 'Impossible de charger les offers revenue',
      500
    )
  }
}

export async function POST(request: Request) {
  const cookieStore = await cookies()
  const { user, supabase, response } = await requireAllowedUser(cookieStore)
  if (response) return response

  const parsed = offerSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return apiError('Payload offer invalide', 400)

  const row = {
    user_id: user!.id,
    name: parsed.data.name.trim(),
    category: normalizeOfferText(parsed.data.category),
    target_icp: normalizeOfferText(parsed.data.target_icp),
    default_price_eur:
      typeof parsed.data.default_price_eur === 'number' ? parsed.data.default_price_eur : null,
  }

  const { data, error } = await supabase.from('offers').insert(row).select('*').single()
  if (error) return apiError(error.message, 500)

  return NextResponse.json({ ok: true, offer: data })
}
