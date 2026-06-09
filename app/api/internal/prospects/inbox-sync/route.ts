import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { runInboxSync } from '@/lib/prospect/inbox-sync-runner'
import { supabaseAdmin } from '@/lib/supabase-admin'

const inboxSyncSchema = z.object({
  user_id: z.string().trim().min(1),
  limit: z.number().int().min(1).max(50).optional(),
  mark_seen: z.boolean().optional(),
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

  const parsed = inboxSyncSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Payload inbox sync invalide' }, { status: 400 })
  }

  const result = await runInboxSync({
    supabase: supabaseAdmin as never,
    userId: parsed.data.user_id,
    limit: parsed.data.limit,
    markSeen: parsed.data.mark_seen ?? true,
  })

  return NextResponse.json({
    ok: true,
    ...result,
  })
}
