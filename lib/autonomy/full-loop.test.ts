import { describe, expect, it } from 'vitest'
import type { LLMResponse } from '@/lib/llm-client'
import { aggregateVentureMetrics } from '@/lib/metrics/venture-metrics'
import { buildVentureInsertFromPipeline } from '@/lib/venture-materializer'
import type { MarketingPublisher } from '@/lib/marketing/adapters'
import { runAgentStep, type RunAgentStepSupabase } from './run-agent-step'
import { resolveHumanApproval, type ApprovalExecutorSupabase } from './approval-executor'

type TableName =
  | 'agent_configs'
  | 'agent_runs'
  | 'agent_events'
  | 'venture_pipeline'
  | 'ventures'
  | 'landing_pages'
  | 'payments'
  | 'campaign_drafts'
  | 'venture_events'
  | 'decisions'
  | 'autonomy_jobs'
  | 'autonomy_actions'
  | 'human_approvals'
  | 'budget_requests'
  | 'campaigns'

interface TableRow {
  id?: string
  user_id?: string
  venture_id?: string | null
  action_id?: string
  agent_id?: string
  status?: string
  [key: string]: unknown
}

type QueryResponse = { data: TableRow[] | TableRow | null; error: null }

function createFakeSupabase(seed?: Partial<Record<TableName, TableRow[]>>) {
  const tables: Record<TableName, TableRow[]> = {
    agent_configs: seed?.agent_configs ?? [],
    agent_runs: seed?.agent_runs ?? [],
    agent_events: seed?.agent_events ?? [],
    venture_pipeline: seed?.venture_pipeline ?? [],
    ventures: seed?.ventures ?? [],
    landing_pages: seed?.landing_pages ?? [],
    payments: seed?.payments ?? [],
    campaign_drafts: seed?.campaign_drafts ?? [],
    venture_events: seed?.venture_events ?? [],
    decisions: seed?.decisions ?? [],
    autonomy_jobs: seed?.autonomy_jobs ?? [],
    autonomy_actions: seed?.autonomy_actions ?? [],
    human_approvals: seed?.human_approvals ?? [],
    budget_requests: seed?.budget_requests ?? [],
    campaigns: seed?.campaigns ?? [],
  }

  const nextId = (tableName: TableName) => `${tableName}-${tables[tableName].length + 1}`

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

      const execute = async (): Promise<QueryResponse> => {
        if (state.patch) {
          tables[tableName].filter(matches).forEach((row) => Object.assign(row, state.patch))
        }
        return { data: tables[tableName].filter(matches), error: null }
      }

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
            row.forEach((item) => {
              tables[tableName].push({ id: item.id ?? nextId(tableName), ...item })
            })
            state.inserted = null
          } else {
            state.inserted = { id: row.id ?? nextId(tableName), ...row }
            tables[tableName].push(state.inserted)
          }
          return builder
        },
        update: (patch: TableRow) => {
          state.patch = patch
          return builder
        },
        maybeSingle: async () => ({
          data: tables[tableName].find(matches) ?? null,
          error: null,
        }),
        single: async () => ({
          data: state.inserted ?? tables[tableName].find(matches) ?? null,
          error: null,
        }),
        then: <TResult1 = QueryResponse, TResult2 = never>(
          resolve?: ((value: QueryResponse) => TResult1 | PromiseLike<TResult1>) | null,
          reject?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
        ) => execute().then(resolve ?? undefined, reject ?? undefined),
      }
      return builder
    },
  } as RunAgentStepSupabase & ApprovalExecutorSupabase & { tables: Record<TableName, TableRow[]> }
}

function llm(content: unknown): () => Promise<LLMResponse> {
  return async () => ({
    content: typeof content === 'string' ? content : JSON.stringify(content),
    provider: 'ollama',
    model: 'fake-model',
    fallback_triggered: false,
  })
}

