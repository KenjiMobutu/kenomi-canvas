import { buildDevopsSummaryApiView, type DevopsDiagnosticRunRow } from '@/lib/devops/api-view'
import { buildConversionTruthSnapshot, type ConversionTruthSnapshot } from '@/lib/revenue/conversion-truth'
import {
  buildRevenueLoopSnapshot,
  type RevenueApprovalRow,
  type RevenueAutonomyActionRow,
  type RevenueCampaignDraftRow,
  type RevenueDecisionRow,
  type RevenuePaymentRow,
  type RevenuePipelineRow,
  type RevenueVentureRow,
} from '@/lib/revenue-loop'
import type { CommerceLandingPageRow } from '@/lib/venture-commerce-readiness'
import { buildWeeklyRevenueReview } from '@/lib/revenue/weekly-review'
import { buildCashOutcomeSnapshot } from '@/lib/studio/cash-outcomes'
import type { HermesOperatorContextSnapshot } from '@/lib/hermes-operator/types'
import { filterRowsByVentureIds } from '@/lib/revenue/ownership'

interface QueryResult<T> {
  data: T | null
  error: { message: string } | null
}

interface QueryBuilder<T = unknown> extends PromiseLike<QueryResult<T[]>> {
  select(columns?: string): QueryBuilder<T>
  eq(field: string, value: unknown): QueryBuilder<T>
  order(field: string, options?: { ascending?: boolean }): QueryBuilder<T>
  limit(count: number): QueryBuilder<T>
  maybeSingle(): Promise<QueryResult<T>>
}

export interface HermesOperatorContextSupabase {
  from(table: string): QueryBuilder<any>
}

type OfferRow = {
  id: string
  name?: string | null
}

type ProspectRow = {
  id: string
  source?: string | null
  band?: string | null
  offer_id?: string | null
  offer_variant?: string | null
  outreach_angle?: string | null
  pipeline_status?: string | null
  created_at?: string | null
  next_followup_at?: string | null
  metadata?: {
    model?: string | null
    model_family?: string | null
  } | null
}

type ProspectActivityRow = {
  prospect_id?: string | null
  type?: string | null
  created_at?: string | null
}

type ConversationEventRow = {
  prospect_id?: string | null
  event_type?: string | null
  created_at?: string | null
}

type PaymentAttributionRow = {
  prospect_id?: string | null
  offer_id?: string | null
  offer_variant?: string | null
  outreach_angle?: string | null
  source?: string | null
  band?: string | null
  amount_eur?: number | string | null
  payment_status?: string | null
  attributed_at?: string | null
  created_at?: string | null
}

type AutonomyControlRow = {
  status?: 'active' | 'paused'
  reason?: string | null
}

type AutonomyJobRow = {
  status?: string | null
}

type HumanApprovalRow = {
  status?: string | null
}

function throwIfError<T>(result: QueryResult<T>): T | null {
  if (result.error) throw new Error(result.error.message)
  return result.data
}

async function readTable<T>(query: QueryBuilder<T>): Promise<T[]> {
  const data = throwIfError(await query)
  return Array.isArray(data) ? data : []
}

async function readSingle<T>(query: QueryBuilder<T>): Promise<T | null> {
  return throwIfError(await query.maybeSingle())
}

function isDue(dateValue: string | null | undefined, now: Date) {
  if (!dateValue) return false
  return new Date(dateValue).getTime() <= now.getTime()
}

function countWhere<T>(rows: T[], predicate: (row: T) => boolean) {
  return rows.reduce((count, row) => count + (predicate(row) ? 1 : 0), 0)
}

