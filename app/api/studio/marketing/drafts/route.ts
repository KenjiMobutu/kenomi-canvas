import { cookies } from 'next/headers'
import { requireAllowedUser } from '@/lib/auth-server'
import { apiError, apiOk } from '@/lib/api-response'

export async function GET() {
  const cookieStore = await cookies()
  const { user, supabase, response } = await requireAllowedUser(cookieStore)
  if (response) return response

  const { data, error } = await supabase
    .from('campaign_drafts')
    .select('id, venture_id, channel, content, status, metadata, created_at, updated_at')
    .eq('user_id', user!.id)
    .order('created_at', { ascending: false })
    .limit(100)

  if (error) return apiError(error.message, 500)
  return apiOk({ drafts: data ?? [] })
}
