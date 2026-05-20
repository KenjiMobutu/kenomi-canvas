import { cookies } from 'next/headers'
import { NextRequest } from 'next/server'
import { requireAllowedUser } from '@/lib/auth-server'
import { apiError, apiOk } from '@/lib/api-response'
import { createMarketingBudgetApproval } from '@/lib/marketing/budget-request'

export async function POST(req: NextRequest) {
  const cookieStore = await cookies()
  const { user, supabase, response } = await requireAllowedUser(cookieStore)
  if (response) return response

  let body: { ventureId?: string; amountEur?: number; channel?: string; reason?: string }
  try {
    body = await req.json()
  } catch {
    return apiError('JSON invalide', 400)
  }

  if (!body.ventureId) return apiError('ventureId requis', 400)
  if (!body.channel) return apiError('channel requis', 400)

  try {
    const result = await createMarketingBudgetApproval({
      supabase: supabase as unknown as Parameters<
        typeof createMarketingBudgetApproval
      >[0]['supabase'],
      userId: user!.id,
      ventureId: body.ventureId,
      amountEur: Number(body.amountEur),
      channel: body.channel,
      reason: body.reason,
    })
    return apiOk({ ok: true, ...result })
  } catch (error) {
    return apiError(error instanceof Error ? error.message : 'Budget marketing impossible', 500)
  }
}
