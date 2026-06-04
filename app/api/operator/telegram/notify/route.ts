import { NextResponse } from 'next/server'
import { z } from 'zod'
import { isTelegramOperatorAuthorized } from '@/lib/hermes-operator/telegram-auth'

const telegramNotifySchema = z.object({
  user_id: z.string().trim().min(1),
  bot_label: z.string().trim().min(1).optional(),
  alerts: z
    .array(
      z.object({
        severity: z.enum(['info', 'warn', 'critical']),
        category: z.string().trim().min(1),
        headline: z.string().trim().min(1),
        detail: z.string().trim().min(1),
        dedupe_key: z.string().trim().min(1),
        payload: z.record(z.string(), z.unknown()).optional(),
      })
    )
    .max(10),
})

export async function POST(request: Request) {
  if (!isTelegramOperatorAuthorized(request.headers)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const parsed = telegramNotifySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid telegram notify payload' }, { status: 400 })
  }

  return NextResponse.json({
    ok: true,
    accepted: parsed.data.alerts.length,
  })
}
