import { insertAuditEvent } from '@/lib/audit-log'
import { parseAgentOutput, type AgentOutput } from '@/lib/agent-output-schemas'
import { llmChat, type LLMMessage, type LLMResponse } from '@/lib/llm-client'
import { aggregateVentureMetrics, buildDecisionMetricsContext, type VentureMetricSourceRow } from '@/lib/metrics/venture-metrics'
import { buildSystemPrompt, isAgentUnlocked, parsePipelineIdea, type PipelineRow } from '@/lib/pipeline-types'
import { materializeBuilderOutput } from '@/lib/venture-materializer'
import { buildCampaignDrafts, type MarketingOutputShape } from '@/lib/marketing/campaign-drafts'

interface QueryBuilder {
  select(columns?: string): QueryBuilder
  eq(field: string, value: unknown): QueryBuilder
  not(field: string, operator: string, value: unknown): QueryBuilder
  order(field: string, options?: { ascending?: boolean }): QueryBuilder
  limit(count: number): QueryBuilder
  insert(row: Record<string, unknown> | Record<string, unknown>[]): QueryBuilder
  update(row: Record<string, unknown>): QueryBuilder
  maybeSingle(): Promise<{ data: unknown; error: { message: string } | null }>
  single(): Promise<{ data: unknown; error: { message: string } | null }>
  then<TResult1 = { data: unknown; error: { message: string } | null }, TResult2 = never>(
    onfulfilled?: ((value: { data: unknown; error: { message: string } | null }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): PromiseLike<TResult1 | TResult2>
}

export interface RunAgentStepSupabase {
  from(table: string): QueryBuilder
}

export interface RunAgentStepInput {
  supabase: RunAgentStepSupabase
  userId: string
  agentId: string
  prompt?: string
  llm?: (messages: LLMMessage[], config: {
    model: string
    system: string
    temperature: number
    max_tokens: number
  }) => Promise<LLMResponse>
  now?: () => Date
}

export interface RunAgentStepResult {
  ok: true
  content: string
  durationMs: number
  model: string
  agentRunId: string | null
  parsedOutput: AgentOutput | null
  pipeline?: Record<string, unknown>
}

export class RunAgentStepError extends Error {
  constructor(message: string, readonly status = 500) {
    super(message)
  }
}

interface AgentConfig {
  model?: string | null
  system_prompt?: string | null
  temperature?: number | null
  max_tokens?: number | null
  paused?: boolean | null
  run_count?: number | null
}

interface DecisionOutput {
  verdict: 'continue' | 'pivot' | 'stop'
  confidence: number
  rationale: string
  next_step: string
}

const outputCol: Record<string, string> = {
  validation: 'validation_output',
  builder: 'builder_output',
  payment: 'payment_output',
  marketing: 'marketing_output',
  decision: 'decision_output',
}

async function maybeSingle<T>(query: QueryBuilder): Promise<T | null> {
  const { data, error } = await query.maybeSingle()
  if (error) throw new RunAgentStepError(error.message, 500)
  return data as T | null
}

async function single<T>(query: QueryBuilder): Promise<T | null> {
  const { data, error } = await query.single()
  if (error) throw new RunAgentStepError(error.message, 500)
  return data as T | null
}

function parseOutputSafely(agentId: string, content: string): AgentOutput | null {
  try {
    return parseAgentOutput(agentId, content)
  } catch {
    return null
  }
}

function isDecisionOutput(output: AgentOutput | null): output is DecisionOutput {
  return Boolean(
    output
    && 'verdict' in output
    && (output.verdict === 'continue' || output.verdict === 'pivot' || output.verdict === 'stop')
    && 'confidence' in output
    && 'rationale' in output
    && 'next_step' in output
  )
}

async function insertApprovalGatedAction(input: {
  supabase: RunAgentStepSupabase
  userId: string
  ventureId: string
  pipelineId: string
  actionType: 'scale_budget' | 'stop_venture'
  decision: DecisionOutput
  nowIso: string
}) {
  const action = await single<{ id?: string }>(
    input.supabase.from('autonomy_actions').insert({
      user_id: input.userId,
      venture_id: input.ventureId,
      action_type: input.actionType,
      risk_level: 'high',
      status: 'blocked',
      input: {
        pipeline_id: input.pipelineId,
        verdict: input.decision.verdict,
        confidence: input.decision.confidence,
        rationale: input.decision.rationale,
        next_step: input.decision.next_step,
      },
      output: {},
      created_at: input.nowIso,
      updated_at: input.nowIso,
    }).select('id')
  )

  if (!action?.id) {
    throw new RunAgentStepError("Impossible de créer l'action autonome", 500)
  }

  await input.supabase.from('human_approvals').insert({
    user_id: input.userId,
    action_id: action.id,
    status: 'pending',
    reason: input.decision.next_step,
    created_at: input.nowIso,
    updated_at: input.nowIso,
  })
}

async function materializeDecisionFollowup(input: {
  supabase: RunAgentStepSupabase
  userId: string
  pipeline: PipelineRow
  decision: DecisionOutput
  metrics: ReturnType<typeof aggregateVentureMetrics> | null
  nowIso: string
}) {
  if (!input.pipeline.venture_id) return

  await input.supabase.from('decisions').insert({
    venture_id: input.pipeline.venture_id,
    decision: input.decision.verdict,
    reason: input.decision.rationale,
    metrics_snapshot: {
      confidence: input.decision.confidence,
      next_step: input.decision.next_step,
      pipeline_id: input.pipeline.id,
      visits: input.metrics?.visits ?? 0,
      signups: input.metrics?.signups ?? 0,
      signup_rate: input.metrics?.signupRate ?? 0,
      revenue_cents: input.metrics?.revenueCents ?? 0,
      spend_cents: input.metrics?.spendCents ?? 0,
      profit_cents: input.metrics?.profitCents ?? 0,
      roi: input.metrics?.roi ?? 0,
    },
    created_at: input.nowIso,
  })

  if (input.decision.verdict === 'pivot') {
    await input.supabase.from('autonomy_jobs').insert({
      user_id: input.userId,
      venture_id: input.pipeline.venture_id,
      kind: 'run_agent',
      status: 'queued',
      next_run_at: input.nowIso,
      payload: {
        agentId: 'scout',
        source: 'decision_pivot',
        pipelineId: input.pipeline.id,
        prompt: [
          `Pivote depuis la venture "${input.pipeline.idea_title}".`,
          `Raison Decision: ${input.decision.rationale}`,
          `Nouvelle direction: ${input.decision.next_step}`,
          'Trouve une opportunité micro-SaaS plus rentable en gardant les apprentissages utiles.',
        ].join('\n'),
        decision: {
          verdict: input.decision.verdict,
          confidence: input.decision.confidence,
          rationale: input.decision.rationale,
          next_step: input.decision.next_step,
        },
      },
      created_at: input.nowIso,
      updated_at: input.nowIso,
    })
    return
  }

  await insertApprovalGatedAction({
    supabase: input.supabase,
    userId: input.userId,
    ventureId: input.pipeline.venture_id,
    pipelineId: input.pipeline.id,
    actionType: input.decision.verdict === 'continue' ? 'scale_budget' : 'stop_venture',
    decision: input.decision,
    nowIso: input.nowIso,
  })
}

interface DecisionMetricsBundle {
  context: string
  metrics: ReturnType<typeof aggregateVentureMetrics> | null
}

async function getDecisionMetricsBundle(supabase: RunAgentStepSupabase, pipeline: PipelineRow | null): Promise<DecisionMetricsBundle> {
  if (!pipeline?.venture_id) return { context: '', metrics: null }
  try {
    const { data, error } = await supabase
      .from('venture_events')
      .select('venture_id, event_type, value')
      .eq('venture_id', pipeline.venture_id)

    if (error) return { context: '', metrics: null }
    const metrics = aggregateVentureMetrics((data ?? []) as VentureMetricSourceRow[])
    return { context: `\n${buildDecisionMetricsContext(metrics)}`, metrics }
  } catch {
    return { context: '', metrics: null }
  }
}

export async function runAgentStep(input: RunAgentStepInput): Promise<RunAgentStepResult> {
  const { supabase, userId, agentId } = input
  if (!agentId) throw new RunAgentStepError('agentId requis', 400)

  const now = input.now ?? (() => new Date())
  const cfg = await maybeSingle<AgentConfig>(
    supabase
      .from('agent_configs')
      .select('model, system_prompt, temperature, max_tokens, paused, run_count')
      .eq('user_id', userId)
      .eq('agent_id', agentId)
  )

  if (cfg?.paused) throw new RunAgentStepError('Agent en pause', 409)

  const pipeline = await maybeSingle<PipelineRow>(
    supabase
      .from('venture_pipeline')
      .select('*')
      .eq('user_id', userId)
      .not('status', 'eq', 'rejected')
      .order('created_at', { ascending: false })
      .limit(1)
  )

  if (!isAgentUnlocked(agentId, pipeline)) {
    if (!pipeline || pipeline.status === 'pending_validation') {
      throw new RunAgentStepError("Validez l'idée Scout avant de lancer cet agent", 409)
    }
    throw new RunAgentStepError("Cet agent attend la fin de l'étape précédente", 409)
  }

  const model = cfg?.model ?? 'qwen3:8b'
  const baseSystemPrompt = buildSystemPrompt(agentId, pipeline, cfg?.system_prompt ?? '')
  const decisionBundle = agentId === 'decision'
    ? await getDecisionMetricsBundle(supabase, pipeline)
    : { context: '', metrics: null }
  const systemPrompt = `${baseSystemPrompt}${decisionBundle.context}`
  const userPrompt = input.prompt || (agentId === 'scout'
    ? 'Lance une mission de découverte et trouve-moi la meilleure opportunité de micro-SaaS du moment.'
    : 'Exécute ta mission.')

  const startMs = now().getTime()

  if (pipeline && agentId !== 'scout') {
    await supabase.from('venture_pipeline')
      .update({ current_agent: agentId, updated_at: now().toISOString() })
      .eq('id', pipeline.id)
  }

  try {
    const llmResult = await (input.llm ?? llmChat)(
      [{ role: 'user', content: userPrompt }],
      {
        model,
        system: systemPrompt,
        temperature: cfg?.temperature ?? 0.7,
        max_tokens: cfg?.max_tokens ?? 512,
      }
    )

    const content = llmResult.content
    const durationMs = Math.max(0, now().getTime() - startMs)
    const usedModel = llmResult.model

    const agentRun = await single<{ id?: string }>(
      supabase.from('agent_runs').insert({
        user_id: userId,
        agent_id: agentId,
        model: usedModel,
        prompt: userPrompt,
        response: content,
        duration_ms: durationMs,
      }).select('id')
    )

    await insertAuditEvent(supabase, {
      user_id: userId,
      agent_id: agentId,
      event_type: 'agent.run.completed',
      metadata: {
        model: usedModel,
        duration_ms: durationMs,
        fallback_triggered: llmResult.fallback_triggered,
      },
    })

    const parsedOutput = parseOutputSafely(agentId, content)

    if (agentId === 'scout') {
      const parsed = parsePipelineIdea(content)
      if (pipeline && pipeline.status === 'pending_validation') {
        await supabase.from('venture_pipeline')
          .update({ status: 'rejected', updated_at: now().toISOString() })
          .eq('id', pipeline.id)
      }

      const newPipeline = await single<{ id?: string }>(
        supabase.from('venture_pipeline')
          .insert({
            user_id: userId,
            ...parsed,
            scout_raw: content,
            status: 'pending_validation',
          })
          .select('id')
      )

      await supabase.from('agent_configs')
        .update({ run_count: (cfg?.run_count ?? 0) + 1, last_run_at: now().toISOString() })
        .eq('user_id', userId)
        .eq('agent_id', agentId)

      return {
        ok: true,
        content,
        durationMs,
        model: usedModel,
        agentRunId: agentRun?.id ?? null,
        parsedOutput,
        pipeline: { id: newPipeline?.id, ...parsed, status: 'pending_validation' },
      }
    }

    const col = outputCol[agentId]
    if (col && pipeline) {
      const extraFields: Record<string, unknown> = {
        [col]: content,
        current_agent: null,
        updated_at: now().toISOString(),
      }

      if (agentId === 'validation' && parsedOutput && 'score' in parsedOutput) {
        extraFields.validation_score = parsedOutput.score
      }

      if (agentId === 'decision') extraFields.status = 'done'

      await supabase.from('venture_pipeline').update(extraFields).eq('id', pipeline.id)

      if (agentId === 'builder' && pipeline.venture_id && parsedOutput && 'headline' in parsedOutput) {
        await materializeBuilderOutput({
          ventureId: pipeline.venture_id,
          ventureName: pipeline.idea_title,
          builderOutput: parsedOutput,
          insertLandingPage: async (payload) => {
            const { error } = await supabase.from('landing_pages').insert(payload)
            return { error }
          },
        })
      }

      if (agentId === 'decision' && isDecisionOutput(parsedOutput)) {
        await materializeDecisionFollowup({
          supabase,
          userId,
          pipeline,
          decision: parsedOutput,
          metrics: decisionBundle.metrics,
          nowIso: now().toISOString(),
        })
      }

      if (agentId === 'marketing' && parsedOutput && 'channels' in parsedOutput && 'messages' in parsedOutput) {
        const drafts = buildCampaignDrafts({
          userId,
          ventureId: pipeline.venture_id ?? null,
          output: parsedOutput as MarketingOutputShape,
        })
        for (const draft of drafts) {
          const inserted = await single<{ id?: string }>(
            supabase.from('campaign_drafts')
              .insert(draft as unknown as Record<string, unknown>)
              .select('id')
          )
          if (!inserted?.id || !pipeline.venture_id) continue

          const action = await single<{ id?: string }>(
            supabase.from('autonomy_actions').insert({
              user_id: userId,
              venture_id: pipeline.venture_id,
              action_type: 'publish_campaign',
              risk_level: 'high',
              status: 'blocked',
              input: {
                draft_id: inserted.id,
                channel: draft.channel,
                pipeline_id: pipeline.id,
              },
              created_at: now().toISOString(),
              updated_at: now().toISOString(),
            }).select('id')
          )
          if (!action?.id) continue

          await supabase.from('human_approvals').insert({
            user_id: userId,
            action_id: action.id,
            status: 'pending',
            reason: `Publier sur ${draft.channel}`,
            created_at: now().toISOString(),
            updated_at: now().toISOString(),
          })
        }
      }
    }

    await supabase.from('agent_configs')
      .update({ run_count: (cfg?.run_count ?? 0) + 1, last_run_at: now().toISOString() })
      .eq('user_id', userId)
      .eq('agent_id', agentId)

    return {
      ok: true,
      content,
      durationMs,
      model: usedModel,
      agentRunId: agentRun?.id ?? null,
      parsedOutput,
    }
  } catch (error) {
    if (pipeline && agentId !== 'scout') {
      await supabase.from('venture_pipeline')
        .update({ current_agent: null, updated_at: now().toISOString() })
        .eq('id', pipeline.id)
    }
    if (error instanceof RunAgentStepError) throw error
    const isTimeout = error instanceof Error && error.name === 'TimeoutError'
    throw new RunAgentStepError(isTimeout ? 'Ollama timeout (30s)' : 'Ollama injoignable', 502)
  }
}
