import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { requireAllowedUser } from '@/lib/auth-server'
import { isRateLimited } from '@/lib/rate-limit'
import { apiError } from '@/lib/api-response'
import {
  runAgentStep,
  RunAgentStepError,
  type RunAgentStepSupabase,
} from '@/lib/autonomy/run-agent-step'

export async function POST(req: NextRequest) {
  const cookieStore = await cookies()
  const { user, supabase, response } = await requireAllowedUser(cookieStore)
  if (response) return response

  if (isRateLimited(`agent-run:${user!.id}`, { limit: 10, windowMs: 60_000 })) {
    return apiError('Trop de runs. Réessayez dans une minute.', 429)
  }

  let agentId: string
  let prompt: string
  try {
    const body = await req.json()
    agentId = body.agentId ?? ''
    prompt = body.prompt ?? ''
  } catch {
    return apiError('JSON invalide', 400)
  }

  try {
    const result = await runAgentStep({
      supabase: supabase as unknown as RunAgentStepSupabase,
      userId: user!.id,
      agentId,
      prompt,
    })

    return NextResponse.json({
      ok: true,
      content: result.content,
      durationMs: result.durationMs,
      model: result.model,
      pipeline: result.pipeline,
      parsedOutput: result.parsedOutput,
      agentRunId: result.agentRunId,
    })
  } catch (error) {
    if (error instanceof RunAgentStepError) {
      return apiError(error.message, error.status)
    }
    return apiError('Erreur agent', 500)
  }
}
