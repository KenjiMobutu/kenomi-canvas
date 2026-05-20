import { cookies } from 'next/headers'
import { type NextRequest } from 'next/server'
import { requireAllowedUser } from '@/lib/auth-server'
import {
  buildScoutSourceStatuses,
  collectFreeScoutSignals,
} from '@/lib/scout/free-sources'
import { apiError, apiOk } from '@/lib/api-response'

export async function GET(request: NextRequest) {
  const cookieStore = await cookies()
  const { response } = await requireAllowedUser(cookieStore)
  if (response) return response

  const query =
    request.nextUrl.searchParams.get('query')?.trim() || 'autopilot revenue micro-SaaS'

  try {
    const collection = await collectFreeScoutSignals({ query })
    return apiOk(buildScoutSourceStatuses(collection, query))
  } catch (error) {
    return apiError(error instanceof Error ? error.message : 'Scout sources unavailable', 500)
  }
}
