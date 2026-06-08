import { insertAuditEvent } from '@/lib/audit-log'
import { parseAgentOutput, type AgentOutput } from '@/lib/agent-output-schemas'
import type { BuilderOutput } from '@/lib/agent-output-schemas'
import { llmChat, computeCostUsd, type LLMMessage, type LLMResponse } from '@/lib/llm-client'
import {
  aggregateVentureMetrics,
  buildDecisionMetricsContext,
  type VentureMetricSourceRow,
} from '@/lib/metrics/venture-metrics'
import {
  buildAcquisitionRoi,
  buildAcquisitionRoiContext,
  type AcquisitionEventRow,
} from '@/lib/metrics/acquisition-roi'
import {
  buildSystemPrompt,
  AGENT_CHAIN,
  isAgentUnlocked,
  parsePipelineIdea,
  type PipelineRow,
} from '@/lib/pipeline-types'
import { buildProspectMemoryRecord } from '@/lib/prospect/memory'
import {
  formatRetrievedProspectMemories,
  retrieveProspectMemories,
  writeProspectMemory,
} from '@/lib/memory/prospect-memory'
import { buildProspectOutreach } from '@/lib/prospect/build-outreach'
import type { ProspectSource } from '@/lib/prospect/types'
import type { ProspectOutput } from '@/lib/agent-output-schemas'
import { deriveProspectApprovalState } from '@/lib/prospect/approval-state'
import {
  findGroundedGithubProspect,
  type GroundedProspectOutput,
} from '@/lib/prospect/grounded-github'
import { getModelFamily } from '@/lib/model-families'
import { materializeBuilderOutput } from '@/lib/venture-materializer'
import { buildCampaignDrafts, type MarketingOutputShape } from '@/lib/marketing/campaign-drafts'
import { agentRunsTotal, agentRunCostUsdTotal } from '@/lib/metrics/prometheus'
import {
  buildScoutSourceBrief,
  collectFreeScoutSignals,
  type ScoutSourceCollection,
} from '@/lib/scout/free-sources'
import { hasSyntheticBusinessMarker } from '@/lib/revenue/synthetic-data'
import { appendScoutSignals } from '@/lib/scout/signal-log'
import {
  collectInfraDiagnostics,
  type InfraDiagnosticsSupabase,
} from '@/lib/infra-diagnostics-runner'
import { buildDeploymentParity, buildInfraOpsTimeline, type InfraOpsEventRow } from '@/lib/infra-ops-timeline'
import { appendDevopsDiagnosticRun } from '@/lib/devops/diagnostic-log'
import { buildDevopsSummaryContext } from '@/lib/devops/summary'

