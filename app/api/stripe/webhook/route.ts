import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import {
  createStripeClient,
  getStripeWebhookSecret,
} from '@/lib/stripe/server'
import {
  handleStripeWebhookEvent,
  type StripeWebhookSupabase,
} from '@/lib/stripe/webhook-handler'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  const signature = req.headers.get('stripe-signature')
  if (!signature) {
    return NextResponse.json({ error: 'Missing Stripe signature' }, { status: 400 })
  }

  const payload = await req.text()
  let event

  try {
    event = createStripeClient().webhooks.constructEvent(
      payload,
      signature,
      getStripeWebhookSecret()
    )
  } catch {
    return NextResponse.json({ error: 'Invalid Stripe signature' }, { status: 400 })
  }

  const result = await handleStripeWebhookEvent({
    supabase: supabaseAdmin as unknown as StripeWebhookSupabase,
    event,
  })

  return NextResponse.json(result, { status: result.ok ? 200 : 500 })
}
