import { describe, expect, it, vi } from 'vitest'
import { resolveHumanApproval, type ApprovalExecutorSupabase } from './approval-executor'

type TableName =
  | 'human_approvals'
  | 'autonomy_actions'
  | 'prospects'
  | 'ventures'
  | 'landing_pages'
  | 'budget_requests'
  | 'campaigns'
  | 'payments'
  | 'venture_events'
  | 'campaign_drafts'
  | 'user_settings'
  | 'prospect_activities'

interface TableRow {
  id?: string
  user_id?: string
  venture_id?: string
  action_id?: string
  status?: string
  statut?: string
  [key: string]: unknown
}

type QueryResponse = { data: TableRow[]; error: null }

function createFakeSupabase(seed: Partial<Record<TableName, TableRow[]>>) {
  const tables: Record<TableName, TableRow[]> = {
    human_approvals: seed.human_approvals ?? [],
    autonomy_actions: seed.autonomy_actions ?? [],
    prospects: seed.prospects ?? [],
    ventures: seed.ventures ?? [],
    landing_pages: seed.landing_pages ?? [],
    budget_requests: seed.budget_requests ?? [],
    campaigns: seed.campaigns ?? [],
    payments: seed.payments ?? [],
    venture_events: seed.venture_events ?? [],
    campaign_drafts: seed.campaign_drafts ?? [],
    user_settings: seed.user_settings ?? [],
    prospect_activities: seed.prospect_activities ?? [],
  }

  return {
    tables,
    from(table: string) {
      const tableName = table as TableName
      const state = {
        filters: [] as Array<{ field: string; value: unknown }>,
        patch: null as TableRow | null,
      }
      const matches = (row: TableRow) =>
        state.filters.every((filter) => row[filter.field] === filter.value)
      const builder = {
        select: () => builder,
        eq: (field: string, value: unknown) => {
          state.filters.push({ field, value })
          return builder
        },
        update: (patch: TableRow) => {
          state.patch = patch
          return builder
        },
        insert: (row: TableRow | TableRow[]) => {
          const rows = Array.isArray(row) ? row : [row]
          rows.forEach((item) => tables[tableName].push({ ...item }))
          return builder
        },
        single: async () => ({ data: tables[tableName].find(matches) ?? null, error: null }),
        maybeSingle: async () => ({ data: tables[tableName].find(matches) ?? null, error: null }),
        then: <TResult1 = QueryResponse, TResult2 = never>(
          resolve?: ((value: QueryResponse) => TResult1 | PromiseLike<TResult1>) | null,
          reject?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
        ) => {
          const rows = tables[tableName].filter(matches)
          if (state.patch) rows.forEach((row) => Object.assign(row, state.patch))
          const value = { data: rows, error: null }
          return Promise.resolve(value).then(resolve ?? undefined, reject ?? undefined)
        },
      }
      return builder
    },
  } as ApprovalExecutorSupabase & { tables: Record<TableName, TableRow[]> }
}