interface QueryBuilder {
  select(columns?: string): QueryBuilder
  eq(field: string, value: unknown): QueryBuilder
  contains?(field: string, value: unknown): QueryBuilder
  not(field: string, operator: string, value: unknown): QueryBuilder
  order(field: string, options?: { ascending?: boolean }): QueryBuilder
  limit(count: number): QueryBuilder
  insert(row: Record<string, unknown> | Record<string, unknown>[]): QueryBuilder
  update(row: Record<string, unknown>): QueryBuilder
  maybeSingle(): Promise<{ data: unknown; error: { message: string } | null }>
  single(): Promise<{ data: unknown; error: { message: string } | null }>
  then<TResult1 = { data: unknown; error: { message: string } | null }, TResult2 = never>(
    onfulfilled?:
      | ((value: {
          data: unknown
          error: { message: string } | null
        }) => TResult1 | PromiseLike<TResult1>)
      | null,
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
  ventureId?: string
  prompt?: string
  structuredInput?: Record<string, unknown>
  llm?: (
    messages: LLMMessage[],
    config: {
      model: string
      system: string
      temperature: number
      max_tokens: number
      timeout_ms?: number
    }
  ) => Promise<LLMResponse>
  scoutSourceCollector?: (input: {
    query: string
    now: () => Date
  }) => Promise<ScoutSourceCollection>
  appendScoutSignals?: typeof appendScoutSignals
  collectInfraDiagnostics?: typeof collectInfraDiagnostics
  appendDevopsDiagnosticRun?: typeof appendDevopsDiagnosticRun
  writeProspectMemory?: typeof writeProspectMemory
  retrieveProspectMemories?: typeof retrieveProspectMemories
  findGroundedProspect?: (input: { query: string }) => Promise<GroundedProspectOutput | null>
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

function hasExplicitProspectIdentity(structuredInput?: Record<string, unknown>): boolean {
  return Boolean(
    (typeof structuredInput?.companyName === 'string' && structuredInput.companyName.trim().length > 0) ||
      (typeof structuredInput?.contactEmail === 'string' && structuredInput.contactEmail.trim().length > 0)
  )
}

function shouldUseGroundedProspect(input: RunAgentStepInput): boolean {
  if (input.agentId !== 'prospect') return false
  if (hasExplicitProspectIdentity(input.structuredInput)) return false
  return Boolean(input.findGroundedProspect) || !input.llm
}

const PROSPECT_SOURCES: ProspectSource[] = ['linkedin', 'malt', 'upwork', 'indeed', 'reddit', 'other']

function normalizeProspectSource(value: unknown, fallback: ProspectSource): ProspectSource {
  return typeof value === 'string' && PROSPECT_SOURCES.includes(value as ProspectSource)
    ? (value as ProspectSource)
    : fallback
}

async function getRecentInfraEvents(
  supabase: RunAgentStepSupabase,
  userId: string
): Promise<InfraOpsEventRow[]> {
  const { data, error } = await supabase
    .from('agent_events')
    .select('id,event_type,severity,metadata,created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(40)

  if (error) throw new RunAgentStepError(error.message, 500)
  return (data ?? []) as InfraOpsEventRow[]
}

export class RunAgentStepError extends Error {
  constructor(
    message: string,
    readonly status = 500
  ) {
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

function prospectFollowUpAt(now: Date, band: ProspectOutput['band']): string {
  const days = band === 'hot' ? 1 : band === 'warm' ? 3 : 7
  return new Date(now.getTime() + days * 24 * 60 * 60 * 1000).toISOString()
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

async function selectRows<T>(query: QueryBuilder): Promise<T[]> {
  const { data, error } = await query
  if (error) throw new RunAgentStepError(error.message, 500)
  return Array.isArray(data) ? (data as T[]) : []
}

async function syncAgentRunStats(input: {
  supabase: RunAgentStepSupabase
  userId: string
  agentId: string
  nowIso: string
  defaultModel?: string
}) {
  const { data, error } = await input.supabase
    .from('agent_runs')
    .select('created_at')
    .eq('user_id', input.userId)
    .eq('agent_id', input.agentId)

  if (error) throw new RunAgentStepError(error.message, 500)

  const runs = Array.isArray(data) ? (data as Array<{ created_at?: string | null }>) : []
  const hasUndatedRun = runs.some((row) => !row?.created_at)
  const lastRunAt = runs.reduce((latest, row) => {
    if (!row?.created_at) return latest
    if (!latest) return row.created_at
    return new Date(row.created_at).getTime() > new Date(latest).getTime() ? row.created_at : latest
  }, null as string | null)

  const config = await maybeSingle<{ user_id?: string; agent_id?: string }>(
    input.supabase
      .from('agent_configs')
      .select('user_id, agent_id')
      .eq('user_id', input.userId)
      .eq('agent_id', input.agentId)
  )

  const payload = {
    run_count: runs.length,
    last_run_at: hasUndatedRun ? input.nowIso : (lastRunAt ?? input.nowIso),
  }

  if (config) {
    await input.supabase
      .from('agent_configs')
      .update(payload)
      .eq('user_id', input.userId)
      .eq('agent_id', input.agentId)
    return
  }

  const insertRow: Record<string, unknown> = {
    user_id: input.userId,
    agent_id: input.agentId,
    ...payload,
  }
  if (input.defaultModel) {
    insertRow.model = input.defaultModel
  }

  await input.supabase.from('agent_configs').insert(insertRow)
}

function parseOutputSafely(agentId: string, content: string): AgentOutput | null {
  try {
    return parseAgentOutput(agentId, content)
  } catch {
    return null
  }
}

function getDefaultAgentModel(agentId: string): string {
  if (agentId === 'prospect' || agentId === 'decision') {
    return process.env.HERMES_DEFAULT_MODEL ?? 'hermes3:8b'
  }

  return 'qwen3:8b'
}

function getAgentLlmTimeoutMs(agentId: string): number {
  if (agentId === 'prospect') return 90_000
  if (agentId === 'decision' || agentId === 'scout') return 60_000
  return 30_000
}

function buildDevopsRepairPrompt(content: string): string {
  return [
    'Repair the following malformed DevOps JSON.',
    'Return strict JSON only.',
    'Preserve the original meaning.',
    'Required shape:',
    '{"global_status":"ok|degraded|down","headline":"...","services":[{"id":"...","status":"ok|degraded|down","severity":"low|medium|high","reason":"...","next_step":"..."}],"summary":"...","operator_next_step":"..."}',
    'Malformed JSON:',
    content,
  ].join('\n')
}

async function ensureProspectOutreachApproval(input: {
  supabase: RunAgentStepSupabase
  userId: string
  prospectId: string
  prospect: ProspectOutput
  nowIso: string
}) {
  if (!(input.prospect.band === 'hot' || input.prospect.band === 'warm')) return
  if (!input.prospect.outreach_subject || !input.prospect.outreach_body) return

  const existingActions = await selectRows<{
    id?: string
    action_type?: string | null
    status?: string | null
    input?: Record<string, unknown> | null
  }>(
    input.supabase
      .from('autonomy_actions')
      .select('id, action_type, status, input')
      .eq('user_id', input.userId)
      .eq('action_type', 'send_outreach')
  )

  const openAction = existingActions.find((action) => {
    const state = deriveProspectApprovalState({ action })
    if (!(state.actionable || state.approvalStatus === 'approved_to_send')) return false
    return action.input?.prospect_id === input.prospectId
  })

  if (openAction?.id) return

  const action = await single<{ id?: string }>(
    input.supabase
      .from('autonomy_actions')
      .insert({
        user_id: input.userId,
        venture_id: null,
        action_type: 'send_outreach',
        risk_level: 'medium',
        status: 'blocked',
        input: {
          prospect_id: input.prospectId,
          channel: 'email',
          company_name: input.prospect.company_name,
          contact_name: input.prospect.contact_name ?? null,
          outreach_subject: input.prospect.outreach_subject,
          outreach_body: input.prospect.outreach_body,
          source: input.prospect.source,
          score: input.prospect.score,
          band: input.prospect.band,
        },
        output: {},
        created_at: input.nowIso,
        updated_at: input.nowIso,
      })
      .select('id')
  )

  if (!action?.id) return

  await input.supabase.from('human_approvals').insert({
    user_id: input.userId,
    action_id: action.id,
    status: 'pending',
    approved_by: null,
    approved_at: null,
    reason: null,
    created_at: input.nowIso,
    updated_at: input.nowIso,
  })
}

function isDecisionOutput(output: AgentOutput | null): output is DecisionOutput {
  return Boolean(
    output &&
    'verdict' in output &&
    (output.verdict === 'continue' || output.verdict === 'pivot' || output.verdict === 'stop') &&
    'confidence' in output &&
    'rationale' in output &&
    'next_step' in output
  )
}

function isBuilderOutput(output: AgentOutput | null): output is BuilderOutput {
  return Boolean(
    output &&
      'headline' in output &&
      'subline' in output &&
      'cta' in output &&
      'features' in output &&
      Array.isArray(output.features)
  )
}

async function insertApprovalGatedAction(input: {
  supabase: RunAgentStepSupabase
  userId: string
  ventureId: string
  pipelineId: string
  actionType: 'scale_budget' | 'stop_venture'
  decision: DecisionOutput
  recommendedBudgetEur?: number
  nowIso: string
}) {
  const estimatedCostEur =
    input.actionType === 'scale_budget' ? (input.recommendedBudgetEur ?? 25) : 0
  const action = await single<{ id?: string }>(
    input.supabase
      .from('autonomy_actions')
      .insert({
        user_id: input.userId,
        venture_id: input.ventureId,
        action_type: input.actionType,
        risk_level: 'high',
        status: 'blocked',
        estimated_cost_eur: estimatedCostEur,
        budget_cap_eur:
          input.actionType === 'scale_budget'
            ? Math.max(50, Math.ceil(estimatedCostEur * 1.25))
            : null,
        input: {
          pipeline_id: input.pipelineId,
          verdict: input.decision.verdict,
          confidence: input.decision.confidence,
          rationale: input.decision.rationale,
          next_step: input.decision.next_step,
          recommended_budget_eur:
            input.actionType === 'scale_budget' ? estimatedCostEur : undefined,
        },
        output: {},
        created_at: input.nowIso,
        updated_at: input.nowIso,
      })
      .select('id')
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

  const revenueEur = (input.metrics?.revenueCents ?? 0) / 100
  const profitEur = (input.metrics?.profitCents ?? 0) / 100
  const recommendedBudgetEur =
    input.decision.verdict === 'continue'
      ? Math.min(250, Math.max(25, Math.round((revenueEur > 0 ? revenueEur : profitEur) * 0.3)))
      : undefined

  await insertApprovalGatedAction({
    supabase: input.supabase,
    userId: input.userId,
    ventureId: input.pipeline.venture_id,
    pipelineId: input.pipeline.id,
    actionType: input.decision.verdict === 'continue' ? 'scale_budget' : 'stop_venture',
    decision: input.decision,
    recommendedBudgetEur,
    nowIso: input.nowIso,
  })
}

interface DecisionMetricsBundle {
  context: string
  metrics: ReturnType<typeof aggregateVentureMetrics> | null
}

async function getDecisionMetricsBundle(
  supabase: RunAgentStepSupabase,
  pipeline: PipelineRow | null
): Promise<DecisionMetricsBundle> {
  if (!pipeline?.venture_id) return { context: '', metrics: null }
  try {
    const { data, error } = await supabase
      .from('venture_events')
      .select('venture_id, event_type, value, metadata, occurred_at')
      .eq('venture_id', pipeline.venture_id)

    if (error) return { context: '', metrics: null }
    const rows = (data ?? []) as Array<VentureMetricSourceRow & AcquisitionEventRow>
    const metrics = aggregateVentureMetrics(rows)
    const acquisitionContext = buildAcquisitionRoiContext(buildAcquisitionRoi(rows))
    return {
      context: `\n${buildDecisionMetricsContext(metrics)}${acquisitionContext ? `\n${acquisitionContext}` : ''}`,
      metrics,
    }
  } catch {
    return { context: '', metrics: null }
  }
}

interface ProspectSettingsRow {
  prospect_sources?: string[] | null
  prospect_outreach_email?: string | null
  prospect_crm_provider?: string | null
}

async function getProspectSettingsContext(
  supabase: RunAgentStepSupabase,
  userId: string
): Promise<{ context: string; settings: ProspectSettingsRow | null }> {
  try {
    const settings = await maybeSingle<ProspectSettingsRow>(
      supabase
        .from('user_settings')
        .select('prospect_sources, prospect_outreach_email, prospect_crm_provider')
        .eq('user_id', userId)
    )

    if (!settings) return { context: '', settings: null }

    const sources = (settings.prospect_sources ?? []).filter((source) => source.trim().length > 0)
    const outreachEmail = settings.prospect_outreach_email?.trim() ?? ''
    const crmProvider = settings.prospect_crm_provider?.trim() ?? 'supabase'

    const lines = [
      'Contexte Prospect:',
      sources.length ? `- Sources autorisées: ${sources.join(', ')}` : '- Sources autorisées: non précisées',
      outreachEmail ? `- Email de prospection: ${outreachEmail}` : '- Email de prospection: non défini',
      `- CRM cible: ${crmProvider}`,
      '- Réponds avec un prospect exploitable et un message prêt à envoyer.',
    ]

    return { context: `\n${lines.join('\n')}`, settings }
  } catch {
    return { context: '', settings: null }
  }
}

export async function runAgentStep(input: RunAgentStepInput): Promise<RunAgentStepResult> {
  const { supabase, userId, agentId } = input
  if (!agentId) throw new RunAgentStepError('agentId requis', 400)
  const supportedAgents = new Set(['scout', 'prospect', 'devops', ...AGENT_CHAIN])
  if (!supportedAgents.has(agentId)) {
    throw new RunAgentStepError(`Agent inconnu: ${agentId}`, 400)
  }

  const now = input.now ?? (() => new Date())
  const cfg = await maybeSingle<AgentConfig>(
    supabase
      .from('agent_configs')
      .select('model, system_prompt, temperature, max_tokens, paused, run_count')
      .eq('user_id', userId)
      .eq('agent_id', agentId)
  )

  if (cfg?.paused) throw new RunAgentStepError('Agent en pause', 409)

  const pipeline =
    agentId === 'prospect'
      ? null
      : await maybeSingle<PipelineRow>(
          (() => {
            let query = supabase
              .from('venture_pipeline')
              .select('*')
              .eq('user_id', userId)
              .not('status', 'eq', 'rejected')

            if (input.ventureId) {
              query = query.eq('venture_id', input.ventureId)
            }

            return query.order('created_at', { ascending: false }).limit(1)
          })()
        )

  if (agentId !== 'prospect' && !isAgentUnlocked(agentId, pipeline)) {
    if (!pipeline || pipeline.status === 'pending_validation') {
      throw new RunAgentStepError("Validez l'idée Scout avant de lancer cet agent", 409)
    }
    throw new RunAgentStepError("Cet agent attend la fin de l'étape précédente", 409)
  }

  const prospectContext =
    agentId === 'prospect'
      ? await getProspectSettingsContext(supabase, userId)
      : { context: '', settings: null }
  const prospectMemoryRows =
    agentId === 'prospect'
      ? await (input.retrieveProspectMemories ?? retrieveProspectMemories)({
          userId,
          query: input.prompt || 'Trouve un prospect qualifié, score-le, et rédige un message de prospection prêt à envoyer.',
          limit: 4,
        })
      : []
  const prospectMemoryContext =
    agentId === 'prospect'
      ? formatRetrievedProspectMemories(prospectMemoryRows)
      : ''
  const devopsDiagnostics =
    agentId === 'devops'
      ? await (input.collectInfraDiagnostics ?? collectInfraDiagnostics)({
          supabase: supabase as unknown as InfraDiagnosticsSupabase,
          userId,
        })
      : null
  const devopsTimeline =
    agentId === 'devops' && devopsDiagnostics
      ? buildInfraOpsTimeline({
          events: await getRecentInfraEvents(supabase, userId),
          diagnostics: devopsDiagnostics,
        })
      : null
  const devopsParity =
    agentId === 'devops' && devopsDiagnostics
      ? buildDeploymentParity({
          runtime: devopsDiagnostics.runtime,
          expectedCommit: process.env.EXPECTED_SOURCE_COMMIT ?? process.env.GITHUB_SHA ?? null,
        })
      : null
  const devopsContext =
    agentId === 'devops' && devopsDiagnostics && devopsTimeline
      ? `\n${buildDevopsSummaryContext({
          diagnostics: devopsDiagnostics,
          timeline: devopsTimeline,
          parity: devopsParity,
        })}`
      : ''

  const model = cfg?.model ?? getDefaultAgentModel(agentId)
  const baseSystemPrompt = buildSystemPrompt(agentId, pipeline, cfg?.system_prompt ?? '')
  const decisionBundle =
    agentId === 'decision'
      ? await getDecisionMetricsBundle(supabase, pipeline)
      : { context: '', metrics: null }
  const userPrompt =
    input.prompt ||
    (agentId === 'scout'
      ? 'Lance une mission de découverte et trouve-moi la meilleure opportunité de micro-SaaS du moment.'
      : agentId === 'prospect'
        ? 'Trouve un prospect qualifié, score-le, et rédige un message de prospection prêt à envoyer.'
      : agentId === 'devops'
        ? 'Synthétise l état infra actuel et les incidents récents.'
        : 'Exécute ta mission.')
  const scoutSourceCollection =
    agentId === 'scout'
      ? await (input.scoutSourceCollector ?? collectFreeScoutSignals)({
          query: userPrompt,
          now,
        })
      : null
  const scoutSourceContext =
    agentId === 'scout' && scoutSourceCollection
      ? `\n\n${buildScoutSourceBrief(scoutSourceCollection)}`
      : ''
  const systemPrompt = `${baseSystemPrompt}${decisionBundle.context}${scoutSourceContext}${prospectContext.context}${prospectMemoryContext ? `\n${prospectMemoryContext}` : ''}${devopsContext}`

  const startMs = now().getTime()

  if (pipeline && agentId !== 'scout') {
    await supabase
      .from('venture_pipeline')
      .update({ current_agent: agentId, updated_at: now().toISOString() })
      .eq('id', pipeline.id)
  }

  try {
    if (agentId === 'scout' && scoutSourceCollection) {
      try {
        await (input.appendScoutSignals ?? appendScoutSignals)({
          supabase,
          userId,
          collection: scoutSourceCollection,
        })
      } catch (error) {
        console.warn(
          'scout signal append failed',
          error instanceof Error ? error.message : String(error)
        )
      }
    }

    let content = ''
    let usedModel = model
    let usage: LLMResponse['usage']
    let costUsd: number | null = null
    let provider: 'hermes' | 'ollama' | 'claude' | 'github' = 'ollama'
    let fallbackTriggered = false
    let parsedOutput: AgentOutput | null = null

    if (shouldUseGroundedProspect(input)) {
      const groundedProspect = await (input.findGroundedProspect ?? ((args) => findGroundedGithubProspect(args)))({
        query: userPrompt,
      })
      if (!groundedProspect) {
        throw new RunAgentStepError('No grounded prospect with verified public email found', 404)
      }
      content = JSON.stringify(groundedProspect)
      usedModel = 'grounded/github-user-search'
      provider = 'github'
      parsedOutput = groundedProspect
    } else {
      const llmResult = await (input.llm ?? llmChat)([{ role: 'user', content: userPrompt }], {
        model,
        system: systemPrompt,
        temperature: cfg?.temperature ?? 0.7,
        max_tokens: cfg?.max_tokens ?? 512,
        timeout_ms: getAgentLlmTimeoutMs(agentId),
      })

      content = llmResult.content
      usedModel = llmResult.model
      usage = llmResult.usage
      provider = llmResult.provider
      fallbackTriggered = llmResult.fallback_triggered
      costUsd = usage ? computeCostUsd(usedModel, usage) : null
      parsedOutput = parseOutputSafely(agentId, content)
    }

    const durationMs = Math.max(0, now().getTime() - startMs)

    if (agentId === 'devops' && !parsedOutput) {
      try {
        const repairedResult = await (input.llm ?? llmChat)([
          { role: 'user', content: buildDevopsRepairPrompt(content) },
        ], {
          model,
          system: 'Return strict JSON only.',
          temperature: 0,
          max_tokens: cfg?.max_tokens ?? 512,
          timeout_ms: getAgentLlmTimeoutMs(agentId),
        })
        const repairedParsed = parseOutputSafely(agentId, repairedResult.content)
        if (repairedParsed) {
          content = repairedResult.content
          parsedOutput = repairedParsed
          usedModel = repairedResult.model
          provider = repairedResult.provider
          fallbackTriggered = repairedResult.fallback_triggered
          usage = repairedResult.usage
          costUsd = usage ? computeCostUsd(usedModel, usage) : null
        }
      } catch {
        // Best effort only; keep the original malformed content for auditability.
      }
    }

    const agentRun = await single<{ id?: string }>(
      supabase
        .from('agent_runs')
        .insert({
          user_id: userId,
          agent_id: agentId,
          model: usedModel,
          prompt: userPrompt,
          response: content,
          duration_ms: durationMs,
          prompt_tokens: usage?.prompt_tokens ?? null,
          completion_tokens: usage?.completion_tokens ?? null,
          total_tokens: usage?.total_tokens ?? null,
          cost_usd: costUsd,
          provider,
        })
        .select('id')
    )

    agentRunsTotal.inc({
      agent_id: agentId,
      provider,
      fallback: fallbackTriggered ? 'true' : 'false',
    })
    if (costUsd !== null && costUsd > 0) {
      agentRunCostUsdTotal.inc({ agent_id: agentId, model: usedModel }, costUsd)
    }

    await insertAuditEvent(supabase, {
      user_id: userId,
      agent_id: agentId,
      event_type: 'agent.run.completed',
      metadata: {
        model: usedModel,
        duration_ms: durationMs,
        fallback_triggered: fallbackTriggered,
      },
    })

    if (agentId === 'devops') {
      try {
        await (input.appendDevopsDiagnosticRun ?? appendDevopsDiagnosticRun)({
          supabase,
          userId,
          diagnostics: devopsDiagnostics,
          timeline: devopsTimeline,
          parity: devopsParity,
          summaryPayload:
            parsedOutput && typeof parsedOutput === 'object'
              ? (parsedOutput as Record<string, unknown>)
              : null,
        })
      } catch (error) {
        console.error('devops diagnostic snapshot write failed', error)
      }

      await syncAgentRunStats({
        supabase,
        userId,
        agentId,
        nowIso: now().toISOString(),
        defaultModel: undefined,
      })

      return {
        ok: true,
        content,
        durationMs,
        model: usedModel,
        agentRunId: agentRun?.id ?? null,
        parsedOutput,
      }
    }

    if (agentId === 'prospect' && !parsedOutput) {
      throw new RunAgentStepError('Prospect output invalid JSON', 422)
    }

    if (agentId === 'scout') {
      const parsed = parsePipelineIdea(content)
      if (pipeline && pipeline.status === 'pending_validation') {
        await supabase
          .from('venture_pipeline')
          .update({ status: 'rejected', updated_at: now().toISOString() })
          .eq('id', pipeline.id)
      }

      const newPipeline = await single<{ id?: string }>(
        supabase
          .from('venture_pipeline')
          .insert({
            user_id: userId,
            ...parsed,
            scout_raw: content,
            status: 'pending_validation',
          })
          .select('id')
      )

      await syncAgentRunStats({
        supabase,
        userId,
        agentId,
        nowIso: now().toISOString(),
        defaultModel: undefined,
      })

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

    if (agentId === 'prospect' && parsedOutput && 'company_name' in parsedOutput) {
      const prospect = parsedOutput as ProspectOutput
      if (hasSyntheticBusinessMarker(prospect)) {
        throw new RunAgentStepError('Synthetic prospect output refused', 422)
      }
      const inputCompanyName =
        typeof input.structuredInput?.companyName === 'string' &&
        input.structuredInput.companyName.trim().length > 0
          ? input.structuredInput.companyName.trim()
          : prospect.company_name
      const inputContactName =
        typeof input.structuredInput?.contactName === 'string' &&
        input.structuredInput.contactName.trim().length > 0
          ? input.structuredInput.contactName.trim()
          : (prospect.contact_name ?? null)
      const inputContactRole =
        typeof input.structuredInput?.contactRole === 'string' &&
        input.structuredInput.contactRole.trim().length > 0
          ? input.structuredInput.contactRole.trim()
          : (typeof prospect.contact_role === 'string' ? prospect.contact_role.trim() : null)
      const inputContactEmail =
        typeof input.structuredInput?.contactEmail === 'string' &&
        input.structuredInput.contactEmail.trim().length > 0
          ? input.structuredInput.contactEmail.trim()
          : (typeof prospect.contact_email === 'string' ? prospect.contact_email.trim() : null)
      const inputSourceUrl =
        typeof prospect.source_url === 'string' && prospect.source_url.trim().length > 0
          ? prospect.source_url.trim()
          : null

      if (!inputContactEmail) {
        throw new RunAgentStepError('Prospect output missing verified contact email', 422)
      }
      const inputSource = normalizeProspectSource(input.structuredInput?.source, prospect.source)
      const inputFocus =
        typeof input.structuredInput?.focus === 'string' && input.structuredInput.focus.trim().length > 0
          ? input.structuredInput.focus.trim()
          : 'prospect'
      const inputOfferVariant =
        typeof input.structuredInput?.offerVariant === 'string' &&
        input.structuredInput.offerVariant.trim().length > 0
          ? input.structuredInput.offerVariant.trim()
          : 'prospect_run'
      const inputOutreachAngle =
        typeof input.structuredInput?.outreachAngle === 'string' &&
        input.structuredInput.outreachAngle.trim().length > 0
          ? input.structuredInput.outreachAngle.trim()
          : inputFocus
      const generatedDraft = buildProspectOutreach({
        companyName: inputCompanyName,
        contactName: inputContactName,
        source: inputSource,
        score: prospect.score,
        band: prospect.band,
        painPoints: prospect.pain_points,
        focus: inputFocus === 'crm' || inputFocus === 'reply' ? inputFocus : 'prospect',
      })
      const prospectInsert = await single<{ id?: string }>(
        supabase
          .from('prospects')
          .insert({
            user_id: userId,
            source: inputSource,
            source_url: inputSourceUrl,
            company_name: inputCompanyName,
            contact_name: inputContactName,
            contact_email: inputContactEmail,
            contact_role: inputContactRole,
            score: prospect.score,
            status:
              prospect.band === 'hot'
                ? 'ready_to_contact'
                : prospect.band === 'warm'
                  ? 'follow_up'
                  : 'nurture',
            band: prospect.band,
            outreach_subject: prospect.outreach_subject,
            outreach_body: prospect.outreach_body,
            crm_record_id: null,
            last_contacted_at: null,
            next_followup_at: prospectFollowUpAt(now(), prospect.band),
            offer_id: null,
            offer_variant: inputOfferVariant,
            outreach_angle: inputOutreachAngle,
            metadata: {
              summary: prospect.summary,
              pain_points: prospect.pain_points,
              cta: prospect.cta,
              model: usedModel,
              model_family: getModelFamily(usedModel),
              provider,
              sources: prospectContext.settings?.prospect_sources ?? [],
              outreach_email: prospectContext.settings?.prospect_outreach_email ?? '',
              crm_provider: prospectContext.settings?.prospect_crm_provider ?? 'supabase',
              generated_draft: generatedDraft,
              memory_record: buildProspectMemoryRecord({
                id: 'pending',
                companyName: inputCompanyName,
                source: inputSource,
                score: prospect.score,
                band: prospect.band,
                summary: prospect.summary,
                tags: prospect.pain_points,
                contactName: inputContactName,
                contactRole: inputContactRole,
                contactEmail: inputContactEmail,
              }),
            },
            created_at: now().toISOString(),
            updated_at: now().toISOString(),
          })
          .select('id')
      )

      if (prospectInsert?.id) {
        await supabase
          .from('prospects')
          .update({
            metadata: {
              summary: prospect.summary,
              pain_points: prospect.pain_points,
              cta: prospect.cta,
              model: usedModel,
              model_family: getModelFamily(usedModel),
              provider,
              sources: prospectContext.settings?.prospect_sources ?? [],
              outreach_email: prospectContext.settings?.prospect_outreach_email ?? '',
              crm_provider: prospectContext.settings?.prospect_crm_provider ?? 'supabase',
              generated_draft: generatedDraft,
              memory_record: buildProspectMemoryRecord({
                id: prospectInsert.id,
                companyName: inputCompanyName,
                source: inputSource,
                score: prospect.score,
                band: prospect.band,
                summary: prospect.summary,
                tags: prospect.pain_points,
                contactName: inputContactName,
                contactRole: inputContactRole,
                contactEmail: inputContactEmail,
              }),
            },
          })
          .eq('id', prospectInsert.id)

        await ensureProspectOutreachApproval({
          supabase,
          userId,
          prospectId: prospectInsert.id,
          prospect,
          nowIso: now().toISOString(),
        })

        try {
          await (input.writeProspectMemory ?? writeProspectMemory)({
            userId,
            prospectId: prospectInsert.id,
            companyName: inputCompanyName,
            memoryKind: 'prospect_created',
            pipelineStatus:
              prospect.band === 'hot'
                ? 'ready_to_contact'
                : prospect.band === 'warm'
                  ? 'follow_up'
                  : 'nurture',
            band: prospect.band,
            source: inputSource,
            createdAt: now().toISOString(),
            summary: prospect.summary,
            painPoints: prospect.pain_points,
            tags: prospect.pain_points,
          })
        } catch (error) {
          console.error('prospect memory write failed', error)
        }
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

      if (agentId === 'builder' && pipeline.venture_id && isBuilderOutput(parsedOutput)) {
        const builderOutput: BuilderOutput = parsedOutput
        await materializeBuilderOutput({
          ventureId: pipeline.venture_id,
          ventureName: pipeline.idea_title,
          builderOutput,
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

      if (
        agentId === 'marketing' &&
        parsedOutput &&
        'channels' in parsedOutput &&
        'messages' in parsedOutput
      ) {
        const drafts = buildCampaignDrafts({
          userId,
          ventureId: pipeline.venture_id ?? null,
          output: parsedOutput as MarketingOutputShape,
        })
        for (const draft of drafts) {
          const inserted = await single<{ id?: string }>(
            supabase
              .from('campaign_drafts')
              .insert(draft as unknown as Record<string, unknown>)
              .select('id')
          )
          if (!inserted?.id || !pipeline.venture_id) continue

          const action = await single<{ id?: string }>(
            supabase
              .from('autonomy_actions')
              .insert({
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
              })
              .select('id')
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

    await syncAgentRunStats({
      supabase,
      userId,
      agentId,
      nowIso: now().toISOString(),
      defaultModel: undefined,
    })

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
      await supabase
        .from('venture_pipeline')
        .update({ current_agent: null, updated_at: now().toISOString() })
        .eq('id', pipeline.id)
    }
    if (error instanceof RunAgentStepError) throw error
    const message = error instanceof Error ? error.message : 'LLM indisponible'
    const isTimeout =
      error instanceof Error && (error.name === 'TimeoutError' || /timeout/i.test(error.message))
    throw new RunAgentStepError(isTimeout ? 'LLM timeout (30s)' : message, 502)
  }
}
