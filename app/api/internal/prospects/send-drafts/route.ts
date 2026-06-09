import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { sendProspectDrafts } from '@/lib/prospect/send-drafts'
import { supabaseAdmin } from '@/lib/supabase-admin'

const sendDraftsSchema = z.object({
  user_id: z.string().trim().min(1),
  prospect_ids: z.array(z.string().trim().min(1)).min(1).max(20),
})

function isWorkerAuthorized(request: NextRequest): boolean {
  const secret = process.env.AUTONOMY_WORKER_SECRET
  if (!secret) return false
  return request.headers.get('x-autonomy-worker-token') === secret
}

export async function POST(request: NextRequest) {
  if (!isWorkerAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized worker' }, { status: 401 })
  }

  const parsed = sendDraftsSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Payload send drafts invalide' }, { status: 400 })
  }

  try {
    const result = await sendProspectDrafts({
      supabase: supabaseAdmin as never,
      userId: parsed.data.user_id,
      prospectIds: parsed.data.prospect_ids,
    })

    return NextResponse.json({ ok: result.failed === 0, ...result }, { status: result.failed === 0 ? 200 : 207 })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Draft send failed' },
      { status: 500 }
    )
  }
}
