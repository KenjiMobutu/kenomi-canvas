import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { requireAllowedUser } from '@/lib/auth-server'
import { apiError } from '@/lib/api-response'
import { isAllowedWebhookUrl } from '@/lib/security'

export async function GET() {
  const cookieStore = await cookies()
  const { user, supabase, response } = await requireAllowedUser(cookieStore)
  if (response) return response

  const { data: settings } = await supabase
    .from('user_settings')
    .select('n8n_base_url, n8n_api_key')
    .eq('user_id', user!.id)
    .maybeSingle()

  const baseUrl = settings?.n8n_base_url?.replace(/\/$/, '')
  if (!baseUrl) return NextResponse.json([])

  if (!isAllowedWebhookUrl(`${baseUrl}/api/v1/workflows`)) {
    return apiError('URL n8n non autorisée', 400)
  }

  try {
    const resp = await fetch(`${baseUrl}/api/v1/workflows?limit=50`, {
      headers: {
        'X-N8N-API-KEY': settings?.n8n_api_key ?? '',
        'Accept': 'application/json',
      },
      signal: AbortSignal.timeout(5000),
    })

    if (!resp.ok) {
      return apiError(`n8n erreur ${resp.status}`, 502)
    }

    const json = await resp.json() as { data?: unknown[] }
    return NextResponse.json(json.data ?? [])
  } catch (e) {
    const msg = e instanceof Error && e.name === 'TimeoutError' ? 'n8n timeout' : 'n8n injoignable'
    return apiError(msg, 502)
  }
}
