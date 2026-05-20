import { cookies } from 'next/headers'
import { requireAllowedUser } from '@/lib/auth-server'
import { apiError } from '@/lib/api-response'

export async function POST() {
  const cookieStore = await cookies()
  const { response } = await requireAllowedUser(cookieStore)
  if (response) return response

  return apiError('client_checkout_public_landing_only', 409)
}