describe('resolveHumanApproval', () => {
  it('approuve send_outreach et crée un draft Gmail local lié au prospect', async () => {
    const fakeSupabase = createFakeSupabase({
      human_approvals: [{ id: 'app-o1', user_id: 'u1', action_id: 'act-o1', status: 'pending' }],
      autonomy_actions: [
        {
          id: 'act-o1',
          user_id: 'u1',
          action_type: 'send_outreach',
          status: 'blocked',
          input: {
            prospect_id: 'prospect-1',
            company_name: 'Acme Studio',
            contact_name: 'Marie Dupont',
            outreach_subject: 'Acme Studio — qualifier plus vite',
            outreach_body: 'Bonjour Marie, je vous propose une méthode plus rapide.',
          },
        },
      ],
      prospects: [
        {
          id: 'prospect-1',
          user_id: 'u1',
          company_name: 'Acme Studio',
          source: 'linkedin',
          band: 'warm',
          contact_email: 'marie@acme.test',
          status: 'awaiting_approval',
          metadata: {
            activity: [
              {
                type: 'approval_created',
                actor: 'system',
                at: '2026-05-26T09:00:00.000Z',
                detail: 'send_outreach approval created',
              },
            ],
          },
        },
      ],
    })
    const memoryWrites: Array<Record<string, unknown>> = []

    const result = await resolveHumanApproval({
      supabase: fakeSupabase as unknown as ApprovalExecutorSupabase,
      userId: 'u1',
      approvalId: 'app-o1',
      decision: 'approved',
      writeProspectMemory: async (row) => {
        memoryWrites.push(row as unknown as Record<string, unknown>)
        return { ok: true, id: 'memory-1' }
      },
      now: () => new Date('2026-05-26T10:00:00.000Z'),
    })

    expect(result).toMatchObject({
      actionType: 'send_outreach',
      status: 'approved',
      executed: false,
    })
    expect(fakeSupabase.tables.campaign_drafts[0]).toMatchObject({
      user_id: 'u1',
      venture_id: null,
      channel: 'email',
      status: 'draft',
      metadata: expect.objectContaining({
        provider: 'gmail',
        prospect_id: 'prospect-1',
        company_name: 'Acme Studio',
        to: 'marie@acme.test',
      }),
    })
    expect(fakeSupabase.tables.prospects[0]).toMatchObject({
      status: 'approved_to_send',
      draft_provider: 'gmail',
      draft_created_at: '2026-05-26T10:00:00.000Z',
    })
    expect(fakeSupabase.tables.prospects[0].metadata).toMatchObject({
      activity: [
        expect.objectContaining({ type: 'approval_created' }),
        expect.objectContaining({ type: 'approval_approved' }),
        expect.objectContaining({ type: 'gmail_draft_created' }),
      ],
    })
    expect(fakeSupabase.tables.prospect_activities).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'approval_approved' }),
        expect.objectContaining({ type: 'gmail_draft_created' }),
      ])
    )
    expect(fakeSupabase.tables.autonomy_actions[0]).toMatchObject({
      status: 'completed',
      output: expect.objectContaining({
        handler: 'send_outreach',
        provider: 'gmail',
      }),
    })
    expect(memoryWrites).toEqual([
      expect.objectContaining({
        memoryKind: 'outreach_draft_created',
        companyName: 'Acme Studio',
      }),
    ])
  })

  it('approuve send_follow_up et crée un draft Gmail local pour la première relance', async () => {
    const fakeSupabase = createFakeSupabase({
      human_approvals: [{ id: 'app-f1', user_id: 'u1', action_id: 'act-f1', status: 'pending' }],
      autonomy_actions: [
        {
          id: 'act-f1',
          user_id: 'u1',
          action_type: 'send_follow_up',
          status: 'blocked',
          input: {
            prospect_id: 'prospect-f1',
            company_name: 'Beta Studio',
            contact_name: 'Léa Martin',
            outreach_subject: 'Re: Beta Studio',
            outreach_body: 'Quick follow-up.',
            outreach_kind: 'follow_up_1',
            follow_up_count: 1,
            follow_up_version: 1,
          },
        },
      ],
      prospects: [
        {
          id: 'prospect-f1',
          user_id: 'u1',
          contact_email: 'lea@beta.test',
          status: 'follow_up',
          pipeline_status: 'awaiting_approval',
          follow_up_count: 0,
          last_outreach_kind: 'follow_up_1',
          metadata: { activity: [] },
        },
      ],
    })

    const result = await resolveHumanApproval({
      supabase: fakeSupabase as unknown as ApprovalExecutorSupabase,
      userId: 'u1',
      approvalId: 'app-f1',
      decision: 'approved',
      now: () => new Date('2026-05-26T10:00:00.000Z'),
    })

    expect(result).toMatchObject({
      actionType: 'send_follow_up',
      status: 'approved',
      executed: false,
    })
    expect(fakeSupabase.tables.campaign_drafts[0]).toMatchObject({
      metadata: expect.objectContaining({
        outreach_kind: 'follow_up_1',
        follow_up_count: 1,
        follow_up_version: 1,
      }),
    })
    expect(fakeSupabase.tables.prospects[0]).toMatchObject({
      pipeline_status: 'draft_created',
      draft_provider: 'gmail',
      follow_up_count: 1,
      last_outreach_kind: 'follow_up_1',
      follow_up_version: 1,
      next_followup_at: '2026-05-31T10:00:00.000Z',
      last_contacted_at: '2026-05-26T10:00:00.000Z',
    })
    expect(fakeSupabase.tables.prospects[0].metadata).toMatchObject({
      activity: [
        expect.objectContaining({ type: 'follow_up_approved' }),
        expect.objectContaining({ type: 'gmail_draft_created' }),
      ],
    })
    expect(fakeSupabase.tables.prospect_activities).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'follow_up_approved' }),
        expect.objectContaining({ type: 'gmail_draft_created' }),
      ])
    )
  })

  it('envoie vraiment l’outreach quand un provider email serveur est disponible', async () => {
    const fakeSupabase = createFakeSupabase({
      human_approvals: [{ id: 'app-live-1', user_id: 'u1', action_id: 'act-live-1', status: 'pending' }],
      autonomy_actions: [
        {
          id: 'act-live-1',
          user_id: 'u1',
          action_type: 'send_outreach',
          status: 'blocked',
          input: {
            prospect_id: 'prospect-live-1',
            company_name: 'Live Studio',
            contact_name: 'Nina',
            outreach_subject: 'Live Studio — audit rapide',
            outreach_body: 'Bonjour Nina, voici une piste concrète.',
          },
        },
      ],
      prospects: [
        {
          id: 'prospect-live-1',
          user_id: 'u1',
          company_name: 'Live Studio',
          source: 'linkedin',
          band: 'hot',
          contact_email: 'nina@live.test',
          status: 'awaiting_approval',
          metadata: { activity: [] },
        },
      ],
      user_settings: [{ user_id: 'u1', prospect_outreach_email: 'hello@kenomi.eu' }],
    })

    const result = await resolveHumanApproval({
      supabase: fakeSupabase as unknown as ApprovalExecutorSupabase,
      userId: 'u1',
      approvalId: 'app-live-1',
      decision: 'approved',
      prospectEmailSender: async () => ({
        provider: 'smtp',
        messageId: '<msg-live-1@example.com>',
      }),
      now: () => new Date('2026-05-26T10:00:00.000Z'),
    })

    expect(result).toMatchObject({
      actionType: 'send_outreach',
      status: 'approved',
      executed: true,
    })
    expect(fakeSupabase.tables.campaign_drafts[0]).toMatchObject({
      status: 'published',
      metadata: expect.objectContaining({
        provider: 'smtp',
        delivery_status: 'sent',
        provider_message_id: '<msg-live-1@example.com>',
      }),
    })
    expect(fakeSupabase.tables.prospects[0]).toMatchObject({
      status: 'sent',
      pipeline_status: 'sent',
      draft_provider: 'smtp',
      draft_external_id: '<msg-live-1@example.com>',
    })
    expect(fakeSupabase.tables.prospect_activities).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'approval_approved' }),
        expect.objectContaining({ type: 'marked_sent' }),
      ])
    )
    expect(fakeSupabase.tables.autonomy_actions[0]).toMatchObject({
      status: 'completed',
      output: expect.objectContaining({
        executed: true,
        provider: 'smtp',
        message_id: '<msg-live-1@example.com>',
      }),
    })
  })

  it('rejette une approval pending et annule action associée', async () => {
    const supabase = createFakeSupabase({
      human_approvals: [
        { id: 'approval-1', user_id: 'user-1', action_id: 'action-1', status: 'pending' },
      ],
      autonomy_actions: [
        {
          id: 'action-1',
          user_id: 'user-1',
          venture_id: 'venture-1',
          action_type: 'scale_budget',
          status: 'blocked',
        },
      ],
    })

    const result = await resolveHumanApproval({
      supabase,
      userId: 'user-1',
      approvalId: 'approval-1',
      decision: 'rejected',
      now: () => new Date('2026-05-18T12:00:00.000Z'),
    })

    expect(result.status).toBe('rejected')
    expect(supabase.tables.human_approvals[0]).toMatchObject({
      status: 'rejected',
      approved_at: '2026-05-18T12:00:00.000Z',
    })
    expect(supabase.tables.autonomy_actions[0]).toMatchObject({
      status: 'cancelled',
    })
  })

  it('records rejection activity when send_outreach is rejected', async () => {
    const supabase = createFakeSupabase({
      human_approvals: [
        { id: 'approval-2', user_id: 'user-1', action_id: 'action-2', status: 'pending' },
      ],
      autonomy_actions: [
        {
          id: 'action-2',
          user_id: 'user-1',
          action_type: 'send_outreach',
          status: 'blocked',
          input: { prospect_id: 'prospect-2' },
        },
      ],
      prospects: [
        {
          id: 'prospect-2',
          user_id: 'user-1',
          metadata: { activity: [] },
        },
      ],
    })

    await resolveHumanApproval({
      supabase,
      userId: 'user-1',
      approvalId: 'approval-2',
      decision: 'rejected',
      now: () => new Date('2026-05-26T12:00:00.000Z'),
    })

    expect(supabase.tables.prospects[0].metadata).toMatchObject({
      activity: [expect.objectContaining({ type: 'approval_rejected' })],
    })
    expect(supabase.tables.prospect_activities).toEqual(
      expect.arrayContaining([expect.objectContaining({ type: 'approval_rejected' })])
    )
    expect(supabase.tables.autonomy_actions[0]).toMatchObject({ status: 'cancelled' })
  })

  it('approuve et exécute stop_venture sur la venture, les landing pages, budgets et campagnes', async () => {
    const supabase = createFakeSupabase({
      human_approvals: [
        { id: 'approval-1', user_id: 'user-1', action_id: 'action-1', status: 'pending' },
      ],
      autonomy_actions: [
        {
          id: 'action-1',
          user_id: 'user-1',
          venture_id: 'venture-1',
          action_type: 'stop_venture',
          status: 'blocked',
          input: { rationale: 'CAC trop élevé' },
        },
      ],
      ventures: [
        {
          id: 'venture-1',
          user_id: 'user-1',
          statut: 'actif',
          stage: 'Scale',
          next_action: 'Continuer',
        },
      ],
      landing_pages: [{ id: 'landing-1', venture_id: 'venture-1', statut: 'deployed' }],
      budget_requests: [{ id: 'budget-1', venture_id: 'venture-1', status: 'pending' }],
      campaigns: [{ id: 'campaign-1', venture_id: 'venture-1', status: 'approved' }],
      payments: [
        { id: 'payment-1', venture_id: 'venture-1', status: 'pending', provider_status: 'ready' },
      ],
    })

    const result = await resolveHumanApproval({
      supabase,
      userId: 'user-1',
      approvalId: 'approval-1',
      decision: 'approved',
      now: () => new Date('2026-05-18T12:00:00.000Z'),
    })

    expect(result.status).toBe('approved')
    expect(result.executed).toBe(true)
    expect(supabase.tables.human_approvals[0]).toMatchObject({
      status: 'approved',
      approved_by: 'user-1',
      approved_at: '2026-05-18T12:00:00.000Z',
    })
    expect(supabase.tables.autonomy_actions[0]).toMatchObject({
      status: 'completed',
      output: { executed: true, handler: 'stop_venture' },
    })
    expect(supabase.tables.ventures[0]).toMatchObject({
      statut: 'stopped',
      lifecycle_status: 'stopped',
      stage: 'Stopped',
      current_decision: 'stop',
      next_action: 'Venture arrêtée après approbation humaine',
      decision_at: '2026-05-18T12:00:00.000Z',
    })
    expect(supabase.tables.landing_pages[0]).toMatchObject({
      statut: 'stopped',
      health_status: 'stopped',
    })
    expect(supabase.tables.budget_requests[0]).toMatchObject({ status: 'rejected' })
    expect(supabase.tables.campaigns[0]).toMatchObject({ status: 'rejected' })
    expect(supabase.tables.payments[0]).toMatchObject({
      status: 'disabled',
      provider_status: 'disabled',
    })
  })

  it('approuve et exécute deploy via Coolify', async () => {
    const supabase = createFakeSupabase({
      human_approvals: [
        { id: 'approval-1', user_id: 'user-1', action_id: 'action-1', status: 'pending' },
      ],
      autonomy_actions: [
        {
          id: 'action-1',
          user_id: 'user-1',
          venture_id: 'venture-1',
          action_type: 'deploy',
          status: 'blocked',
          input: { projectId: 'project-1', serviceId: 'service-1' },
        },
      ],
    })

    const result = await resolveHumanApproval({
      supabase,
      userId: 'user-1',
      approvalId: 'approval-1',
      decision: 'approved',
      coolifyClient: {
        triggerDeploy: async () => ({ deploymentId: 'dep-1' }),
        getDeployment: async () => ({ status: 'queued' }),
      },
      now: () => new Date('2026-05-18T12:00:00.000Z'),
    })

    expect(result.executed).toBe(true)
    expect(supabase.tables.autonomy_actions[0]).toMatchObject({
      status: 'completed',
      output: {
        executed: true,
        handler: 'deploy',
        deploymentId: 'dep-1',
      },
    })
  })

  it('approuve et exécute create_checkout via Stripe', async () => {
    const supabase = createFakeSupabase({
      human_approvals: [
        { id: 'approval-1', user_id: 'user-1', action_id: 'action-1', status: 'pending' },
      ],
      autonomy_actions: [
        {
          id: 'action-1',
          user_id: 'user-1',
          venture_id: 'venture-1',
          action_type: 'create_checkout',
          status: 'blocked',
          input: {
            pipeline_id: 'pipeline-1',
            payment: {
              product_name: 'InboxPulse',
              price_amount: 2900,
              price_currency: 'eur',
              billing: 'monthly',
              checkout_description: 'Scoring IA des leads email.',
              trial_days: 7,
            },
            successUrl: 'https://kenomi.test/success',
            cancelUrl: 'https://kenomi.test/cancel',
          },
        },
      ],
    })

    const stripeClient = {
      checkout: {
        sessions: {
          create: vi.fn(async () => ({
            id: 'cs_test_123',
            url: 'https://checkout.stripe.test/session',
            mode: 'subscription',
            payment_intent: null,
            customer_details: { email: 'buyer@test.local' },
          })),
        },
      },
    }

    const result = await resolveHumanApproval({
      supabase,
      userId: 'user-1',
      approvalId: 'approval-1',
      decision: 'approved',
      stripeClient,
      now: () => new Date('2026-05-18T12:00:00.000Z'),
    })

    expect(result).toMatchObject({ executed: true, actionType: 'create_checkout' })
    expect(stripeClient.checkout.sessions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'subscription',
        success_url: 'https://kenomi.test/success',
        cancel_url: 'https://kenomi.test/cancel',
        metadata: { venture_id: 'venture-1' },
      })
    )
    expect(supabase.tables.payments[0]).toMatchObject({
      venture_id: 'venture-1',
      stripe_session_id: 'cs_test_123',
      amount_eur: 29,
      provider_status: 'ready',
      checkout_url: 'https://checkout.stripe.test/session',
      autonomy_action_id: 'action-1',
    })
    expect(supabase.tables.autonomy_actions[0]).toMatchObject({
      status: 'completed',
      output: {
        executed: true,
        handler: 'create_checkout',
        stripe_session_id: 'cs_test_123',
        checkout_url: 'https://checkout.stripe.test/session',
      },
    })
  })

  it('utilise la clé Stripe stockée dans les settings pour exécuter create_checkout', async () => {
    const supabase = createFakeSupabase({
      user_settings: [{ user_id: 'user-1', stripe_secret_key: 'sk_test_settings' }],
      human_approvals: [
        { id: 'approval-1', user_id: 'user-1', action_id: 'action-1', status: 'pending' },
      ],
      autonomy_actions: [
        {
          id: 'action-1',
          user_id: 'user-1',
          venture_id: 'venture-1',
          action_type: 'create_checkout',
          status: 'blocked',
          input: {
            payment: {
              product_name: 'InboxPulse',
              price_amount: 1900,
              price_currency: 'eur',
              billing: 'one_time',
              checkout_description: 'Scoring IA des leads email.',
              trial_days: 0,
            },
            successUrl: 'https://kenomi.test/success',
            cancelUrl: 'https://kenomi.test/cancel',
          },
        },
      ],
    })

    const stripeClientFactory = vi.fn((secretKey: string) => ({
      checkout: {
        sessions: {
          create: vi.fn(async () => ({
            id: `cs_${secretKey}`,
            url: 'https://checkout.stripe.test/settings-session',
            mode: 'payment',
            payment_intent: 'pi_settings',
            customer_details: {},
          })),
        },
      },
    }))

    const result = await resolveHumanApproval({
      supabase,
      userId: 'user-1',
      approvalId: 'approval-1',
      decision: 'approved',
      stripeClientFactory,
      config: {
        enabled: true,
        dryRun: false,
        globalBudgetCapEur: 1000,
        portfolioMaxNewVenturesPerDay: 1,
        portfolioMaxActiveExperiments: 5,
      },
      now: () => new Date('2026-05-19T19:00:00.000Z'),
    })

    expect(result).toMatchObject({ executed: true, actionType: 'create_checkout' })
    expect(stripeClientFactory).toHaveBeenCalledWith('sk_test_settings')
    expect(supabase.tables.payments[0]).toMatchObject({
      stripe_session_id: 'cs_sk_test_settings',
      stripe_payment_intent_id: 'pi_settings',
      provider_status: 'ready',
      checkout_url: 'https://checkout.stripe.test/settings-session',
    })
  })

  it('marque deploy failed si Coolify échoue après approbation', async () => {
    const supabase = createFakeSupabase({
      human_approvals: [
        { id: 'approval-1', user_id: 'user-1', action_id: 'action-1', status: 'pending' },
      ],
      autonomy_actions: [
        {
          id: 'action-1',
          user_id: 'user-1',
          venture_id: 'venture-1',
          action_type: 'deploy',
          status: 'blocked',
          input: { projectId: 'project-1', serviceId: 'service-1' },
        },
      ],
    })

    const result = await resolveHumanApproval({
      supabase,
      userId: 'user-1',
      approvalId: 'approval-1',
      decision: 'approved',
      coolifyClient: {
        triggerDeploy: async () => {
          throw new Error('Coolify down')
        },
        getDeployment: async () => ({ status: 'failed' }),
      },
    })

    expect(result.executed).toBe(false)
    expect(supabase.tables.autonomy_actions[0]).toMatchObject({
      status: 'failed',
      output: {
        executed: false,
        handler: 'deploy',
        error: 'Coolify down',
      },
    })
  })
})

