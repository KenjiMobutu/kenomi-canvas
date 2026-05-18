import { describe, expect, it } from 'vitest'
import { runAgentStep, type RunAgentStepSupabase } from './run-agent-step'
import type { LLMResponse } from '../llm-client'

type TableName =
  | 'agent_configs'
  | 'venture_pipeline'
  | 'agent_runs'
  | 'agent_events'
  | 'landing_pages'
  | 'venture_events'
  | 'autonomy_actions'
  | 'human_approvals'
  | 'autonomy_jobs'
  | 'decisions'
  | 'campaign_drafts'

interface TableRow {
  id?: string
  user_id?: string
  agent_id?: string
  status?: string
  [key: string]: unknown
}

function createFakeSupabase(
  seed?: Partial<Record<TableName, TableRow[]>>
): RunAgentStepSupabase & { tables: Record<TableName, TableRow[]> } {
  const tables: Record<TableName, TableRow[]> = {
    agent_configs: seed?.agent_configs ?? [],
    venture_pipeline: seed?.venture_pipeline ?? [],
    agent_runs: seed?.agent_runs ?? [],
    agent_events: seed?.agent_events ?? [],
    landing_pages: seed?.landing_pages ?? [],
    venture_events: seed?.venture_events ?? [],
    autonomy_actions: seed?.autonomy_actions ?? [],
    human_approvals: seed?.human_approvals ?? [],
    autonomy_jobs: seed?.autonomy_jobs ?? [],
    decisions: seed?.decisions ?? [],
    campaign_drafts: seed?.campaign_drafts ?? [],
  }

  return {
    tables,
    from(table: string) {
      const tableName = table as TableName
      const state = {
        filters: [] as Array<{ field: string; value: unknown; op: 'eq' | 'not' }>,
        patch: null as TableRow | null,
        inserted: null as TableRow | null,
      }

      const matches = (row: TableRow) =>
        state.filters.every((filter) => {
          if (filter.op === 'eq') return row[filter.field] === filter.value
          return row[filter.field] !== filter.value
        })

      const builder = {
        select: () => builder,
        eq: (field: string, value: unknown) => {
          state.filters.push({ field, value, op: 'eq' })
          return builder
        },
        not: (field: string, _operator: string, value: unknown) => {
          state.filters.push({ field, value, op: 'not' })
          return builder
        },
        order: () => builder,
        limit: () => builder,
        insert: (row: TableRow | TableRow[]) => {
          if (Array.isArray(row)) {
            row.forEach((r, i) => {
              const stamped = { id: `${tableName}-${tables[tableName].length + 1 + i}`, ...r }
              tables[tableName].push(stamped)
            })
            state.inserted = null
          } else {
            state.inserted = { id: `${tableName}-${tables[tableName].length + 1}`, ...row }
            tables[tableName].push(state.inserted)
          }
          return builder
        },
        update: (patch: TableRow) => {
          state.patch = patch
          return builder
        },
        maybeSingle: async () => {
          const row = tables[tableName].find(matches) ?? null
          return { data: row, error: null }
        },
        single: async () => {
          const row = state.inserted ?? tables[tableName].find(matches) ?? null
          return { data: row, error: null }
        },
        then: (resolve: (value: { data: TableRow[] | null; error: null }) => unknown) => {
          if (state.patch) {
            tables[tableName].filter(matches).forEach((row) => Object.assign(row, state.patch))
          }
          return Promise.resolve(resolve({ data: tables[tableName].filter(matches), error: null }))
        },
      }
      return builder
    },
  } as RunAgentStepSupabase & { tables: Record<TableName, TableRow[]> }
}

