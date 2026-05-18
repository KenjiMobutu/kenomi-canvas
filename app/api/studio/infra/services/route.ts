import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { requireAllowedUser } from '@/lib/auth-server'
import { getSanitizedInfraServices, DEFAULT_INFRA_SERVICES } from '@/lib/infra-config'

export async function GET() {
  const cookieStore = await cookies()
  const { response } = await requireAllowedUser(cookieStore)
  if (response) return response

  return NextResponse.json({ services: getSanitizedInfraServices(DEFAULT_INFRA_SERVICES) })
}