describe('resolveHumanApproval — dry-run', () => {
  it('dry-run: action deploy approuvée marque completed avec output.dry_run sans appeler Coolify', async () => {
    const fakeSupabase = createFakeSupabase({
      human_approvals: [{ id: 'app-1', user_id: 'u1', action_id: 'act-1', status: 'pending' }],
      autonomy_actions: [
        {
          id: 'act-1',
          user_id: 'u1',
          action_type: 'deploy',
          status: 'pending',
          input: { projectId: 'p1', serviceId: 's1' },
        },
      ],
    })
    const coolifyMock = {
      triggerDeploy: vi.fn().mockResolvedValue({ deploymentId: 'd-x' }),
      getDeployment: vi.fn(),
    }
    const result = await resolveHumanApproval({
      supabase: fakeSupabase as unknown as ApprovalExecutorSupabase,
      userId: 'u1',
      approvalId: 'app-1',
      decision: 'approved',
      coolifyClient: coolifyMock,
      config: {
        enabled: true,
        dryRun: true,
        globalBudgetCapEur: 100,
        portfolioMaxNewVenturesPerDay: 1,
        portfolioMaxActiveExperiments: 5,
      },
    })
    expect(coolifyMock.triggerDeploy).not.toHaveBeenCalled()
    expect(result.executed).toBe(false)
    const action = fakeSupabase.tables.autonomy_actions[0]
    expect(action.status).toBe('completed')
    expect(action.output).toMatchObject({ dry_run: true, action_type: 'deploy' })
  })

  it('dry-run désactivé: action deploy approuvée appelle Coolify normalement', async () => {
    const fakeSupabase = createFakeSupabase({
      human_approvals: [{ id: 'app-2', user_id: 'u1', action_id: 'act-2', status: 'pending' }],
      autonomy_actions: [
        {
          id: 'act-2',
          user_id: 'u1',
          action_type: 'deploy',
          status: 'pending',
          input: { projectId: 'p1', serviceId: 's1' },
        },
      ],
    })
    const coolifyMock = {
      triggerDeploy: vi.fn().mockResolvedValue({ deploymentId: 'd-y' }),
      getDeployment: vi.fn(),
    }
    const result = await resolveHumanApproval({
      supabase: fakeSupabase as unknown as ApprovalExecutorSupabase,
      userId: 'u1',
      approvalId: 'app-2',
      decision: 'approved',
      coolifyClient: coolifyMock,
      config: {
        enabled: true,
        dryRun: false,
        globalBudgetCapEur: 100,
        portfolioMaxNewVenturesPerDay: 1,
        portfolioMaxActiveExperiments: 5,
      },
    })
    expect(coolifyMock.triggerDeploy).toHaveBeenCalledOnce()
    expect(result.executed).toBe(true)
  })

  it("dry-run: stop_venture (interne) s'exécute normalement", async () => {
    const fakeSupabase = createFakeSupabase({
      human_approvals: [{ id: 'app-3', user_id: 'u1', action_id: 'act-3', status: 'pending' }],
      autonomy_actions: [
        {
          id: 'act-3',
          user_id: 'u1',
          action_type: 'stop_venture',
          status: 'pending',
          venture_id: 'v1',
        },
      ],
      ventures: [{ id: 'v1', user_id: 'u1', statut: 'running' }],
    })
    const result = await resolveHumanApproval({
      supabase: fakeSupabase as unknown as ApprovalExecutorSupabase,
      userId: 'u1',
      approvalId: 'app-3',
      decision: 'approved',
      config: {
        enabled: true,
        dryRun: true,
        globalBudgetCapEur: 100,
        portfolioMaxNewVenturesPerDay: 1,
        portfolioMaxActiveExperiments: 5,
      },
    })
    expect(result.executed).toBe(true)
    expect(fakeSupabase.tables.ventures[0].statut).toBe('stopped')
  })
})

