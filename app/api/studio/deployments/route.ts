import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import { requiresApproval } from '@/lib/autonomy/policy'
import { requireAllowedUser } from '@/lib/auth-server'
import { apiError } from '@/lib/api-response'
import { isRateLimited } from '@/lib/rate-limit'
import { createCoolifyClient } from '@/lib/coolify/client'
import {
  buildDeployAutonomyAction,
  getDeployEnvironment,
  parseDeployRequest,
} from '@/lib/deployments/deploy-action'

export async function POST(req: NextRequest) {
  const cookieStore = await cookies()
  const { user, supabase, response } = await requireAllowedUser(cookieStore)
  if (response) return response

  if (isRateLimited(`deploy-action:${user!.id}`, { limit: 10, windowMs: 60_000 })) {
    return apiError('Trop de demandes de déploiement. Réessayez dans une minute.', 429)
  }

  let deployRequest
  try {
    deployRequest = parseDeployRequest(await req.json())
  } catch {
    return apiError('Payload déploiement invalide', 400)
  }

  const environment = getDeployEnvironment()
  const actionPolicy = buildDeployAutonomyAction({ environment })
  const approvalRequired = requiresApproval(actionPolicy)
  const nowIso = new Date().toISOString()

  const { data: action, error: actionError } = await supabase
    .from('autonomy_actions')
    .insert({
      user_id: user!.id,
      venture_id: deployRequest.ventureId,
      action_type: 'deploy',
      risk_level: actionPolicy.riskLevel,
      status: approvalRequired ? 'blocked' : 'running',
      input: {
        ...deployRequest,
        environment,
      },
      output: {},
      created_at: nowIso,
      updated_at: nowIso,
    })
    .select('id')
    .single()

  if (actionError || !action?.id) {
    return apiError(actionError?.message ?? "Impossible de créer l'action deploy", 500)
  }

  if (approvalRequired) {
    const { error: approvalError } = await supabase.from('human_approvals').insert({
      user_id: user!.id,
      action_id: action.id,
      status: 'pending',
      reason: 'Déploiement Coolify en production',
      created_at: nowIso,
      updated_at: nowIso,
    })

    if (approvalError) return apiError(approvalError.message, 500)

    return NextResponse.json(
      {
        ok: true,
        approvalRequired: true,
        actionId: action.id,
      },
      { status: 202 }
    )
  }

  try {
    const deployment = await createCoolifyClient().triggerDeploy({
      projectId: deployRequest.projectId,
      serviceId: deployRequest.serviceId,
    })

    await supabase
      .from('autonomy_actions')
      .update({
        status: 'completed',
        output: {
          deploymentId: deployment.deploymentId,
        },
        updated_at: new Date().toISOString(),
      })
      .eq('id', action.id)
      .eq('user_id', user!.id)

    return NextResponse.json({
      ok: true,
      approvalRequired: false,
      actionId: action.id,
      deploymentId: deployment.deploymentId,
    })
  } catch (error) {
    await supabase
      .from('autonomy_actions')
      .update({
        status: 'failed',
        output: {
          error: error instanceof Error ? error.message : 'Coolify deploy failed',
        },
        updated_at: new Date().toISOString(),
      })
      .eq('id', action.id)
      .eq('user_id', user!.id)

    return apiError(
      error instanceof Error ? error.message : 'Déploiement Coolify échoué',
      500
    )
  }
}
