import { NextResponse } from 'next/server'
import { z } from 'zod'
import { evaluateHermesAutoExecution } from '@/lib/autonomy/policy'
import { buildTelegramAuditInsert } from '@/lib/hermes-operator/telegram-audit'
import { isTelegramOperatorAuthorized } from '@/lib/hermes-operator/telegram-auth'
import { mapTelegramActionToOperatorExecution } from '@/lib/hermes-operator/telegram-actions'
import {
  buildTelegramBlockedResponse,
  buildTelegramBriefResponse,
  buildTelegramRevenueResponse,
} from '@/lib/hermes-operator/telegram-read-model'
import { routeTelegramCommand } from '@/lib/hermes-operator/telegram-router'
import { supabaseAdmin } from '@/lib/supabase-admin'

const telegramCommandSchema = z.object({
  chat_id: z.string().trim().min(1),
  text: z.string().trim().min(1),
})

type SupportedTelegramRouteIntent =
  | 'read_brief'
  | 'read_revenue'
  | 'run_prospect'
  | 'run_devops'
  | 'scan_followups'
  | 'refuse'

function isSupportedTelegramRouteIntent(value: string): value is SupportedTelegramRouteIntent {
  return (
    value === 'read_brief' ||
    value === 'read_revenue' ||
    value === 'run_prospect' ||
    value === 'run_devops' ||
    value === 'scan_followups' ||
    value === 'refuse'
  )
}

type TelegramRouteSupabase = {
  from(table: string): {
    select(columns?: string): any
    eq(field: string, value: unknown): any
    order(field: string, options?: { ascending?: boolean }): any
    limit(count: number): any
    insert(row: Record<string, unknown>): any
    maybeSingle(): Promise<{ data: Record<string, unknown> | null; error: { message: string } | null }>
    then<TResult1 = { data: Record<string, unknown>[]; error: null }, TResult2 = never>(
      onfulfilled?:
        | ((value: { data: Record<string, unknown>[]; error: null }) => TResult1 | PromiseLike<TResult1>)
        | null,
      onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
    ): PromiseLike<TResult1 | TResult2>
  }
}

async function resolveTelegramOperator(input: {
  supabase: TelegramRouteSupabase
  chatId: string
}) {
  const result = await input.supabase
    .from('user_operator_settings')
    .select(
      'user_id, operator_mode, max_auto_actions_per_day, max_auto_prospect_runs_per_day, max_auto_follow_up_scans_per_day, max_auto_devops_runs_per_day, telegram_enabled, telegram_allowed_chat_id'
    )
    .eq('telegram_enabled', true)
    .eq('telegram_allowed_chat_id', input.chatId)
    .maybeSingle()

  if (result.error) throw new Error(result.error.message)
  return result.data
}

async function insertTelegramAudit(input: {
  supabase: TelegramRouteSupabase
  userId: string
  chatId: string
  text: string
  intent: SupportedTelegramRouteIntent
  executed: boolean
  blockedReason?: string | null
  summary: string
  metadata?: Record<string, unknown>
}) {
  await input.supabase.from('operator_remote_commands').insert(
    buildTelegramAuditInsert({
      userId: input.userId,
      remoteActor: input.chatId,
      rawText: input.text,
      intentKind: input.intent,
      executed: input.executed,
      blockedReason: input.blockedReason ?? null,
      responseSummary: input.summary,
      metadata: input.metadata,
    })
  )
}

