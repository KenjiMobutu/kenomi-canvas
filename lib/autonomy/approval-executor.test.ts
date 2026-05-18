import { describe, expect, it } from 'vitest'
import { resolveHumanApproval, type ApprovalExecutorSupabase } from './approval-executor'

type TableName =
  | 'human_approvals'
  | 'autonomy_actions'
  | 'ventures'
  | 'landing_pages'
  | 'budget_requests'
  | 'campaigns'

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
