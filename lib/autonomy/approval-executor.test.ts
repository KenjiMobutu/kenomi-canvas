import { describe, expect, it, vi } from 'vitest'
import { resolveHumanApproval, type ApprovalExecutorSupabase } from './approval-executor'

type TableName =
  | 'human_approvals'
  | 'autonomy_actions'
  | 'ventures'
  | 'landing_pages'
  | 'budget_requests'
  | 'campaigns'
  | 'venture_events'

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
    ventures: seed.ventures ?? [],
    landing_pages: seed.landing_pages ?? [],
    budget_requests: seed.budget_requests ?? [],
    campaigns: seed.campaigns ?? [],
    venture_events: seed.venture_events ?? [],
  }

  return {
    tables,
    from(table: string) {
      const tableName = table as TableName
      const state = {
        filters: [] as Array<{ field: string; value: unknown }>,
        patch: null as TableRow | null,
      }
      const matches = (row: TableRow) => state.filters.every((filter) => row[filter.field] === filter.value)
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
        single: async () => ({ data: tables[tableName].find(matches) ?? null, error: null }),
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
  it('rejette une approval pending et annule action associée', async () => {
    const supabase = createFakeSupabase({
      human_approvals: [{ id: 'approval-1', user_id: 'user-1', action_id: 'action-1', status: 'pending' }],
      autonomy_actions: [{ id: 'action-1', user_id: 'user-1', venture_id: 'venture-1', action_type: 'scale_budget', status: 'blocked' }],
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

  it('approuve et exécute stop_venture sur la venture, les landing pages, budgets et campagnes', async () => {
    const supabase = createFakeSupabase({
      human_approvals: [{ id: 'approval-1', user_id: 'user-1', action_id: 'action-1', status: 'pending' }],
      autonomy_actions: [{
        id: 'action-1',
        user_id: 'user-1',
        venture_id: 'venture-1',
        action_type: 'stop_venture',
        status: 'blocked',
        input: { rationale: 'CAC trop élevé' },
      }],
      ventures: [{ id: 'venture-1', user_id: 'user-1', statut: 'actif', stage: 'Scale', next_action: 'Continuer' }],
      landing_pages: [{ id: 'landing-1', venture_id: 'venture-1', statut: 'deployed' }],
      budget_requests: [{ id: 'budget-1', venture_id: 'venture-1', status: 'pending' }],
      campaigns: [{ id: 'campaign-1', venture_id: 'venture-1', status: 'approved' }],
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
      stage: 'Stopped',
      next_action: 'Venture arrêtée après approbation humaine',
      decision_at: '2026-05-18T12:00:00.000Z',
    })
    expect(supabase.tables.landing_pages[0]).toMatchObject({ statut: 'stopped' })
    expect(supabase.tables.budget_requests[0]).toMatchObject({ status: 'rejected' })
    expect(supabase.tables.campaigns[0]).toMatchObject({ status: 'rejected' })
  })

  it('approuve et exécute deploy via Coolify', async () => {
    const supabase = createFakeSupabase({
      human_approvals: [{ id: 'approval-1', user_id: 'user-1', action_id: 'action-1', status: 'pending' }],
      autonomy_actions: [{
        id: 'action-1',
        user_id: 'user-1',
        venture_id: 'venture-1',
        action_type: 'deploy',
        status: 'blocked',
        input: { projectId: 'project-1', serviceId: 'service-1' },
      }],
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

  it('marque deploy failed si Coolify échoue après approbation', async () => {
    const supabase = createFakeSupabase({
      human_approvals: [{ id: 'approval-1', user_id: 'user-1', action_id: 'action-1', status: 'pending' }],
      autonomy_actions: [{
        id: 'action-1',
        user_id: 'user-1',
        venture_id: 'venture-1',
        action_type: 'deploy',
        status: 'blocked',
        input: { projectId: 'project-1', serviceId: 'service-1' },
      }],
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
      autonomy_actions: [{
        id: 'act-1', user_id: 'u1', action_type: 'deploy', status: 'pending',
        input: { projectId: 'p1', serviceId: 's1' },
      }],
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
      config: { enabled: true, dryRun: true, globalBudgetCapEur: 100 },
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
      autonomy_actions: [{
        id: 'act-2', user_id: 'u1', action_type: 'deploy', status: 'pending',
        input: { projectId: 'p1', serviceId: 's1' },
      }],
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
      config: { enabled: true, dryRun: false, globalBudgetCapEur: 100 },
    })
    expect(coolifyMock.triggerDeploy).toHaveBeenCalledOnce()
    expect(result.executed).toBe(true)
  })

  it('dry-run: stop_venture (interne) s\'exécute normalement', async () => {
    const fakeSupabase = createFakeSupabase({
      human_approvals: [{ id: 'app-3', user_id: 'u1', action_id: 'act-3', status: 'pending' }],
      autonomy_actions: [{
        id: 'act-3', user_id: 'u1', action_type: 'stop_venture', status: 'pending',
        venture_id: 'v1',
      }],
      ventures: [{ id: 'v1', user_id: 'u1', statut: 'running' }],
    })
    const result = await resolveHumanApproval({
      supabase: fakeSupabase as unknown as ApprovalExecutorSupabase,
      userId: 'u1',
      approvalId: 'app-3',
      decision: 'approved',
      config: { enabled: true, dryRun: true, globalBudgetCapEur: 100 },
    })
    expect(result.executed).toBe(true)
    expect(fakeSupabase.tables.ventures[0].statut).toBe('stopped')
  })
})

describe('resolveHumanApproval — budget policy', () => {
  it('bloque publish_campaign si global spend dépasse le cap', async () => {
    const fakeSupabase = createFakeSupabase({
      human_approvals: [{ id: 'app-b1', user_id: 'u1', action_id: 'act-b1', status: 'pending' }],
      autonomy_actions: [{
        id: 'act-b1', user_id: 'u1', action_type: 'publish_campaign', status: 'pending',
        venture_id: 'v1',
        estimated_cost_eur: 50,
        budget_cap_eur: 100,
      }],
      venture_events: [
        { user_id: 'u1', venture_id: 'v1', event_type: 'campaign_spend', amount_eur: 80 },
      ],
    })
    const result = await resolveHumanApproval({
      supabase: fakeSupabase as unknown as ApprovalExecutorSupabase,
      userId: 'u1',
      approvalId: 'app-b1',
      decision: 'approved',
      config: { enabled: true, dryRun: false, globalBudgetCapEur: 100 },
    })
    expect(result.executed).toBe(false)
    const action = fakeSupabase.tables.autonomy_actions[0]
    expect(action.status).toBe('blocked')
    expect((action.output as Record<string, unknown>).budget_breach).toBe('global_cap_exceeded')
  })

  it('bloque publish_campaign si cost > action cap', async () => {
    const fakeSupabase = createFakeSupabase({
      human_approvals: [{ id: 'app-b2', user_id: 'u1', action_id: 'act-b2', status: 'pending' }],
      autonomy_actions: [{
        id: 'act-b2', user_id: 'u1', action_type: 'publish_campaign', status: 'pending',
        venture_id: 'v1',
        estimated_cost_eur: 200,
        budget_cap_eur: 100,
      }],
      venture_events: [],
    })
    const result = await resolveHumanApproval({
      supabase: fakeSupabase as unknown as ApprovalExecutorSupabase,
      userId: 'u1',
      approvalId: 'app-b2',
      decision: 'approved',
      config: { enabled: true, dryRun: false, globalBudgetCapEur: 100000 },
    })
    expect(result.executed).toBe(false)
    expect((fakeSupabase.tables.autonomy_actions[0].output as Record<string, unknown>).budget_breach).toBe('action_cap_exceeded')
  })

  it('ignore les amount_eur négatifs/null/NaN: la somme reste correcte et déclenche le breach uniquement sur les vraies dépenses', async () => {
    // 3 dépenses légitimes de 40 chacune = 120, + bruit (négatif, null, string) qui doit être ignoré.
    // Cost 10 + venture_spent 120 = 130 > cap 100 → global_cap_exceeded.
    // Si le bruit était compté (-500 ou NaN), la somme serait < 100 et le test passerait par erreur.
    const fakeSupabase = createFakeSupabase({
      human_approvals: [{ id: 'app-b3', user_id: 'u1', action_id: 'act-b3', status: 'pending' }],
      autonomy_actions: [{
        id: 'act-b3', user_id: 'u1', action_type: 'publish_campaign', status: 'pending',
        venture_id: 'v1',
        estimated_cost_eur: 10,
        budget_cap_eur: 1000,
      }],
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
      config: { enabled: true, dryRun: false, globalBudgetCapEur: 100 },
    })
    expect(result.executed).toBe(false)
    expect(fakeSupabase.tables.autonomy_actions[0].status).toBe('blocked')
    expect((fakeSupabase.tables.autonomy_actions[0].output as Record<string, unknown>).budget_breach).toBe('global_cap_exceeded')
  })
})
