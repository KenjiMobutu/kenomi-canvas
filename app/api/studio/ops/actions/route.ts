import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { z } from 'zod'
import { insertAuditEvent } from '@/lib/audit-log'
import { apiError } from '@/lib/api-response'
import { requireAllowedUser } from '@/lib/auth-server'
import { isRateLimited } from '@/lib/rate-limit'
import {
  executeOpsAction,
  type ExecuteOpsActionSupabase,
  type OpsActionExecutionType,
} from '@/lib/ops/execute-ops-action'

const opsActionSchema = z.object({
  type: z.enum(['trigger_first_automation', 'run_first_agent', 'refresh_infrastructure']),
})

function statusForResult(result: { ok: boolean; code: string }) {
  if (result.ok) return 200
  if (result.code === 'blocked') return 409
  if (result.code === 'missing_workflow' || result.code === 'missing_agent') return 422
  return 500
}

export async function POST(request: Request) {
  const cookieStore = await cookies()
  const { user, supabase, response } = await requireAllowedUser(cookieStore)
  if (response) return response

  if (isRateLimited(`ops-action:${user!.id}`, { limit: 8, windowMs: 60_000 })) {
    return apiError('Trop d’actions ops. Reessayez dans une minute.', 429)
  }

  const parsed = opsActionSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return apiError('Payload action ops invalide', 400)
  }

  const result = await executeOpsAction({
    type: parsed.data.type as OpsActionExecutionType,
    userId: user!.id,
    supabase: supabase as unknown as ExecuteOpsActionSupabase,
  })

  await insertAuditEvent(supabase, {
    user_id: user!.id,
    event_type: 'ops.action.executed',
    severity: result.ok ? 'info' : result.code === 'blocked' ? 'warn' : 'error',
    metadata: {
      type: parsed.data.type,
      code: result.code,
      repair_href: result.repairHref,
    },
  })

  return NextResponse.json(result, { status: statusForResult(result) })
}