export async function POST(request: Request) {
  if (!isTelegramOperatorAuthorized(request.headers)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const parsed = telegramCommandSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid telegram payload' }, { status: 400 })
  }

  const supabase = supabaseAdmin as unknown as TelegramRouteSupabase
  const operator = await resolveTelegramOperator({
    supabase,
    chatId: parsed.data.chat_id,
  })

  if (!operator?.user_id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const intent = routeTelegramCommand(parsed.data.text)
  if (!isSupportedTelegramRouteIntent(intent.kind)) {
    return NextResponse.json({ error: 'Unsupported telegram intent' }, { status: 400 })
  }

  if (intent.kind === 'refuse') {
    const blocked = buildTelegramBlockedResponse({
      blockedReason: intent.blockedReason ?? 'unsupported_command',
      summary: 'Blocked: request refused by policy.',
    })
    await insertTelegramAudit({
      supabase,
      userId: String(operator.user_id),
      chatId: parsed.data.chat_id,
      text: parsed.data.text,
      intent: blocked.kind,
      executed: false,
      blockedReason: blocked.blockedReason,
      summary: blocked.summary,
      metadata: { normalizedText: intent.normalizedText },
    })
    return NextResponse.json({
      ok: true,
      intent: blocked.kind,
      summary: blocked.summary,
      executed: false,
      blocked_reason: blocked.blockedReason,
      deep_link: '/studio/agents',
    })
  }

  if (intent.kind === 'read_brief') {
    const [briefResult, alertsResult] = await Promise.all([
      supabase
        .from('hermes_operator_briefs')
        .select('summary, next_best_action, created_at')
        .eq('user_id', operator.user_id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from('business_alerts')
        .select('headline, created_at')
        .eq('user_id', operator.user_id)
        .order('created_at', { ascending: false })
        .limit(2),
    ])

    if (briefResult.error) {
      return NextResponse.json({ error: briefResult.error.message }, { status: 500 })
    }

    const response = buildTelegramBriefResponse({
      brief: {
        headline: String(briefResult.data?.summary ?? 'No Hermes brief yet'),
        nextAction: {
          title: String(briefResult.data?.next_best_action ?? 'Open Studio and run Hermes'),
        },
      },
      alerts: ((alertsResult.data ?? []) as Array<Record<string, unknown>>).map((row) => ({
        headline: String(row.headline ?? ''),
      })),
    })
    await insertTelegramAudit({
      supabase,
      userId: String(operator.user_id),
      chatId: parsed.data.chat_id,
      text: parsed.data.text,
      intent: response.kind,
      executed: false,
      summary: response.summary,
      metadata: { normalizedText: intent.normalizedText },
    })
    return NextResponse.json({
      ok: true,
      intent: response.kind,
      summary: response.summary,
      executed: false,
      blocked_reason: null,
      deep_link: '/studio',
    })
  }

  if (intent.kind === 'read_revenue') {
    const [paymentsResult, prospectsResult] = await Promise.all([
      supabase.from('payment_attributions').select('amount_cents, status').eq('user_id', operator.user_id),
      supabase.from('prospects').select('id, approval_status').eq('user_id', operator.user_id),
    ])

    const paymentRows = (paymentsResult.data ?? []) as Array<Record<string, unknown>>
    const prospectRows = (prospectsResult.data ?? []) as Array<Record<string, unknown>>

    const paidCashEur = paymentRows
      .filter((row) => row.status === 'paid')
      .reduce((sum: number, row) => sum + Number(row.amount_cents ?? 0), 0) / 100
    const blockedCashEur = paymentRows
      .filter((row) => row.status !== 'paid')
      .reduce((sum: number, row) => sum + Number(row.amount_cents ?? 0), 0) / 100
    const pendingApprovals = prospectRows.filter(
      (row) => row.approval_status === 'pending'
    ).length

    const response = buildTelegramRevenueResponse({
      paidCashEur,
      blockedCashEur,
      pendingApprovals,
    })
    await insertTelegramAudit({
      supabase,
      userId: String(operator.user_id),
      chatId: parsed.data.chat_id,
      text: parsed.data.text,
      intent: response.kind,
      executed: false,
      summary: response.summary,
      metadata: { normalizedText: intent.normalizedText },
    })
    return NextResponse.json({
      ok: true,
      intent: response.kind,
      summary: response.summary,
      executed: false,
      blocked_reason: null,
      deep_link: '/studio/revenue',
    })
  }

  const execution = mapTelegramActionToOperatorExecution(intent.kind)
  if (!execution) {
    return NextResponse.json({ error: 'Unsupported telegram action' }, { status: 400 })
  }

  const policy = evaluateHermesAutoExecution({
    mode:
      operator.operator_mode === 'recommend' || operator.operator_mode === 'act'
        ? operator.operator_mode
        : 'observe',
    actionType: execution.actionType,
    riskLevel: 'low',
    recommendationKind: execution.recommendationKind,
    agentId: execution.actionType === 'run_agent' ? execution.payload.agentId : null,
    caps: {
      maxAutoActionsPerDay: Number(operator.max_auto_actions_per_day ?? 6),
      maxAutoProspectRunsPerDay: Number(operator.max_auto_prospect_runs_per_day ?? 3),
      maxAutoFollowUpScansPerDay: Number(operator.max_auto_follow_up_scans_per_day ?? 2),
      maxAutoDevopsRunsPerDay: Number(operator.max_auto_devops_runs_per_day ?? 1),
    },
    usage: {
      totalAutoActionsToday: 0,
      prospectRunsToday: 0,
      followUpScansToday: 0,
      devopsRunsToday: 0,
    },
  })

  if (!policy.ok) {
    const blocked = buildTelegramBlockedResponse({
      blockedReason: policy.reason,
    })
    await insertTelegramAudit({
      supabase,
      userId: String(operator.user_id),
      chatId: parsed.data.chat_id,
      text: parsed.data.text,
      intent: intent.kind,
      executed: false,
      blockedReason: blocked.blockedReason,
      summary: blocked.summary,
      metadata: { normalizedText: intent.normalizedText },
    })
    return NextResponse.json({
      ok: true,
      intent: intent.kind,
      summary: blocked.summary,
      executed: false,
      blocked_reason: blocked.blockedReason,
      deep_link: execution.deepLink,
    })
  }

  const nowIso = new Date().toISOString()
  const jobPayload =
    execution.actionType === 'run_agent'
      ? {
          agentId: execution.payload.agentId,
          input: {
            trigger: 'telegram_operator',
            recommendationKind: execution.recommendationKind,
            chatId: parsed.data.chat_id,
          },
        }
      : {
          trigger: 'telegram_operator',
          scheduleKey: 'follow_ups',
          recommendationKind: execution.recommendationKind,
          chatId: parsed.data.chat_id,
        }

  await supabase.from('autonomy_jobs').insert({
    user_id: operator.user_id,
    venture_id: null,
    kind: execution.actionType === 'run_agent' ? 'run_agent' : 'follow_up_scan',
    status: 'queued',
    attempt_count: 0,
    next_run_at: nowIso,
    payload: jobPayload,
    created_at: nowIso,
    updated_at: nowIso,
  })

  await insertTelegramAudit({
    supabase,
    userId: String(operator.user_id),
    chatId: parsed.data.chat_id,
    text: parsed.data.text,
    intent: intent.kind,
    executed: true,
    summary: execution.successSummary,
    metadata: { normalizedText: intent.normalizedText },
  })

  return NextResponse.json({
    ok: true,
    intent: intent.kind,
    summary: execution.successSummary,
    executed: true,
    blocked_reason: null,
    deep_link: execution.deepLink,
  })
}