describe('resolveHumanApproval — budget policy', () => {
  it('bloque publish_campaign si global spend dépasse le cap', async () => {
    const fakeSupabase = createFakeSupabase({
      human_approvals: [{ id: 'app-b1', user_id: 'u1', action_id: 'act-b1', status: 'pending' }],
      autonomy_actions: [
        {
          id: 'act-b1',
          user_id: 'u1',
          action_type: 'publish_campaign',
          status: 'pending',
          venture_id: 'v1',
          estimated_cost_eur: 50,
          budget_cap_eur: 100,
        },
      ],
      venture_events: [
        { user_id: 'u1', venture_id: 'v1', event_type: 'campaign_spend', amount_eur: 80 },
      ],
    })
    const result = await resolveHumanApproval({
      supabase: fakeSupabase as unknown as ApprovalExecutorSupabase,
      userId: 'u1',
      approvalId: 'app-b1',
      decision: 'approved',
      config: {
        enabled: true,
        dryRun: false,
        globalBudgetCapEur: 100,
        portfolioMaxNewVenturesPerDay: 1,
        portfolioMaxActiveExperiments: 5,
      },
    })
    expect(result.executed).toBe(false)
    const action = fakeSupabase.tables.autonomy_actions[0]
    expect(action.status).toBe('blocked')
    expect((action.output as Record<string, unknown>).budget_breach).toBe('global_cap_exceeded')
  })

  it('bloque publish_campaign si cost > action cap', async () => {
    const fakeSupabase = createFakeSupabase({
      human_approvals: [{ id: 'app-b2', user_id: 'u1', action_id: 'act-b2', status: 'pending' }],
      autonomy_actions: [
        {
          id: 'act-b2',
          user_id: 'u1',
          action_type: 'publish_campaign',
          status: 'pending',
          venture_id: 'v1',
          estimated_cost_eur: 200,
          budget_cap_eur: 100,
        },
      ],
      venture_events: [],
    })
    const result = await resolveHumanApproval({
      supabase: fakeSupabase as unknown as ApprovalExecutorSupabase,
      userId: 'u1',
      approvalId: 'app-b2',
      decision: 'approved',
      config: {
        enabled: true,
        dryRun: false,
        globalBudgetCapEur: 100000,
        portfolioMaxNewVenturesPerDay: 1,
        portfolioMaxActiveExperiments: 5,
      },
    })
    expect(result.executed).toBe(false)
    expect(
      (fakeSupabase.tables.autonomy_actions[0].output as Record<string, unknown>).budget_breach
    ).toBe('action_cap_exceeded')
  })

  it('ignore les amount_eur négatifs/null/NaN: la somme reste correcte et déclenche le breach uniquement sur les vraies dépenses', async () => {
    // 3 dépenses légitimes de 40 chacune = 120, + bruit (négatif, null, string) qui doit être ignoré.
    // Cost 10 + venture_spent 120 = 130 > cap 100 → global_cap_exceeded.
    // Si le bruit était compté (-500 ou NaN), la somme serait < 100 et le test passerait par erreur.
    const fakeSupabase = createFakeSupabase({
      human_approvals: [{ id: 'app-b3', user_id: 'u1', action_id: 'act-b3', status: 'pending' }],
      autonomy_actions: [
        {
          id: 'act-b3',
          user_id: 'u1',
          action_type: 'publish_campaign',
          status: 'pending',
          venture_id: 'v1',
          estimated_cost_eur: 10,
          budget_cap_eur: 1000,
        },
      ],
      venture_events: [
        { user_id: 'u1', venture_id: 'v1', event_type: 'campaign_spend', amount_eur: 40 },
        { user_id: 'u1', venture_id: 'v1', event_type: 'campaign_spend', amount_eur: 40 },
        { user_id: 'u1', venture_id: 'v1', event_type: 'campaign_spend', amount_eur: 40 },
        { user_id: 'u1', venture_id: 'v1', event_type: 'campaign_spend', amount_eur: -500 },
        { user_id: 'u1', venture_id: 'v1', event_type: 'campaign_spend', amount_eur: null },
        { user_id: 'u1', venture_id: 'v1', event_type: 'campaign_spend', amount_eur: 'abc' },
      ],
    })
    const result = await resolveHumanApproval({
      supabase: fakeSupabase as unknown as ApprovalExecutorSupabase,
      userId: 'u1',
      approvalId: 'app-b3',
      decision: 'approved',
      config: {
        enabled: true,
        dryRun: false,
        globalBudgetCapEur: 100,
        portfolioMaxNewVenturesPerDay: 1,
        portfolioMaxActiveExperiments: 5,
      },
    })
    expect(result.executed).toBe(false)
    expect(fakeSupabase.tables.autonomy_actions[0].status).toBe('blocked')
    expect(
      (fakeSupabase.tables.autonomy_actions[0].output as Record<string, unknown>).budget_breach
    ).toBe('global_cap_exceeded')
  })
})