async function approveAction(input: {
  supabase: ReturnType<typeof createFakeSupabase>
  actionType: string
  publisher?: MarketingPublisher
  dryRun?: boolean
}) {
  const action = input.supabase.tables.autonomy_actions.find(
    (row) => row.action_type === input.actionType
  )
  if (!action?.id) throw new Error(`missing action ${input.actionType}`)
  const approval = input.supabase.tables.human_approvals.find((row) => row.action_id === action.id)
  if (!approval?.id) throw new Error(`missing approval for ${input.actionType}`)

  return resolveHumanApproval({
    supabase: input.supabase,
    userId: 'user-1',
    approvalId: approval.id,
    decision: 'approved',
    marketingPublisher: input.publisher,
    config: {
      enabled: true,
      dryRun: input.dryRun ?? false,
      globalBudgetCapEur: 500,
      portfolioMaxNewVenturesPerDay: 1,
      portfolioMaxActiveExperiments: 5,
    },
    now: () => new Date('2026-05-18T12:00:00.000Z'),
  })
}

describe('full autonomy loop with fakes', () => {
  it('discovers, builds, monetizes, markets, measures and creates a scale approval', async () => {
    const supabase = createFakeSupabase()

    await runAgentStep({
      supabase,
      userId: 'user-1',
      agentId: 'scout',
      llm: llm(
        [
          'TITRE: InboxPulse',
          'NICHE: agences B2B',
          'PROBLÈME: les leads email sont mal priorisés',
          'SOLUTION: scoring automatique des conversations',
          'MARCHÉ: agences de prospection outbound',
        ].join('\n')
      ),
      now: () => new Date('2026-05-18T09:00:00.000Z'),
    })

    const pipeline = supabase.tables.venture_pipeline[0]
    expect(pipeline).toMatchObject({ status: 'pending_validation', idea_title: 'InboxPulse' })

    const venture = {
      id: 'venture-1',
      ...buildVentureInsertFromPipeline({
        userId: 'user-1',
        ideaTitle: String(pipeline.idea_title),
        ideaNiche: String(pipeline.idea_niche),
        slug: 'inboxpulse',
      }),
    }
    supabase.tables.ventures.push(venture)
    Object.assign(pipeline, {
      status: 'approved',
      venture_id: venture.id,
      validation_output: null,
      builder_output: null,
      payment_output: null,
      marketing_output: null,
      decision_output: null,
      updated_at: '2026-05-18T09:05:00.000Z',
    })

    await runAgentStep({
      supabase,
      userId: 'user-1',
      agentId: 'validation',
      llm: llm({
        score: 84,
        tam: '120M EUR',
        cpc: '3.20 EUR',
        seo_difficulty: 'moyen',
        verdict: 'go',
        reason: 'La niche a un signal clair et une douleur fréquente.',
      }),
    })

    await runAgentStep({
      supabase,
      userId: 'user-1',
      agentId: 'builder',
      llm: llm({
        headline: 'Priorisez vos leads email',
        subline: 'Un scoring IA pour vos conversations commerciales.',
        cta: 'Rejoindre la beta',
        features: ['Score automatique', 'Alertes chaudes', 'Résumé quotidien'],
        pricing: '29 EUR/mois',
      }),
    })

    expect(supabase.tables.landing_pages[0]).toMatchObject({
      venture_id: 'venture-1',
      headline: 'Priorisez vos leads email',
      statut: 'deployed',
      copywriting: expect.objectContaining({
        hero: expect.objectContaining({
          headline: 'Priorisez vos leads email',
          cta: 'Rejoindre la beta',
        }),
      }),
    })

    await runAgentStep({
      supabase,
      userId: 'user-1',
      agentId: 'payment',
      llm: llm({
        product_name: 'InboxPulse',
        price_amount: 2900,
        price_currency: 'eur',
        billing: 'monthly',
        checkout_description: 'Scoring IA des leads email.',
        trial_days: 7,
      }),
    })

    supabase.tables.autonomy_actions.push({
      id: 'checkout-action-1',
      user_id: 'user-1',
      venture_id: 'venture-1',
      action_type: 'create_checkout',
      status: 'blocked',
      input: { pipeline_id: pipeline.id, payment_output: pipeline.payment_output },
    })
    supabase.tables.human_approvals.push({
      id: 'checkout-approval-1',
      user_id: 'user-1',
      action_id: 'checkout-action-1',
      status: 'pending',
    })

    const checkoutApproval = await approveAction({
      supabase,
      actionType: 'create_checkout',
      dryRun: true,
    })
    expect(checkoutApproval).toMatchObject({ executed: false, actionType: 'create_checkout' })
    expect(
      supabase.tables.autonomy_actions.find((row) => row.id === 'checkout-action-1')
    ).toMatchObject({
      status: 'completed',
      output: { dry_run: true },
    })

    await runAgentStep({
      supabase,
      userId: 'user-1',
      agentId: 'marketing',
      llm: llm({
        channels: ['email'],
        messages: ['InboxPulse priorise les leads à fort potentiel.'],
        day1: 'Préparer la séquence',
        day3: 'Publier la preuve',
        day7: 'Relancer les inscrits',
      }),
    })

    const publisher: MarketingPublisher = {
      publish: async () => ({
        externalId: 'mock-campaign-1',
        url: 'https://mock.local/campaign/mock-campaign-1',
      }),
    }
    const publishApproval = await approveAction({
      supabase,
      actionType: 'publish_campaign',
      publisher,
    })
    expect(publishApproval).toMatchObject({ executed: true, actionType: 'publish_campaign' })
    expect(
      supabase.tables.venture_events.find((row) => row.event_type === 'campaign_published')
    ).toBeTruthy()

    supabase.tables.venture_events.push(
      {
        id: 'event-page-1',
        user_id: 'user-1',
        venture_id: 'venture-1',
        event_type: 'page_view',
        value: null,
      },
      {
        id: 'event-waitlist-1',
        user_id: 'user-1',
        venture_id: 'venture-1',
        event_type: 'waitlist_signup',
        value: null,
      },
      {
        id: 'event-payment-1',
        user_id: 'user-1',
        venture_id: 'venture-1',
        event_type: 'payment_succeeded',
        value: 2900,
      },
      {
        id: 'event-spend-1',
        user_id: 'user-1',
        venture_id: 'venture-1',
        event_type: 'campaign_spend',
        value: 500,
      }
    )

    const metrics = aggregateVentureMetrics(
      supabase.tables.venture_events as Array<{ event_type: string; value: number | null }>
    )
    expect(metrics).toMatchObject({
      visits: 1,
      signups: 1,
      revenueCents: 2900,
      spendCents: 500,
      profitCents: 2400,
    })
    expect(metrics.roi).toBeCloseTo(4.8)

    await runAgentStep({
      supabase,
      userId: 'user-1',
      agentId: 'decision',
      llm: llm({
        verdict: 'continue',
        confidence: 91,
        rationale: 'ROI positif avec traction waitlist.',
        next_step: 'Augmenter le budget acquisition.',
      }),
    })

    const scaleAction = supabase.tables.autonomy_actions.find(
      (row) => row.action_type === 'scale_budget'
    )
    expect(scaleAction).toMatchObject({
      status: 'blocked',
      risk_level: 'high',
      venture_id: 'venture-1',
    })
    expect(supabase.tables.decisions[0].metrics_snapshot).toMatchObject({
      visits: 1,
      signups: 1,
      revenue_cents: 2900,
      spend_cents: 500,
      profit_cents: 2400,
    })

    const scaleApproval = await approveAction({
      supabase,
      actionType: 'scale_budget',
      dryRun: true,
    })
    expect(scaleApproval).toMatchObject({ executed: false, actionType: 'scale_budget' })
    expect(scaleAction).toMatchObject({
      status: 'completed',
      output: { dry_run: true, action_type: 'scale_budget' },
    })
  })
})
