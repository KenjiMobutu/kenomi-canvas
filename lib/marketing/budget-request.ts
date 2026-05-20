interface MarketingBudgetQueryBuilder {
  select(columns?: string): MarketingBudgetQueryBuilder
  eq(field: string, value: unknown): MarketingBudgetQueryBuilder
  insert(row: Record<string, unknown>): MarketingBudgetQueryBuilder
  maybeSingle(): Promise<{ data: Record<string, unknown> | null; error: { message: string } | null }>
  single(): Promise<{ data: Record<string, unknown> | null; error: { message: string } | null }>
}

export interface MarketingBudgetSupabase {
  from(table: string): MarketingBudgetQueryBuilder
}

export interface CreateMarketingBudgetApprovalInput {
  supabase: MarketingBudgetSupabase
  userId: string
  ventureId: string
  amountEur: number
  channel: string
  reason?: string
  now?: () => Date
}

export interface CreateMarketingBudgetApprovalResult {
  budgetRequestId: string
  actionId: string
  approvalId: string
}

function positiveAmount(value: number): number {
  if (!Number.isFinite(value) || value <= 0) throw new Error('budget_eur invalide')
  return Math.min(5000, Math.round(value * 100) / 100)
}

function cleanChannel(channel: string): string {
  const value = channel.trim().toLowerCase()
  if (!value) throw new Error('channel requis')
  return value
}

export async function createMarketingBudgetApproval(
  input: CreateMarketingBudgetApprovalInput
): Promise<CreateMarketingBudgetApprovalResult> {
  const amountEur = positiveAmount(input.amountEur)
  const channel = cleanChannel(input.channel)
  const nowIso = (input.now ?? (() => new Date()))().toISOString()
  const reason =
    input.reason?.trim() ||
    `Budget marketing ${channel} pour tester acquisition, conversion et ROI attribuable.`

  const { data: venture, error: ventureError } = await input.supabase
    .from('ventures')
    .select('id')
    .eq('id', input.ventureId)
    .eq('user_id', input.userId)
    .maybeSingle()

  if (ventureError) throw new Error(ventureError.message)
  if (!venture) throw new Error('venture introuvable')

  const { data: budgetRequest, error: budgetError } = await input.supabase
    .from('budget_requests')
    .insert({
      venture_id: input.ventureId,
      campaign_name: `Budget ${channel}`,
      amount_eur: amountEur,
      reason,
      status: 'pending',
      created_at: nowIso,
    })
    .select('id')
    .single()

  if (budgetError) throw new Error(budgetError.message)
  if (!budgetRequest?.id || typeof budgetRequest.id !== 'string') {
    throw new Error('budget_request non créé')
  }

  const { data: action, error: actionError } = await input.supabase
    .from('autonomy_actions')
    .insert({
      user_id: input.userId,
      venture_id: input.ventureId,
      action_type: 'scale_budget',
      risk_level: 'high',
      status: 'blocked',
      estimated_cost_eur: amountEur,
      budget_cap_eur: Math.max(amountEur, Math.ceil(amountEur * 1.25)),
      input: {
        source: 'marketing_budget',
        budget_request_id: budgetRequest.id,
        channel,
        recommended_budget_eur: amountEur,
        rationale: reason,
        next_step: `Publier une campagne ${channel} avec ${amountEur} EUR et mesurer ROI.`,
      },
      output: {},
      created_at: nowIso,
      updated_at: nowIso,
    })
    .select('id')
    .single()

  if (actionError) throw new Error(actionError.message)
  if (!action?.id || typeof action.id !== 'string') throw new Error('action non créée')

  const { data: approval, error: approvalError } = await input.supabase
    .from('human_approvals')
    .insert({
      user_id: input.userId,
      action_id: action.id,
      status: 'pending',
      reason,
      created_at: nowIso,
      updated_at: nowIso,
    })
    .select('id')
    .single()

  if (approvalError) throw new Error(approvalError.message)
  if (!approval?.id || typeof approval.id !== 'string') throw new Error('approval non créée')

  return {
    budgetRequestId: budgetRequest.id,
    actionId: action.id,
    approvalId: approval.id,
  }
}