describe('resolveHumanApproval — publish_campaign', () => {
  it('approuve une action publish_campaign, appelle le publisher et marque action completed', async () => {
    const fakeSupabase = createFakeSupabase({
      human_approvals: [{ id: 'app-p1', user_id: 'u1', action_id: 'act-p1', status: 'pending' }],
      autonomy_actions: [
        {
          id: 'act-p1',
          user_id: 'u1',
          action_type: 'publish_campaign',
          status: 'pending',
          venture_id: 'v1',
          input: { draft_id: 'draft-1', channel: 'email' },
        },
      ],
      campaign_drafts: [
        {
          id: 'draft-1',
          user_id: 'u1',
          venture_id: 'v1',
          channel: 'email',
          content: 'Hi',
          metadata: {},
        },
      ],
    })
    const publisher = {
      publish: vi.fn().mockResolvedValue({
        externalId: 'ext-1',
        url: 'https://mock.local/v1/email',
      }),
    }
    const result = await resolveHumanApproval({
      supabase: fakeSupabase as unknown as ApprovalExecutorSupabase,
      userId: 'u1',
      approvalId: 'app-p1',
      decision: 'approved',
      marketingPublisher: publisher,
      config: {
        enabled: true,
        dryRun: false,
        globalBudgetCapEur: 100000,
        portfolioMaxNewVenturesPerDay: 1,
        portfolioMaxActiveExperiments: 5,
      },
    })

    expect(result.executed).toBe(true)
    expect(publisher.publish).toHaveBeenCalledOnce()
    const action = fakeSupabase.tables.autonomy_actions[0]
    expect(action.status).toBe('completed')
    expect((action.output as Record<string, unknown>).external_id).toBe('ext-1')
    expect(
      fakeSupabase.tables.venture_events.find((e) => e.event_type === 'campaign_published')
    ).toBeTruthy()
    expect(fakeSupabase.tables.campaign_drafts[0]).toMatchObject({ status: 'published' })
  })

  it('marque action failed si publisher rejette', async () => {
    const fakeSupabase = createFakeSupabase({
      human_approvals: [{ id: 'app-p2', user_id: 'u1', action_id: 'act-p2', status: 'pending' }],
      autonomy_actions: [
        {
          id: 'act-p2',
          user_id: 'u1',
          action_type: 'publish_campaign',
          status: 'pending',
          venture_id: 'v1',
          input: { draft_id: 'draft-2', channel: 'email' },
        },
      ],
      campaign_drafts: [
        {
          id: 'draft-2',
          user_id: 'u1',
          venture_id: 'v1',
          channel: 'email',
          content: 'x',
          metadata: {},
        },
      ],
    })
    const publisher = { publish: vi.fn().mockRejectedValue(new Error('boom')) }
    const result = await resolveHumanApproval({
      supabase: fakeSupabase as unknown as ApprovalExecutorSupabase,
      userId: 'u1',
      approvalId: 'app-p2',
      decision: 'approved',
      marketingPublisher: publisher,
      config: {
        enabled: true,
        dryRun: false,
        globalBudgetCapEur: 100000,
        portfolioMaxNewVenturesPerDay: 1,
        portfolioMaxActiveExperiments: 5,
      },
    })

    expect(result.executed).toBe(false)
    expect(fakeSupabase.tables.autonomy_actions[0].status).toBe('failed')
    expect(fakeSupabase.tables.campaign_drafts[0]).toMatchObject({ status: 'failed' })
  })

  it('throw si draft_id manquant', async () => {
    const fakeSupabase = createFakeSupabase({
      human_approvals: [{ id: 'app-p3', user_id: 'u1', action_id: 'act-p3', status: 'pending' }],
      autonomy_actions: [
        {
          id: 'act-p3',
          user_id: 'u1',
          action_type: 'publish_campaign',
          status: 'pending',
          venture_id: 'v1',
          input: {},
        },
      ],
    })
    await expect(
      resolveHumanApproval({
        supabase: fakeSupabase as unknown as ApprovalExecutorSupabase,
        userId: 'u1',
        approvalId: 'app-p3',
        decision: 'approved',
        marketingPublisher: { publish: vi.fn() },
        config: {
          enabled: true,
          dryRun: false,
          globalBudgetCapEur: 100000,
          portfolioMaxNewVenturesPerDay: 1,
          portfolioMaxActiveExperiments: 5,
        },
      })
    ).rejects.toThrow(/draft_id manquant/)
  })
})

