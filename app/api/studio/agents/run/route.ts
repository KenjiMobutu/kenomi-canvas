import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { requireAllowedUser } from '@/lib/auth-server'
import { isRateLimited } from '@/lib/rate-limit'
import { apiError } from '@/lib/api-response'
import { llmChat } from '@/lib/llm-client'
import { isAgentUnlocked, parsePipelineIdea, buildSystemPrompt, type PipelineRow } from '@/lib/pipeline-types'

export async function POST(req: NextRequest) {
  const cookieStore = await cookies()
  const { user, supabase, response } = await requireAllowedUser(cookieStore)
  if (response) return response

  if (isRateLimited(`agent-run:${user!.id}`, { limit: 10, windowMs: 60_000 })) {
    return apiError('Trop de runs. Réessayez dans une minute.', 429)
  }

  let agentId: string, prompt: string
  try {
    const body = await req.json()
    agentId = body.agentId ?? ''
    prompt = body.prompt ?? ''
  } catch {
    return apiError('JSON invalide', 400)
  }
  if (!agentId) return apiError('agentId requis', 400)

  const { data: cfg } = await supabase
    .from('agent_configs')
    .select('model, system_prompt, temperature, max_tokens, paused, run_count')
    .eq('user_id', user!.id)
    .eq('agent_id', agentId)
    .maybeSingle()

  if (cfg?.paused) return apiError('Agent en pause', 409)

  const { data: pipeline } = await supabase
    .from('venture_pipeline')
    .select('*')
    .eq('user_id', user!.id)
    .not('status', 'eq', 'rejected')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle() as { data: PipelineRow | null }

  if (!isAgentUnlocked(agentId, pipeline)) {
    if (!pipeline || pipeline.status === 'pending_validation') {
      return apiError("Validez l'idée Scout avant de lancer cet agent", 409)
    }
    return apiError("Cet agent attend la fin de l'étape précédente", 409)
  }

  const model = cfg?.model ?? 'qwen3:8b'
  const systemPrompt = buildSystemPrompt(agentId, pipeline, cfg?.system_prompt ?? '')
  const userPrompt = prompt || (agentId === 'scout'
    ? 'Lance une mission de découverte et trouve-moi la meilleure opportunité de micro-SaaS du moment.'
    : 'Exécute ta mission.')

  const startMs = Date.now()

  if (pipeline && agentId !== 'scout') {
    await supabase.from('venture_pipeline')
      .update({ current_agent: agentId, updated_at: new Date().toISOString() })
      .eq('id', pipeline.id)
  }

  try {
    const llmResult = await llmChat(
      [{ role: 'user', content: userPrompt }],
      {
        model,
        system: systemPrompt,
        temperature: cfg?.temperature ?? 0.7,
        max_tokens: cfg?.max_tokens ?? 512,
      }
    )

    const content = llmResult.content
    const durationMs = Date.now() - startMs
    const usedModel = llmResult.model

    await supabase.from('agent_runs').insert({
      user_id: user!.id, agent_id: agentId, model: usedModel,
      prompt: userPrompt, response: content, duration_ms: durationMs,
    })

    if (agentId === 'scout') {
      const parsed = parsePipelineIdea(content)
      if (pipeline && pipeline.status === 'pending_validation') {
        await supabase.from('venture_pipeline')
          .update({ status: 'rejected', updated_at: new Date().toISOString() })
          .eq('id', pipeline.id)
      }
      const { data: newPipeline } = await supabase.from('venture_pipeline')
        .insert({
          user_id: user!.id,
          ...parsed,
          scout_raw: content,
          status: 'pending_validation',
        })
        .select('id')
        .single()

      await supabase.from('agent_configs')
        .update({ run_count: (cfg?.run_count ?? 0) + 1, last_run_at: new Date().toISOString() })
        .eq('user_id', user!.id).eq('agent_id', agentId)

      return NextResponse.json({
        ok: true, content, durationMs, model: usedModel,
        pipeline: { id: newPipeline?.id, ...parsed, status: 'pending_validation' },
      })
    }

    const outputCol: Record<string, string> = {
      validation: 'validation_output',
      builder:    'builder_output',
      payment:    'payment_output',
      marketing:  'marketing_output',
      decision:   'decision_output',
    }
    const col = outputCol[agentId]
    if (col && pipeline) {
      const extraFields: Record<string, unknown> = {
        [col]: content,
        current_agent: null,
        updated_at: new Date().toISOString(),
      }
      if (agentId === 'validation') {
        try {
          const parsed = JSON.parse(content)
          if (typeof parsed.score === 'number') extraFields.validation_score = parsed.score
        } catch { /* score non parseable */ }
      }
      if (agentId === 'decision') extraFields.status = 'done'
      await supabase.from('venture_pipeline').update(extraFields).eq('id', pipeline.id)
    }

    await supabase.from('agent_configs')
      .update({ run_count: (cfg?.run_count ?? 0) + 1, last_run_at: new Date().toISOString() })
      .eq('user_id', user!.id).eq('agent_id', agentId)

    return NextResponse.json({ ok: true, content, durationMs, model: usedModel })
  } catch (e) {
    if (pipeline && agentId !== 'scout') {
      await supabase.from('venture_pipeline')
        .update({ current_agent: null, updated_at: new Date().toISOString() })
        .eq('id', pipeline.id)
    }
    const isTimeout = e instanceof Error && e.name === 'TimeoutError'
    return apiError(isTimeout ? 'Ollama timeout (30s)' : 'Ollama injoignable', 502)
  }
}