export async function buildHermesOperatorContext(input: {
  supabase: HermesOperatorContextSupabase
  userId: string
  now?: Date
}): Promise<HermesOperatorContextSnapshot> {
  const now = input.now ?? new Date()
  const ventures = await readTable<RevenueVentureRow>(
    input.supabase
      .from('ventures')
      .select('*')
      .eq('user_id', input.userId)
      .order('created_at', { ascending: false })
      .limit(150)
  )
  const ventureIds = ventures.map((venture) => venture.id)
  const [
    offers,
    prospects,
    activities,
    conversationEvents,
    paymentAttributions,
    payments,
    pipelines,
    landingPages,
    campaignDrafts,
    autonomyActions,
    revenueApprovals,
    decisions,
    control,
    jobs,
    approvals,
    latestDevopsRun,
  ] =
    await Promise.all([
      readTable<OfferRow>(
        input.supabase
          .from('offers')
          .select('id, name')
          .eq('user_id', input.userId)
          .order('created_at', { ascending: false })
      ),
      readTable<ProspectRow>(
        input.supabase
          .from('prospects')
          .select(
            'id, source, band, offer_id, offer_variant, outreach_angle, pipeline_status, created_at, next_followup_at, metadata'
          )
          .eq('user_id', input.userId)
          .order('updated_at', { ascending: false })
          .limit(500)
      ),
      readTable<ProspectActivityRow>(
        input.supabase
          .from('prospect_activities')
          .select('prospect_id, type, created_at')
          .eq('user_id', input.userId)
          .order('created_at', { ascending: false })
          .limit(800)
      ),
      readTable<ConversationEventRow>(
        input.supabase
          .from('prospect_conversation_events')
          .select('prospect_id, event_type, created_at')
          .eq('user_id', input.userId)
          .order('created_at', { ascending: false })
          .limit(800)
      ),
      readTable<PaymentAttributionRow>(
        input.supabase
          .from('payment_attributions')
          .select(
            'prospect_id, offer_id, offer_variant, outreach_angle, source, band, amount_eur, payment_status, attributed_at, created_at'
          )
          .eq('user_id', input.userId)
          .order('created_at', { ascending: false })
          .limit(800)
      ),
      readTable<RevenuePaymentRow>(
        input.supabase
          .from('payments')
          .select(
            'id, venture_id, status, provider_status, amount_eur, expected_amount_eur, collected_amount_eur, trial_days, checkout_url, created_at, updated_at'
          )
          .order('created_at', { ascending: false })
          .limit(800)
      ),
      readTable<RevenuePipelineRow>(
        input.supabase
          .from('venture_pipeline')
          .select('*')
          .eq('user_id', input.userId)
          .order('updated_at', { ascending: false })
          .limit(100)
      ),
      readTable<CommerceLandingPageRow>(
        input.supabase
          .from('landing_pages')
          .select('venture_id, statut, health_status')
          .order('created_at', { ascending: false })
          .limit(200)
      ),
      readTable<RevenueCampaignDraftRow>(
        input.supabase
          .from('campaign_drafts')
          .select('*')
          .eq('user_id', input.userId)
          .order('created_at', { ascending: false })
          .limit(200)
      ),
      readTable<RevenueAutonomyActionRow>(
        input.supabase
          .from('autonomy_actions')
          .select('*')
          .eq('user_id', input.userId)
          .order('created_at', { ascending: false })
          .limit(200)
      ),
      readTable<RevenueApprovalRow>(
        input.supabase
          .from('human_approvals')
          .select('*')
          .eq('user_id', input.userId)
          .order('created_at', { ascending: false })
          .limit(200)
      ),
      readTable<RevenueDecisionRow>(
        input.supabase
          .from('decisions')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(200)
      ),
      readSingle<AutonomyControlRow>(
        input.supabase.from('autonomy_controls').select('status, reason').eq('user_id', input.userId)
      ),
      readTable<AutonomyJobRow>(
        input.supabase
          .from('autonomy_jobs')
          .select('status')
          .eq('user_id', input.userId)
          .order('created_at', { ascending: false })
          .limit(200)
      ),
      readTable<HumanApprovalRow>(
        input.supabase
          .from('human_approvals')
          .select('status')
          .eq('user_id', input.userId)
          .order('created_at', { ascending: false })
          .limit(200)
      ),
      readSingle<DevopsDiagnosticRunRow>(
        input.supabase
          .from('devops_diagnostic_runs')
          .select(
            'id,summary_status,checked_at,created_at,summary_payload,runtime_payload,timeline_payload'
          )
          .eq('user_id', input.userId)
          .order('created_at', { ascending: false })
          .limit(1)
      ),
    ])

  const conversions: ConversionTruthSnapshot = buildConversionTruthSnapshot({
    offers,
    prospects,
    activities,
    conversationEvents,
    paymentAttributions,
  })
  const ownedPayments = filterRowsByVentureIds(payments, ventureIds)
  const ownedLandingPages = filterRowsByVentureIds(landingPages, ventureIds)
  const ownedDecisions = filterRowsByVentureIds(decisions, ventureIds)
  const weeklyReview = buildWeeklyRevenueReview({
    conversions,
    nowIso: now.toISOString(),
  })
  const outcomes = buildCashOutcomeSnapshot({
    activities,
    payments: ownedPayments,
    prospects,
    nowIso: now.toISOString(),
  })
  const loopSnapshot = buildRevenueLoopSnapshot({
    pipelines,
    ventures,
    landingPages: ownedLandingPages,
    payments: ownedPayments,
    campaignDrafts,
    autonomyActions,
    approvals: revenueApprovals,
    decisions: ownedDecisions,
  })
  const devopsSummary = buildDevopsSummaryApiView({ row: latestDevopsRun })

  return {
    generatedAt: now.toISOString(),
    revenue: {
      conversions,
      weeklyReview,
      outcomes,
      loop: loopSnapshot.summary,
    },
    prospects: {
      total: prospects.length,
      awaitingApproval: countWhere(
        prospects,
        (prospect) => (prospect.pipeline_status ?? '').trim() === 'awaiting_approval'
      ),
      pendingApprovals: countWhere(approvals, (approval) => approval.status === 'pending'),
      followUpsDue: countWhere(
        prospects,
        (prospect) =>
          isDue(prospect.next_followup_at, now) &&
          !['won', 'lost'].includes((prospect.pipeline_status ?? '').trim())
      ),
      hotLeads: countWhere(prospects, (prospect) => (prospect.band ?? '').trim() === 'hot'),
    },
    automation: {
      autonomyStatus: control?.status === 'paused' ? 'paused' : 'active',
      pausedReason: control?.reason ?? null,
      queuedJobs: countWhere(jobs, (job) => job.status === 'queued'),
      runningJobs: countWhere(jobs, (job) => job.status === 'running'),
      failedJobs: countWhere(jobs, (job) => job.status === 'failed'),
    },
    infrastructure: {
      status: devopsSummary?.status ?? 'unknown',
      headline: devopsSummary?.headline ?? 'No DevOps snapshot',
      summary: devopsSummary?.summary ?? 'No infrastructure summary available yet.',
      operatorNextStep: devopsSummary?.operatorNextStep ?? 'Run a DevOps diagnostics mission.',
      checkedAt: devopsSummary?.checkedAt ?? null,
      runtimeCommit: devopsSummary?.runtimeCommit ?? null,
      servicesCount: devopsSummary?.services.length ?? 0,
      openIncidents: devopsSummary?.incidents.length ?? 0,
    },
  }
}