describe('resolveHumanApproval — scale_budget', () => {
  it('approuve un scale_budget et prépare une campagne payante traçable', async () => {
    const fakeSupabase = createFakeSupabase({
      human_approvals: [{ id: 'app-s1', user_id: 'u1', action_id: 'act-s1', status: 'pending' }],
      autonomy_actions: [
        {
          id: 'act-s1',
          user_id: 'u1',
          action_type: 'scale_budget',
          status: 'blocked',
          venture_id: 'v1',
          estimated_cost_eur: 25,
          budget_cap_eur: 50,
          input: {
            channel: 'email',
            recommended_budget_eur: 25,
            rationale: 'ROI positif',
            next_step: 'Scaler email',
          },
        },
      ],
    })

    const result = await resolveHumanApproval({
      supabase: fakeSupabase as unknown as ApprovalExecutorSupabase,
      userId: 'u1',
      approvalId: 'app-s1',
      decision: 'approved',
      config: {
        enabled: true,
        dryRun: false,
        globalBudgetCapEur: 100000,
        portfolioMaxNewVenturesPerDay: 1,
        portfolioMaxActiveExperiments: 5,
      },
      now: () => new Date('2026-05-19T09:00:00.000Z'),
    })

    expect(result).toMatchObject({ executed: true, actionType: 'scale_budget' })
    expect(fakeSupabase.tables.budget_requests[0]).toMatchObject({
      venture_id: 'v1',
      campaign_name: 'Scale email',
      amount_eur: 25,
      status: 'approved',
      reason: 'ROI positif',
    })
    expect(fakeSupabase.tables.campaign_drafts[0]).toMatchObject({
      user_id: 'u1',
      venture_id: 'v1',
      channel: 'email',
      status: 'blocked',
      metadata: expect.objectContaining({
        budget_eur: 25,
        source: 'scale_budget',
        autonomy_action_id: 'act-s1',
      }),
    })
    const publishAction = fakeSupabase.tables.autonomy_actions.find(
      (action) => action.action_type === 'publish_campaign'
    )
    expect(publishAction).toMatchObject({
      user_id: 'u1',
      venture_id: 'v1',
      status: 'blocked',
      risk_level: 'high',
    })
    expect(fakeSupabase.tables.human_approvals).toContainEqual(
      expect.objectContaining({
        action_id: publishAction?.id,
        status: 'pending',
        reason: 'Publier scale email avec 25 EUR',
      })
    )
    expect(fakeSupabase.tables.autonomy_actions[0]).toMatchObject({
      status: 'completed',
      output: expect.objectContaining({ handler: 'scale_budget', budget_eur: 25 }),
    })
  })
})
