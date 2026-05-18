import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@supabase/supabase-js'
import { requireAllowedUser } from '@/lib/auth-server'

export async function GET() {
  const cookieStore = await cookies()
  const { user, response } = await requireAllowedUser(cookieStore)
  if (response) return response

  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data, error } = await supabaseAdmin
    .from('user_settings')
    .select('claude_api_key, openai_api_key, stripe_secret_key, stripe_webhook_secret')
    .eq('user_id', user!.id)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    has_claude_key: !!data?.claude_api_key,
    has_openai_key: !!data?.openai_api_key,
    has_stripe_secret: !!data?.stripe_secret_key,
    has_stripe_webhook: !!data?.stripe_webhook_secret,
  })
}
