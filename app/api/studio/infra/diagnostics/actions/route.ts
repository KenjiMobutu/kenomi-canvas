import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { apiError } from '@/lib/api-response'
import { insertAuditEvent } from '@/lib/audit-log'
import { requireAllowedUser } from '@/lib/auth-server'
import {
  buildDiagnosticActionAudit,
  buildDiagnosticActionResult,
  getDiagnosticActions,
  parseDiagnosticActionRequest,
} from '@/lib/infra-diagnostic-actions'
import {
  collectInfraDiagnostics,
  type InfraDiagnosticsSupabase,
} from '@/lib/infra-diagnostics-runner'
import { isRateLimited } from '@/lib/rate-limit'

export async function POST(request: Request) {
  const cookieStore = await cookies()
  const { user, supabase, response } = await requireAllowedUser(cookieStore)
  if (response) return response

  if (isRateLimited(`infra-diagnostic-action:${user!.id}`, { limit: 12, windowMs: 60_000 })) {
    return apiError('Trop d’actions diagnostic. Reessayez dans une minute.', 429)
  }

  let payload
  try {
    payload = parseDiagnosticActionRequest(await request.json().catch(() => null))
  } catch (error) {
    return apiError(error instanceof Error ? error.message : 'Payload action diagnostic invalide', 400)
  }

  const diagnostics = await collectInfraDiagnostics({
    supabase: supabase as unknown as InfraDiagnosticsSupabase,
    userId: user!.id,
  })
  const target = [...diagnostics.services, diagnostics.proxmox].find(
    (line) => line.id === payload.targetId
  )

  if (!target) return apiError('Service diagnostic introuvable', 404)

  const allowed = getDiagnosticActions(target).some((action) => action.id === payload.action)
  if (!allowed) {
    return apiError('Action non disponible pour ce service dans son état actuel', 409)
  }

  const actionResult = buildDiagnosticActionResult({
    action: payload.action,
    target,
  })
  const audit = buildDiagnosticActionAudit({
    action: payload.action,
    target,
  })

  await insertAuditEvent(supabase, {
    user_id: user!.id,
    event_type: audit.eventType,
    severity: audit.severity,
    metadata: audit.metadata,
  })

  return NextResponse.json({
    ok: true,
    action: actionResult,
    diagnostics,
  })
}
