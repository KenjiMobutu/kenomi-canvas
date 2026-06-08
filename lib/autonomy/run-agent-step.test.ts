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
  | 'user_settings'
  | 'prospects'
  | 'scout_signals'
  | 'devops_diagnostic_runs'

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
    user_settings: seed?.user_settings ?? [],
    prospects: seed?.prospects ?? [],
    scout_signals: seed?.scout_signals ?? [],
    devops_diagnostic_runs: seed?.devops_diagnostic_runs ?? [],
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
        contains: (field: string, value: unknown) => {
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
    let capturedSystem = ''
    const llm = async (
      _messages?: Parameters<NonNullable<Parameters<typeof runAgentStep>[0]['llm']>>[0],
      _config?: Parameters<NonNullable<Parameters<typeof runAgentStep>[0]['llm']>>[1]
    ): Promise<LLMResponse> => ({
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
    const observingLlm = async (
      messages: Parameters<NonNullable<Parameters<typeof runAgentStep>[0]['llm']>>[0],
      config: Parameters<NonNullable<Parameters<typeof runAgentStep>[0]['llm']>>[1]
    ): Promise<LLMResponse> => {
      capturedSystem = config.system
      return llm(messages, config)
    }

    const result = await runAgentStep({
      supabase,
      userId: 'user-1',
      agentId: 'scout',
      llm: observingLlm,
      scoutSourceCollector: async () => ({
        generatedAt: '2026-05-20T08:00:00.000Z',
        signals: [
          {
            sourceId: 'hacker-news',
            sourceLabel: 'Hacker News',
            signalType: 'pain',
            title: 'Ask HN: Best tool to reconcile Stripe revenue?',
            url: 'https://news.ycombinator.com/item?id=1',
            score: 86,
            evidence: '120 points, 44 commentaires',
            sellableOffer: {
              buyer: 'Finance ops teams using Stripe',
              urgentPain: 'Stripe revenue reconciliation is slow and error-prone',
              concretePromise: 'Reconcile Stripe revenue discrepancies before month-end close',
              offer: 'Stripe revenue reconciliation assistant',
              priceHypothesisEur: 79,
              acquisitionChannel: 'Hacker News founder discussions',
              landingAngle: 'Close Stripe revenue faster with fewer manual checks',
              evidenceUrl: 'https://news.ycombinator.com/item?id=1',
            },
          },
        ],
        failures: [],
      }),
      now: () => new Date('2026-05-18T10:00:00.000Z'),
    })

    expect(result.ok).toBe(true)
    expect(result.agentRunId).toBe('agent_runs-1')
    expect(result.parsedOutput).toMatchObject({ title: 'InboxPulse' })
    expect(capturedSystem).toContain('Sources gratuites Scout')
    expect(capturedSystem).toContain('Hacker News')
    expect(capturedSystem).toContain('buyer_likelihood')
    expect(supabase.tables.venture_pipeline[0]).toMatchObject({
      user_id: 'user-1',
      idea_title: 'InboxPulse',
      status: 'pending_validation',
    })
    expect(supabase.tables.scout_signals[0]).toMatchObject({
      user_id: 'user-1',
      source_id: 'hacker-news',
      title: 'Ask HN: Best tool to reconcile Stripe revenue?',
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

  it('injects retrieved memory into Prospect prompts and writes prospect memory on creation', async () => {
    const supabase = createFakeSupabase({
      user_settings: [
        {
          user_id: 'user-1',
          prospect_sources: ['linkedin'],
          prospect_outreach_email: 'ops@kenomi.eu',
          prospect_crm_provider: 'supabase',
        },
      ],
    })
    let capturedSystem = ''
    const memoryWrites: Array<Record<string, unknown>> = []

    const llm = async (
      _messages: Parameters<NonNullable<Parameters<typeof runAgentStep>[0]['llm']>>[0],
      config: Parameters<NonNullable<Parameters<typeof runAgentStep>[0]['llm']>>[1]
    ): Promise<LLMResponse> => {
      capturedSystem = config.system
      return {
        content: JSON.stringify({
          company_name: 'Acme Studio',
          source: 'linkedin',
          contact_name: 'Marie',
          contact_email: 'marie@acme.test',
          score: 82,
          band: 'warm',
          summary: 'Needs better follow-up visibility',
          pain_points: ['manual triage'],
          outreach_subject: 'Acme Studio — qualifier plus vite',
          outreach_body: 'Bonjour Marie, proposition concise.',
          cta: 'Reply to continue',
        }),
        provider: 'ollama',
        model: 'qwen3:8b',
        fallback_triggered: false,
      }
    }

    await runAgentStep({
      supabase,
      userId: 'user-1',
      agentId: 'prospect',
      llm,
      retrieveProspectMemories: async () => [{ id: 'm1', text: 'Memory 1', payload: {} }],
      writeProspectMemory: async (row) => {
        memoryWrites.push(row as unknown as Record<string, unknown>)
        return { ok: true, id: 'memory-1' }
      },
      now: () => new Date('2026-05-26T10:00:00.000Z'),
    })

    expect(capturedSystem).toContain('Relevant memory:')
    expect(capturedSystem).toContain('Memory 1')
    expect(memoryWrites).toEqual([
      expect.objectContaining({
        memoryKind: 'prospect_created',
        companyName: 'Acme Studio',
      }),
    ])
  })

  it('defaults Prospect reasoning to Hermes when no model override is configured', async () => {
    const supabase = createFakeSupabase()
    let capturedModel = ''
    let capturedTimeout = 0

    await runAgentStep({
      supabase,
      userId: 'user-1',
      agentId: 'prospect',
      llm: async (_messages, config) => {
        capturedModel = config.model
        capturedTimeout = config.timeout_ms ?? 0
        return {
          content: JSON.stringify({
            company_name: 'Acme Studio',
            source: 'linkedin',
            contact_name: 'Marie',
            contact_email: 'marie@acme.test',
            score: 82,
            band: 'warm',
            summary: 'Needs better follow-up visibility',
            pain_points: ['manual triage'],
            outreach_subject: 'Acme Studio — qualifier plus vite',
            outreach_body: 'Bonjour Marie, proposition concise.',
            cta: 'Reply to continue',
          }),
          provider: 'hermes',
          model: 'hermes3:8b',
          fallback_triggered: false,
        }
      },
      now: () => new Date('2026-05-26T10:00:00.000Z'),
    })

    expect(capturedModel).toBe('hermes3:8b')
    expect(capturedTimeout).toBe(90_000)
  })

  it('refuses to materialize synthetic smoke prospect outputs', async () => {
    const supabase = createFakeSupabase()

    await expect(
      runAgentStep({
        supabase,
        userId: 'user-1',
        agentId: 'prospect',
        llm: async (): Promise<LLMResponse> => ({
          content: JSON.stringify({
            company_name: 'Smoke Prospect Co xyz',
            source: 'linkedin',
            contact_name: 'Léa Martin',
            score: 82,
            band: 'warm',
            summary: 'Synthetic smoke lead',
            pain_points: ['manual triage'],
            outreach_subject: 'Smoke subject',
            outreach_body: 'Smoke body',
            cta: 'Reply to continue',
          }),
          provider: 'ollama',
          model: 'qwen3:4b',
          fallback_triggered: false,
        }),
        now: () => new Date('2026-05-26T10:00:00.000Z'),
      })
    ).rejects.toThrow('Synthetic prospect output refused')

    expect(supabase.tables.prospects).toHaveLength(0)
    expect(supabase.tables.autonomy_actions).toHaveLength(0)
  })

  it('fails Prospect runs that do not return strict JSON', async () => {
    const supabase = createFakeSupabase()

    await expect(
      runAgentStep({
        supabase,
        userId: 'user-1',
        agentId: 'prospect',
        llm: async (): Promise<LLMResponse> => ({
          content: 'I found a promising company but I cannot format JSON right now.',
          provider: 'ollama',
          model: 'qwen3:4b',
          fallback_triggered: false,
        }),
        now: () => new Date('2026-05-26T10:00:00.000Z'),
      })
    ).rejects.toThrow('Prospect output invalid JSON')

    expect(supabase.tables.prospects).toHaveLength(0)
  })

  it('fails Prospect runs that do not provide a verified contact email', async () => {
    const supabase = createFakeSupabase()

    await expect(
      runAgentStep({
        supabase,
        userId: 'user-1',
        agentId: 'prospect',
        llm: async (): Promise<LLMResponse> => ({
          content: JSON.stringify({
            company_name: 'Acme Studio',
            source: 'linkedin',
            score: 82,
            band: 'warm',
            summary: 'Needs better follow-up visibility',
            pain_points: ['manual triage'],
            outreach_subject: 'Acme Studio — qualifier plus vite',
            outreach_body: 'Bonjour, proposition concise.',
            cta: 'Reply to continue',
          }),
          provider: 'ollama',
          model: 'qwen3:4b',
          fallback_triggered: false,
        }),
        now: () => new Date('2026-05-26T10:00:00.000Z'),
      })
    ).rejects.toThrow('Prospect output missing verified contact email')

    expect(supabase.tables.prospects).toHaveLength(0)
  })

  it('materializes a grounded prospect candidate without calling the LLM', async () => {
    const supabase = createFakeSupabase({
      user_settings: [
        {
          user_id: 'user-1',
          prospect_sources: ['other'],
          prospect_outreach_email: 'hello@kenomi.eu',
          prospect_crm_provider: 'supabase',
        },
      ],
    })
    let llmCalled = false

    const result = await runAgentStep({
      supabase,
      userId: 'user-1',
      agentId: 'prospect',
      llm: async (): Promise<LLMResponse> => {
        llmCalled = true
        return {
          content: '{}',
          provider: 'ollama',
          model: 'qwen3:4b',
          fallback_triggered: false,
        }
      },
      findGroundedProspect: async () => ({
        company_name: 'Freshwork Studio',
        source: 'other',
        contact_name: 'Freshwork Studio',
        contact_role: 'Web Development Agency',
        contact_email: 'gonzalo@freshworkstudio.com',
        source_url: 'https://github.com/freshworkstudio',
        score: 70,
        band: 'warm',
        summary: 'Freshwork Studio exposes a public GitHub contact and runs a web agency.',
        pain_points: ['manual lead follow-up steals delivery time', 'sales admin competes with client work'],
        outreach_subject: 'Freshwork Studio — a faster way to handle lead follow-up',
        outreach_body: 'Hi Freshwork Studio,\n\nI found you via GitHub and saw a public contact path.',
        cta: 'Reply if this is worth a quick follow-up.',
      }),
      now: () => new Date('2026-05-26T10:00:00.000Z'),
    })

    expect(result.ok).toBe(true)
    expect(llmCalled).toBe(false)
    expect(result.parsedOutput).toMatchObject({
      company_name: 'Freshwork Studio',
      contact_email: 'gonzalo@freshworkstudio.com',
    })
    expect(supabase.tables.prospects).toHaveLength(1)
    expect(supabase.tables.prospects[0]).toMatchObject({
      company_name: 'Freshwork Studio',
      contact_email: 'gonzalo@freshworkstudio.com',
      source: 'other',
      source_url: 'https://github.com/freshworkstudio',
      segment: 'freelancers-small-agencies',
      offer_variant: '300eur-diagnostic',
      outreach_angle: 'diagnostic-call-outbound-v1',
    })
    expect(String(supabase.tables.prospects[0].outreach_subject)).toContain('300EUR Diagnostic')
    expect(String(supabase.tables.prospects[0].outreach_body)).toContain('https://lab.kenomi.eu/diagnostic-300')
  })

  it('passes existing prospect identities to grounded prospect selection', async () => {
    const supabase = createFakeSupabase({
      prospects: [
        {
          id: 'prospect-1',
          user_id: 'user-1',
          company_name: 'AE Studio',
          contact_email: 'humanagency@ae.studio',
          source_url: 'https://github.com/agencyenterprise',
        },
      ],
    })

    let groundedInput:
      | {
          query: string
          exclude?: {
            emails?: string[]
            sourceUrls?: string[]
            companyNames?: string[]
          }
        }
      | undefined

    await runAgentStep({
      supabase,
      userId: 'user-1',
      agentId: 'prospect',
      findGroundedProspect: async (input) => {
        groundedInput = input
        return {
          company_name: 'Freshwork Studio',
          source: 'other',
          contact_name: 'Freshwork Studio',
          contact_role: 'Web Development Agency',
          contact_email: 'gonzalo@freshworkstudio.com',
          source_url: 'https://github.com/freshworkstudio',
          score: 72,
          band: 'warm',
          summary: 'Freshwork Studio exposes a public GitHub contact and runs a web development agency.',
          pain_points: ['manual lead follow-up steals delivery time', 'sales admin competes with client work'],
          outreach_subject: 'Freshwork Studio — a faster way to handle lead follow-up',
          outreach_body: 'Hi Freshwork Studio.',
          cta: 'Reply if this is worth a quick follow-up.',
        }
      },
      now: () => new Date('2026-05-26T10:00:00.000Z'),
    })

    expect(groundedInput).toEqual(
      expect.objectContaining({
        exclude: {
          emails: ['humanagency@ae.studio'],
          sourceUrls: ['https://github.com/agencyenterprise'],
          companyNames: ['AE Studio'],
        },
      })
    )
  })

  it('runs the DevOps agent from grounded diagnostics context and persists a snapshot', async () => {
    const supabase = createFakeSupabase({
      agent_events: [
        {
          id: 'event-1',
          user_id: 'user-1',
          event_type: 'infra.diagnostic.record_incident',
          severity: 'error',
          metadata: {
            target_id: 'ollama',
            target_label: 'Ollama',
            status: 'down',
            last_error: 'timeout',
            repair_action: 'Verify Ollama reachability on the private host.',
          },
          created_at: '2026-05-27T10:00:00.000Z',
        },
      ],
    })
    let capturedSystem = ''
    const llm = async (
      _messages: Parameters<NonNullable<Parameters<typeof runAgentStep>[0]['llm']>>[0],
      config: Parameters<NonNullable<Parameters<typeof runAgentStep>[0]['llm']>>[1]
    ): Promise<LLMResponse> => {
      capturedSystem = config.system
      return {
        content: JSON.stringify({
          global_status: 'down',
          headline: '1 open infra incident',
          services: [
            {
              id: 'ollama',
              status: 'down',
              severity: 'high',
              reason: 'timeout',
              next_step: 'Verify Ollama reachability on the private host.',
            },
          ],
          summary: 'Ollama is unavailable and blocks local inference.',
          operator_next_step: 'Verify Ollama reachability on the private host.',
        }),
        provider: 'ollama',
        model: 'qwen3:8b',
        fallback_triggered: false,
      }
    }

    const result = await runAgentStep({
      supabase,
      userId: 'user-1',
      agentId: 'devops',
      llm,
      collectInfraDiagnostics: async () => ({
        checkedAt: '2026-05-27T10:00:00.000Z',
        runtime: {
          environment: 'production',
          sourceCommit: 'abc123456789',
          commitShort: 'abc1234',
        },
        summary: {
          ok: false,
          checksOk: 2,
          checksTotal: 3,
        },
        services: [
          {
            id: 'ollama',
            label: 'Ollama',
            status: 'down',
            source: 'settings',
            urlLabel: '192.168.0.14:11434',
            latencyMs: 5000,
            lastError: 'timeout',
            repairAction: 'Verify Ollama reachability on the private host.',
            checkedAt: '2026-05-27T10:00:00.000Z',
          },
        ],
        proxmox: {
          id: 'proxmox',
          label: 'Proxmox',
          status: 'ok',
          source: 'settings',
          urlLabel: '192.168.0.10:8006/api2/json/nodes/proxmox/status',
          latencyMs: 45,
          lastError: null,
          repairAction: 'Aucune action',
          checkedAt: '2026-05-27T10:00:00.000Z',
          detail: '1 node · 4 VMs',
        },
      }),
      now: () => new Date('2026-05-27T10:00:00.000Z'),
    })

    expect(result.parsedOutput).toMatchObject({
      global_status: 'down',
      services: [{ id: 'ollama', status: 'down' }],
    })
    expect(capturedSystem).toContain('DevOps diagnostics snapshot')
    expect(capturedSystem).toContain('Global status: down')
    expect(supabase.tables.devops_diagnostic_runs).toHaveLength(1)
    expect(supabase.tables.devops_diagnostic_runs[0]).toMatchObject({
      user_id: 'user-1',
      summary_status: 'down',
    })
    expect(supabase.tables.autonomy_actions).toHaveLength(0)
    expect(supabase.tables.human_approvals).toHaveLength(0)
  })

  it('repairs malformed DevOps JSON before persisting the snapshot', async () => {
    const supabase = createFakeSupabase()
    let callCount = 0
    const llm = async (): Promise<LLMResponse> => {
      callCount += 1
      if (callCount === 1) {
        return {
          content: `{
  "global_status": "ok",
  "headline": "Infra healthy",
  "services": [
    {"id": "Proxmox", "status": "ok", "severity": "low", "reason": "healthy", "next
  ],
  "summary": "Infra healthy",
  "operator_next_step": "Aucune action"
}`,
          provider: 'ollama',
          model: 'qwen3:8b',
          fallback_triggered: false,
        }
      }

      return {
        content: JSON.stringify({
          global_status: 'ok',
          headline: 'Infra healthy',
          services: [
            {
              id: 'Proxmox',
              status: 'ok',
              severity: 'low',
              reason: 'healthy',
              next_step: 'Aucune action',
            },
          ],
          summary: 'Infra healthy',
          operator_next_step: 'Aucune action',
        }),
        provider: 'ollama',
        model: 'qwen3:8b',
        fallback_triggered: false,
      }
    }

    const result = await runAgentStep({
      supabase,
      userId: 'user-1',
      agentId: 'devops',
      llm,
      collectInfraDiagnostics: async () => ({
        checkedAt: '2026-05-27T10:00:00.000Z',
        runtime: {
          environment: 'production',
          sourceCommit: 'abc123456789',
          commitShort: 'abc1234',
        },
        summary: {
          ok: true,
          checksOk: 2,
          checksTotal: 2,
        },
        services: [
          {
            id: 'proxmox',
            label: 'Proxmox',
            status: 'ok',
            source: 'settings',
            urlLabel: '10.0.0.1',
            latencyMs: 30,
            lastError: null,
            repairAction: 'Aucune action',
            checkedAt: '2026-05-27T10:00:00.000Z',
          },
        ],
        proxmox: {
          id: 'proxmox-node',
          label: 'Proxmox',
          status: 'ok',
          source: 'settings',
          urlLabel: '10.0.0.2',
          latencyMs: 40,
          lastError: null,
          repairAction: 'Aucune action',
          checkedAt: '2026-05-27T10:00:00.000Z',
          detail: '1 node · 0 incident',
        },
      }),
      now: () => new Date('2026-05-27T10:00:00.000Z'),
    })

    expect(callCount).toBe(2)
    expect(result.parsedOutput).toMatchObject({
      global_status: 'ok',
      services: [{ id: 'Proxmox', next_step: 'Aucune action' }],
    })
    expect(supabase.tables.devops_diagnostic_runs).toHaveLength(1)
  })

  it('injecte les métriques business réelles dans le prompt Decision', async () => {
    let systemPrompt = ''
    let capturedModel = ''
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
      capturedModel = (config as { model?: string }).model ?? ''
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
    expect(capturedModel).toBe('hermes3:8b')
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
    expect(supabase.tables.autonomy_actions[0]).toMatchObject({
      action_type: 'scale_budget',
      estimated_cost_eur: 30,
      budget_cap_eur: 50,
      input: expect.objectContaining({
        recommended_budget_eur: 30,
      }),
    })
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

  it('cible le pipeline de la venture demandée quand ventureId est fourni', async () => {
    const supabase = createFakeSupabase({
      venture_pipeline: [
        {
          id: 'pipeline-old',
          user_id: 'user-1',
          status: 'approved',
          idea_title: 'OldPulse',
          idea_niche: 'agences',
          idea_problem: 'ancien problème',
          idea_solution: 'ancienne solution',
          idea_market: 'ancien marché',
          validation_output: 'ok',
          builder_output: null,
          payment_output: null,
          marketing_output: null,
          decision_output: null,
          venture_id: 'venture-old',
        },
        {
          id: 'pipeline-target',
          user_id: 'user-1',
          status: 'approved',
          idea_title: 'InboxPulse',
          idea_niche: 'agences B2B',
          idea_problem: 'priorisation',
          idea_solution: 'scoring',
          idea_market: 'outbound',
          validation_output: 'ok',
          builder_output: null,
          payment_output: null,
          marketing_output: null,
          decision_output: null,
          venture_id: 'venture-target',
        },
      ],
    })
    const llm = async (): Promise<LLMResponse> => ({
      content: JSON.stringify({
        headline: 'Priorisez vos leads email',
        subline: 'Scoring IA pour équipes sales.',
        cta: 'Acheter maintenant',
        features: [
          'Score automatique: classe les leads à traiter en premier',
          'Alertes chaudes: remonte les conversations du jour',
          'Résumé quotidien: prépare les relances avant 9h',
        ],
        pricing: '29 EUR/mois',
        buyer: 'Agences B2B avec leads entrants',
        urgent_pain: 'Les leads chauds sont traités trop tard et se refroidissent.',
        concrete_promise: 'Prioriser les leads les plus proches de l achat chaque matin.',
        price_anchor: 'Moins qu une heure perdue sur un lead tiède.',
        objection_handling: ['Vous gardez votre CRM.', 'Aucun setup lourd.'],
        sections: [
          { title: 'Comment ça marche', body: 'Priorisez puis relancez.' },
          { title: 'Pourquoi maintenant', body: 'Chaque heure compte.' },
        ],
        faq: [
          { q: 'Pour qui ?', a: 'Agences B2B.' },
          { q: 'Quel prix ?', a: '29 EUR/mois.' },
        ],
      }),
      provider: 'ollama',
      model: 'qwen3:8b',
      fallback_triggered: false,
    })

    await runAgentStep({
      supabase,
      userId: 'user-1',
      agentId: 'builder',
      ventureId: 'venture-target',
      llm,
      now: () => new Date('2026-05-18T10:00:00.000Z'),
    })

    expect(supabase.tables.venture_pipeline[0].builder_output).toBeNull()
    expect(supabase.tables.venture_pipeline[1].builder_output).toContain('Priorisez vos leads')
    expect(supabase.tables.landing_pages[0]).toMatchObject({
      venture_id: 'venture-target',
      headline: 'Priorisez vos leads email',
    })
  })

  it('reconciles agent_configs.run_count from real agent_runs rows after a successful run', async () => {
    const supabase = createFakeSupabase({
      agent_configs: [
        {
          user_id: 'user-1',
          agent_id: 'scout',
          run_count: 9,
          last_run_at: '2026-05-18T09:00:00.000Z',
        },
      ],
      agent_runs: [
        {
          id: 'run-1',
          user_id: 'user-1',
          agent_id: 'scout',
          created_at: '2026-05-18T08:00:00.000Z',
        },
        {
          id: 'run-2',
          user_id: 'user-1',
          agent_id: 'scout',
          created_at: '2026-05-18T08:30:00.000Z',
        },
      ],
    })

    await runAgentStep({
      supabase,
      userId: 'user-1',
      agentId: 'scout',
      llm: async (): Promise<LLMResponse> => ({
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
      }),
      now: () => new Date('2026-05-18T10:00:00.000Z'),
    })

    expect(supabase.tables.agent_configs[0]).toMatchObject({
      user_id: 'user-1',
      agent_id: 'scout',
      run_count: 3,
      last_run_at: '2026-05-18T10:00:00.000Z',
    })
  })

  it('creates agent_configs counters when the agent has runs but no config row yet', async () => {
    const supabase = createFakeSupabase()

    await runAgentStep({
      supabase,
      userId: 'user-1',
      agentId: 'scout',
      llm: async (): Promise<LLMResponse> => ({
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
      }),
      now: () => new Date('2026-05-18T10:00:00.000Z'),
    })

    expect(supabase.tables.agent_configs).toContainEqual(
      expect.objectContaining({
        user_id: 'user-1',
        agent_id: 'scout',
        run_count: 1,
        last_run_at: '2026-05-18T10:00:00.000Z',
      })
    )
  })

  it('runs Prospect as a first-class autonomous agent and stores CRM state', async () => {
    const supabase = createFakeSupabase({
      user_settings: [
        {
          user_id: 'user-1',
          prospect_sources: ['linkedin', 'upwork'],
          prospect_outreach_email: 'hello@kenomi.eu',
          prospect_crm_provider: 'supabase',
        },
      ],
    })
    const llm = async (): Promise<LLMResponse> => ({
      content: JSON.stringify({
        company_name: 'Acme Studio',
        source: 'upwork',
        contact_name: 'Marie Dupont',
        contact_email: 'marie@acme.test',
        score: 88,
        band: 'hot',
        summary: 'L équipe a besoin d un accompagnement rapide pour prioriser les demandes entrantes.',
        pain_points: ['les leads chauds ne sont pas rappelés à temps', 'la qualification est manuelle'],
        outreach_subject: 'Acme Studio — une piste pour prioriser vos leads chauds',
        outreach_body: 'Bonjour Marie, je vous propose une méthode simple pour traiter les leads chauds plus vite.',
        cta: 'Répondez si vous voulez un résumé en 5 points.',
      }),
      provider: 'ollama',
      model: 'qwen3:8b',
      fallback_triggered: false,
    })

    const result = await runAgentStep({
      supabase,
      userId: 'user-1',
      agentId: 'prospect',
      llm,
      now: () => new Date('2026-05-18T10:00:00.000Z'),
    })

    expect(result.ok).toBe(true)
    expect(result.parsedOutput).toMatchObject({
      company_name: 'Acme Studio',
      band: 'hot',
    })
    expect(supabase.tables.prospects).toHaveLength(1)
    expect(supabase.tables.prospects[0]).toMatchObject({
      user_id: 'user-1',
      company_name: 'Acme Studio',
      source: 'upwork',
      score: 88,
      band: 'hot',
      status: 'ready_to_contact',
      segment: 'freelancers-small-agencies',
      offer_variant: '300eur-diagnostic',
      outreach_angle: 'diagnostic-call-outbound-v1',
      contact_email: 'marie@acme.test',
      outreach_subject: 'Acme Studio — 300EUR Diagnostic for follow-up drag',
    })
    expect(supabase.tables.prospects[0].metadata).toMatchObject({
      cta: 'Book the 300EUR Diagnostic: https://lab.kenomi.eu/diagnostic-300',
      model: 'qwen3:8b',
      model_family: 'qwen',
      provider: 'ollama',
      crm_provider: 'supabase',
      sources: ['linkedin', 'upwork'],
    })
    expect(supabase.tables.prospects[0].next_followup_at).toBe('2026-05-19T10:00:00.000Z')
    expect(supabase.tables.agent_runs[0]).toMatchObject({
      agent_id: 'prospect',
      model: 'qwen3:8b',
    })
    expect(supabase.tables.autonomy_actions).toHaveLength(1)
    expect(supabase.tables.autonomy_actions[0]).toMatchObject({
      action_type: 'send_outreach',
      status: 'blocked',
      risk_level: 'medium',
    })
    expect(supabase.tables.autonomy_actions[0].input).toMatchObject({
      prospect_id: 'prospects-1',
      company_name: 'Acme Studio',
      channel: 'email',
      band: 'hot',
    })
    expect(supabase.tables.human_approvals).toHaveLength(1)
    expect(supabase.tables.human_approvals[0]).toMatchObject({
      action_id: 'autonomy_actions-1',
      status: 'pending',
    })
  })

  it('does not create send_outreach approval for cold prospects', async () => {
    const supabase = createFakeSupabase()

    await runAgentStep({
      supabase,
      userId: 'user-1',
      agentId: 'prospect',
      llm: async (): Promise<LLMResponse> => ({
        content: JSON.stringify({
          company_name: 'Dormant Co',
          source: 'reddit',
          contact_email: 'ops@dormant.test',
          score: 41,
          band: 'cold',
          summary: 'Weak buying signal.',
          pain_points: ['low urgency'],
          outreach_subject: 'Dormant Co — idea',
          outreach_body: 'Short note.',
          cta: 'Open to a quick exchange?',
        }),
        provider: 'ollama',
        model: 'qwen3:8b',
        fallback_triggered: false,
      }),
      now: () => new Date('2026-05-18T10:00:00.000Z'),
    })

    expect(supabase.tables.autonomy_actions).toHaveLength(0)
    expect(supabase.tables.human_approvals).toHaveLength(0)
  })

  it('does not duplicate send_outreach approvals for the same prospect', async () => {
    const supabase = createFakeSupabase({
      autonomy_actions: [
        {
          id: 'action-existing',
          user_id: 'user-1',
          action_type: 'send_outreach',
          status: 'blocked',
          input: { prospect_id: 'prospects-1' },
        },
      ],
    })

    await runAgentStep({
      supabase,
      userId: 'user-1',
      agentId: 'prospect',
      llm: async (): Promise<LLMResponse> => ({
        content: JSON.stringify({
          company_name: 'Acme Studio',
          source: 'linkedin',
          contact_email: 'hello@acme.test',
          score: 91,
          band: 'hot',
          summary: 'Urgent qualification issue.',
          pain_points: ['manual follow-up'],
          outreach_subject: 'Acme Studio — qualify faster',
          outreach_body: 'Bonjour, voici une piste.',
          cta: 'Can I share a short example?',
        }),
        provider: 'ollama',
        model: 'qwen3:8b',
        fallback_triggered: false,
      }),
      now: () => new Date('2026-05-18T10:00:00.000Z'),
    })

    expect(supabase.tables.prospects).toHaveLength(1)
    expect(supabase.tables.autonomy_actions).toHaveLength(1)
    expect(supabase.tables.human_approvals).toHaveLength(0)
  })

  it('rejects Hermes as an executable agent id', async () => {
    const supabase = createFakeSupabase()

    await expect(
      runAgentStep({
        supabase,
        userId: 'user-1',
        agentId: 'hermes',
        now: () => new Date('2026-05-18T10:00:00.000Z'),
      })
    ).rejects.toMatchObject({
      status: 400,
      message: expect.stringContaining('Agent inconnu'),
    })
  })

  it('preserves upstream LLM failure details instead of forcing an Ollama label', async () => {
    const supabase = createFakeSupabase()

    await expect(
      runAgentStep({
        supabase,
        userId: 'user-1',
        agentId: 'prospect',
        llm: async () => {
          throw new Error(
            'LLM indisponible — Hermes Agent HTTP 401: unauthorized | Claude: missing API key'
          )
        },
        now: () => new Date('2026-05-18T10:00:00.000Z'),
      })
    ).rejects.toMatchObject({
      status: 502,
      message: expect.stringContaining('Hermes Agent HTTP 401'),
    })
  })
})
