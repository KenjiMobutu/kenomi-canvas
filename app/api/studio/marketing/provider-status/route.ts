import { cookies } from 'next/headers'
import { requireAllowedUser } from '@/lib/auth-server'
import { apiOk } from '@/lib/api-response'
import { getMarketingPublisherStatus } from '@/lib/marketing/adapters'
import { getFacelessVideoProviderStatus } from '@/lib/marketing/faceless-video-provider'

export async function GET() {
  const cookieStore = await cookies()
  const { response } = await requireAllowedUser(cookieStore)
  if (response) return response

  return apiOk({
    publisher: getMarketingPublisherStatus(),
    video: getFacelessVideoProviderStatus(),
  })
}