describe('runAgentStep', () => {
  it('exécute Scout côté serveur et crée un pipeline pending_validation', async () => {
    const supabase = createFakeSupabase()
    const llm = async (): Promise<LLMResponse> => ({
      content: [
        'TITRE: InboxPulse',
        'NICHE: agences B2B',
        'PROBLÈME: les leads email sont mal priorisés',
        'SOLUTION: scoring automatique des conversations',
        'MARCHÉ: agences de prospection outbound',
      ].join('\n'),
      provider: 'ollama',
      model: 'qwen3:8b',
      fallback_triggered: false,
    })

    const result = await runAgentStep({
      supabase,
      userId: 'user-1',
      agentId: 'scout',
      llm,
      now: () => new Date('2026-05-18T10:00:00.000Z'),
    })

    expect(result.ok).toBe(true)
    expect(result.agentRunId).toBe('agent_runs-1')
    expect(result.parsedOutput).toMatchObject({ title: 'InboxPulse' })
    expect(supabase.tables.venture_pipeline[0]).toMatchObject({
      user_id: 'user-1',
      idea_title: 'InboxPulse',
      status: 'pending_validation',
    })
  })

  it('met à jour une étape validation et retourne le score parsé', async () => {
    const supabase = createFakeSupabase({
      venture_pipeline: [
        {
          id: 'pipeline-1',
          user_id: 'user-1',
          status: 'approved',
          idea_title: 'InboxPulse',
          idea_niche: 'agences B2B',
          idea_problem: 'priorisation',
          idea_solution: 'scoring',
          idea_market: 'outbound',
          validation_output: null,
          builder_output: null,
          payment_output: null,
          marketing_output: null,
          decision_output: null,
          venture_id: 'venture-1',
        },
      ],
    })
    const llm = async (): Promise<LLMResponse> => ({
      content: JSON.stringify({
        score: 82,
        tam: '120M EUR',
        cpc: '3.20 EUR',
        seo_difficulty: 'moyen',
        verdict: 'go',
        reason: 'Signal clair.',
      }),
      provider: 'ollama',
      model: 'qwen3:8b',
      fallback_triggered: false,
    })

    const result = await runAgentStep({
      supabase,
      userId: 'user-1',
      agentId: 'validation',
      llm,
      now: () => new Date('2026-05-18T10:00:00.000Z'),
    })

    expect(result.parsedOutput).toMatchObject({ score: 82, verdict: 'go' })
    expect(supabase.tables.venture_pipeline[0]).toMatchObject({
      validation_score: 82,
      current_agent: null,
    })
  })

  it('injecte les métriques business réelles dans le prompt Decision', async () => {
    let systemPrompt = ''
    const supabase = createFakeSupabase({
      venture_pipeline: [
        {
          id: 'pipeline-1',
          user_id: 'user-1',
          status: 'approved',
          idea_title: 'InboxPulse',
          idea_niche: 'agences B2B',
          idea_problem: 'priorisation',
          idea_solution: 'scoring',
          idea_market: 'outbound',
          validation_output: 'ok',
          builder_output: 'ok',
          payment_output: 'ok',
          marketing_output: 'ok',
          decision_output: null,
          venture_id: 'venture-1',
        },
      ],
      venture_events: [
        { venture_id: 'venture-1', event_type: 'page_view', value: null },
        { venture_id: 'venture-1', event_type: 'waitlist_signup', value: null },
        { venture_id: 'venture-1', event_type: 'payment_succeeded', value: 2900 },
      ],
    })
    const llm = async (_messages: unknown, config: { system: string }): Promise<LLMResponse> => {
      systemPrompt = config.system
      return {
        content: JSON.stringify({
          verdict: 'continue',
          confidence: 78,
          rationale: 'Les métriques réelles sont positives.',
          next_step: 'Créer le checkout.',
        }),
        provider: 'ollama',
        model: 'qwen3:8b',
        fallback_triggered: false,
      }
    }

    await runAgentStep({
      supabase,
      userId: 'user-1',
      agentId: 'decision',
      llm,
      now: () => new Date('2026-05-18T10:00:00.000Z'),
    })

    expect(systemPrompt).toContain('Métriques business réelles')
    expect(systemPrompt).toContain('Visites : 1')
    expect(systemPrompt).toContain('Revenu : 29.00 EUR')
  })

  it('transforme un verdict Decision continue en action de scaling bloquée par approbation', async () => {
    const supabase = createFakeSupabase({
      venture_pipeline: [
        {
          id: 'pipeline-1',
          user_id: 'user-1',
          status: 'approved',
          idea_title: 'InboxPulse',
          idea_niche: 'agences B2B',
          idea_problem: 'priorisation',
          idea_solution: 'scoring',
          idea_market: 'outbound',
          validation_output: 'ok',
          builder_output: 'ok',
          payment_output: 'ok',
          marketing_output: 'ok',
          decision_output: null,
          venture_id: 'venture-1',
        },
      ],
    })
    const llm = async (): Promise<LLMResponse> => ({
      content: JSON.stringify({
        verdict: 'continue',
        confidence: 84,
        rationale: 'Le taux de conversion et la marge justifient un test budget.',
        next_step: 'Augmenter le budget acquisition à 50 EUR.',
      }),
      provider: 'ollama',
      model: 'qwen3:8b',
      fallback_triggered: false,
    })

    await runAgentStep({
      supabase,
      userId: 'user-1',
      agentId: 'decision',
      llm,
      now: () => new Date('2026-05-18T10:00:00.000Z'),
    })

    expect(supabase.tables.autonomy_actions).toHaveLength(1)
    expect(supabase.tables.autonomy_actions[0]).toMatchObject({
      user_id: 'user-1',
      venture_id: 'venture-1',
      action_type: 'scale_budget',
      risk_level: 'high',
      status: 'blocked',
    })
    expect(supabase.tables.autonomy_actions[0].input).toMatchObject({
      pipeline_id: 'pipeline-1',
      verdict: 'continue',
      confidence: 84,
    })
    expect(supabase.tables.human_approvals).toHaveLength(1)
    expect(supabase.tables.human_approvals[0]).toMatchObject({
      user_id: 'user-1',
      action_id: 'autonomy_actions-1',
      status: 'pending',
    })
    expect(supabase.tables.decisions[0]).toMatchObject({
      venture_id: 'venture-1',
      decision: 'continue',
      reason: 'Le taux de conversion et la marge justifient un test budget.',
    })
    expect(supabase.tables.decisions[0].metrics_snapshot).toMatchObject({
      confidence: 84,
      next_step: 'Augmenter le budget acquisition à 50 EUR.',
      pipeline_id: 'pipeline-1',
    })
  })

  it('Decision stocke un metrics_snapshot complet (visits/revenue/spend/profit/ROI) depuis venture_events', async () => {
    const supabase = createFakeSupabase({
      venture_pipeline: [
        {
          id: 'pipeline-1',
          user_id: 'user-1',
          status: 'approved',
          idea_title: 'InboxPulse',
          idea_niche: 'agences B2B',
          idea_problem: 'priorisation',
          idea_solution: 'scoring',
          idea_market: 'outbound',
          validation_output: 'ok',
          builder_output: 'ok',
          payment_output: 'ok',
          marketing_output: 'ok',
          decision_output: null,
          venture_id: 'venture-1',
        },
      ],
      venture_events: [
        { venture_id: 'venture-1', event_type: 'page_view', value: null },
        { venture_id: 'venture-1', event_type: 'page_view', value: null },
        { venture_id: 'venture-1', event_type: 'page_view', value: null },
        { venture_id: 'venture-1', event_type: 'waitlist_signup', value: null },
        { venture_id: 'venture-1', event_type: 'payment_succeeded', value: 10000 },
        { venture_id: 'venture-1', event_type: 'campaign_spend', value: 3000 },
      ],
    })
    const llm = async (): Promise<LLMResponse> => ({
      content: JSON.stringify({
        verdict: 'continue',
        confidence: 90,
        rationale: 'ROI positif.',
        next_step: 'Scale.',
      }),
      provider: 'ollama',
      model: 'qwen3:8b',
      fallback_triggered: false,
    })

    await runAgentStep({
      supabase,
      userId: 'user-1',
      agentId: 'decision',
      llm,
      now: () => new Date('2026-05-18T10:00:00.000Z'),
    })

    expect(supabase.tables.decisions[0].metrics_snapshot).toMatchObject({
      confidence: 90,
      next_step: 'Scale.',
      pipeline_id: 'pipeline-1',
      visits: 3,
      signups: 1,
      revenue_cents: 10000,
      spend_cents: 3000,
      profit_cents: 7000,
    })
    const snapshot = supabase.tables.decisions[0].metrics_snapshot as Record<string, number>
    expect(snapshot.signup_rate).toBeCloseTo(1 / 3, 4)
    expect(snapshot.roi).toBeCloseTo(7000 / 3000, 4)
  })

  it('transforme un verdict Decision pivot en nouvelle tâche Scout contextualisée', async () => {
    const supabase = createFakeSupabase({
      venture_pipeline: [
        {
          id: 'pipeline-1',
          user_id: 'user-1',
          status: 'approved',
          idea_title: 'InboxPulse',
          idea_niche: 'agences B2B',
          idea_problem: 'priorisation',
          idea_solution: 'scoring',
          idea_market: 'outbound',
          validation_output: 'ok',
          builder_output: 'ok',
          payment_output: 'ok',
          marketing_output: 'ok',
          decision_output: null,
          venture_id: 'venture-1',
        },
      ],
    })
    const llm = async (): Promise<LLMResponse> => ({
      content: JSON.stringify({
        verdict: 'pivot',
        confidence: 71,
        rationale: 'La demande existe mais la cible convertit mal.',
        next_step: 'Tester une niche de cabinets de recrutement.',
      }),
      provider: 'ollama',
      model: 'qwen3:8b',
      fallback_triggered: false,
    })

    await runAgentStep({
      supabase,
      userId: 'user-1',
      agentId: 'decision',
      llm,
      now: () => new Date('2026-05-18T10:00:00.000Z'),
    })

    expect(supabase.tables.autonomy_jobs).toHaveLength(1)
    expect(supabase.tables.autonomy_jobs[0]).toMatchObject({
      user_id: 'user-1',
      venture_id: 'venture-1',
      kind: 'run_agent',
      status: 'queued',
      next_run_at: '2026-05-18T10:00:00.000Z',
    })
    expect(supabase.tables.autonomy_jobs[0].payload).toMatchObject({
      agentId: 'scout',
      source: 'decision_pivot',
      pipelineId: 'pipeline-1',
      decision: {
        verdict: 'pivot',
        confidence: 71,
      },
    })
    expect(
      String((supabase.tables.autonomy_jobs[0].payload as Record<string, unknown>).prompt)
    ).toContain('cabinets de recrutement')
  })

  it('transforme un verdict Decision stop en action stop_venture bloquée par approbation', async () => {
    const supabase = createFakeSupabase({
      venture_pipeline: [
        {
          id: 'pipeline-1',
          user_id: 'user-1',
          status: 'approved',
          idea_title: 'InboxPulse',
          idea_niche: 'agences B2B',
          idea_problem: 'priorisation',
          idea_solution: 'scoring',
          idea_market: 'outbound',
          validation_output: 'ok',
          builder_output: 'ok',
          payment_output: 'ok',
          marketing_output: 'ok',
          decision_output: null,
          venture_id: 'venture-1',
        },
      ],
    })
    const llm = async (): Promise<LLMResponse> => ({
      content: JSON.stringify({
        verdict: 'stop',
        confidence: 89,
        rationale: 'Le coût acquisition dépasse le revenu attendu.',
        next_step: 'Arrêter la venture et conserver les apprentissages.',
      }),
      provider: 'ollama',
      model: 'qwen3:8b',
      fallback_triggered: false,
    })

    await runAgentStep({
      supabase,
      userId: 'user-1',
      agentId: 'decision',
      llm,
      now: () => new Date('2026-05-18T10:00:00.000Z'),
    })

    expect(supabase.tables.autonomy_actions).toHaveLength(1)
    expect(supabase.tables.autonomy_actions[0]).toMatchObject({
      user_id: 'user-1',
      venture_id: 'venture-1',
      action_type: 'stop_venture',
      risk_level: 'high',
      status: 'blocked',
    })
    expect(supabase.tables.human_approvals[0]).toMatchObject({
      user_id: 'user-1',
      action_id: 'autonomy_actions-1',
      status: 'pending',
    })
  })

  it('Marketing insère un campaign_draft par channel × message après le run', async () => {
    const supabase = createFakeSupabase({
      venture_pipeline: [
        {
          id: 'pipeline-1',
          user_id: 'user-1',
          status: 'approved',
          idea_title: 'InboxPulse',
          idea_niche: 'agences B2B',
          idea_problem: 'priorisation',
          idea_solution: 'scoring',
          idea_market: 'outbound',
          validation_output: 'ok',
          builder_output: 'ok',
          payment_output: 'ok',
          marketing_output: null,
          decision_output: null,
          venture_id: 'venture-1',
        },
      ],
    })
    const llm = async (): Promise<LLMResponse> => ({
      content: JSON.stringify({
        channels: ['email', 'twitter'],
        messages: ['Lance ton SaaS', 'Try it free'],
        day1: 'Setup landing',
        day3: 'Drive traffic',
        day7: 'Convert leads',
      }),
      provider: 'ollama',
      model: 'qwen3:8b',
      fallback_triggered: false,
    })

    await runAgentStep({
      supabase,
      userId: 'user-1',
      agentId: 'marketing',
      llm,
      now: () => new Date('2026-05-18T10:00:00.000Z'),
    })

    expect(supabase.tables.campaign_drafts).toHaveLength(4)
    expect(supabase.tables.campaign_drafts[0]).toMatchObject({
      user_id: 'user-1',
      venture_id: 'venture-1',
      channel: 'email',
      content: 'Lance ton SaaS',
      status: 'draft',
    })
    expect(supabase.tables.campaign_drafts[3]).toMatchObject({
      channel: 'twitter',
      content: 'Try it free',
    })
    // 4 actions publish_campaign blocked + 4 approvals pending
    const publishActions = supabase.tables.autonomy_actions.filter(
      (a) => a.action_type === 'publish_campaign'
    )
    expect(publishActions).toHaveLength(4)
    expect(publishActions.every((a) => a.status === 'blocked' && a.risk_level === 'high')).toBe(
      true
    )
    expect(publishActions[0]).toMatchObject({
      venture_id: 'venture-1',
      input: expect.objectContaining({ channel: 'email', pipeline_id: 'pipeline-1' }),
    })
    const approvals = supabase.tables.human_approvals.filter(
      (h) =>
        h.reason && typeof h.reason === 'string' && (h.reason as string).startsWith('Publier sur')
    )
    expect(approvals).toHaveLength(4)
    expect(approvals.every((a) => a.status === 'pending')).toBe(true)
  })
})
