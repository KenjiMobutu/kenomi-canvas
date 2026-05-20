import { describe, expect, it } from 'vitest'
import { createMarketingBudgetApproval, type MarketingBudgetSupabase } from './budget-request'

type TableName = 'ventures' | 'budget_requests' | 'autonomy_actions' | 'human_approvals'
type Row = Record<string, unknown>

function fakeSupabase(seed: Partial<Record<TableName, Row[]>> = {}) {
  const tables: Record<TableName, Row[]> = {
    ventures: seed.ventures ?? [],
    budget_requests: seed.budget_requests ?? [],
    autonomy_actions: seed.autonomy_actions ?? [],
    human_approvals: seed.human_approvals ?? [],
  }

  return {
    tables,
    from(table: string) {
      const tableName = table as TableName
      const filters: Array<{ field: string; value: unknown }> = []
      let inserted: Row | null = null

      const matches = (row: Row) => filters.every((filter) => row[filter.field] === filter.value)
      const builder = {
        select: () => builder,
        eq: (field: string, value: unknown) => {
          filters.push({ field, value })
          return builder
        },
        insert: (row: Row) => {
          inserted = { id: `${tableName}-${tables[tableName].length + 1}`, ...row }
          tables[tableName].push(inserted)
          return builder
        },
        maybeSingle: async () => ({ data: tables[tableName].find(matches) ?? null, error: null }),
        single: async () => ({ data: inserted ?? tables[tableName].find(matches) ?? null, error: null }),
      }
      return builder
    },
  } as unknown as MarketingBudgetSupabase & { tables: Record<TableName, Row[]> }
}

describe('createMarketingBudgetApproval', () => {
  it('crée une demande budget explicite avec approval scale_budget', async () => {
    const supabase = fakeSupabase({
      ventures: [{ id: 'venture-1', user_id: 'user-1', name: 'NoteFast' }],
    })

    const result = await createMarketingBudgetApproval({
      supabase,
      userId: 'user-1',
      ventureId: 'venture-1',
      amountEur: 75,
      channel: 'linkedin',
      reason: 'Tester le canal B2B',
      now: () => new Date('2026-05-20T09:00:00.000Z'),
    })

    expect(result).toMatchObject({ budgetRequestId: 'budget_requests-1', actionId: 'autonomy_actions-1' })
    expect(supabase.tables.budget_requests[0]).toMatchObject({
      venture_id: 'venture-1',
      campaign_name: 'Budget linkedin',
      amount_eur: 75,
      status: 'pending',
    })
    expect(supabase.tables.autonomy_actions[0]).toMatchObject({
      user_id: 'user-1',
      venture_id: 'venture-1',
      action_type: 'scale_budget',
      status: 'blocked',
      estimated_cost_eur: 75,
      input: expect.objectContaining({
        source: 'marketing_budget',
        channel: 'linkedin',
        recommended_budget_eur: 75,
      }),
    })
    expect(supabase.tables.human_approvals[0]).toMatchObject({
      action_id: 'autonomy_actions-1',
      status: 'pending',
    })
  })
})
