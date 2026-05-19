import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { apiError } from '@/lib/api-response'
import { requireAllowedUser } from '@/lib/auth-server'
import { insertAuditEvent } from '@/lib/audit-log'
import { createMockPublisher } from '@/lib/marketing/adapters/mock'
import { executePublishCampaign, type PublishActionSupabase } from '@/lib/marketing/publish-action'
import {
  buildControlledCampaignDraft,
  buildControlledTrackingEvents,
} from '@/lib/revenue-proof-actions'

const proofRequestSchema = z.object({
  action: z.enum(['publish_controlled_campaign', 'record_controlled_tracking']),
  ventureId: z.string().min(1).optional(),
})

type VentureRow = {
  id: string
  name?: string | null
}

type CampaignDraftRow = {
  id: string
  channel: string
  provider_run_id?: string | null
  metadata?: Record<string, unknown> | null
}

async function loadVenture(input: {
  supabase: Awaited<ReturnType<typeof requireAllowedUser>>['supabase']
  userId: string
  ventureId?: string
}): Promise<VentureRow> {
  let query = input.supabase.from('ventures').select('id, name').eq('user_id', input.userId)

  if (input.ventureId) query = query.eq('id', input.ventureId)

  const { data, error } = await query
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!data?.id) throw new Error('Aucune venture disponible pour la preuve revenue')
  return data as VentureRow
}

async function publishControlledCampaign(input: {
  supabase: Awaited<ReturnType<typeof requireAllowedUser>>['supabase']
  userId: string
  venture: VentureRow
  nowIso: string
}) {
  const { data: draft, error: draftError } = await input.supabase
    .from('campaign_drafts')
    .insert(
      buildControlledCampaignDraft({
        userId: input.userId,
        ventureId: input.venture.id,
        nowIso: input.nowIso,
      })
    )
    .select('id')
    .single()

  if (draftError || !draft?.id) {
    throw new Error(draftError?.message ?? 'Création campagne contrôlée impossible')
  }

  const result = await executePublishCampaign({
    supabase: input.supabase as unknown as PublishActionSupabase,
    publisher: createMockPublisher(),
    draftId: draft.id,
    userId: input.userId,
    now: () => new Date(input.nowIso),
  })

  const status = result.success ? 'completed' : 'failed'
  await input.supabase.from('autonomy_actions').insert({
    user_id: input.userId,
    venture_id: input.venture.id,
    action_type: 'publish_campaign',
    risk_level: 'low',
    status,
    estimated_cost_eur: result.success ? result.spendEur : 0,
    input: {
      source: 'revenue_proof',
      adapter: 'mock',
      draft_id: draft.id,
    },
    output: result.success
      ? {
          executed: true,
          handler: 'publish_campaign',
          external_id: result.externalId,
          url: result.url ?? null,
          spend_eur: result.spendEur,
        }
      : { executed: false, error: result.error },
    created_at: input.nowIso,
    updated_at: input.nowIso,
  })

  if (!result.success) throw new Error(result.error)

  await insertAuditEvent(input.supabase, {
    user_id: input.userId,
    event_type: 'revenue.proof.campaign_published',
    metadata: {
      venture_id: input.venture.id,
      draft_id: draft.id,
      external_id: result.externalId,
      spend_eur: result.spendEur,
    },
  })

  return { draftId: draft.id, ...result }
}

async function loadLatestPublishedCampaign(input: {
  supabase: Awaited<ReturnType<typeof requireAllowedUser>>['supabase']
  userId: string
  ventureId: string
}): Promise<CampaignDraftRow | null> {
  const { data, error } = await input.supabase
    .from('campaign_drafts')
    .select('id, channel, provider_run_id, metadata')
    .eq('user_id', input.userId)
    .eq('venture_id', input.ventureId)
    .eq('status', 'published')
    .order('published_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) throw new Error(error.message)
  return (data as CampaignDraftRow | null) ?? null
}

async function recordControlledTracking(input: {
  supabase: Awaited<ReturnType<typeof requireAllowedUser>>['supabase']
  userId: string
  venture: VentureRow
  nowIso: string
}) {
  const campaign = await loadLatestPublishedCampaign({
    supabase: input.supabase,
    userId: input.userId,
    ventureId: input.venture.id,
  })

  if (!campaign) {
    throw new Error('Aucune campagne publiée pour attribuer le tracking')
  }

  const rows = buildControlledTrackingEvents({
    userId: input.userId,
    ventureId: input.venture.id,
    nowIso: input.nowIso,
    campaign: {
      channel: campaign.channel,
      draftId: campaign.id,
      externalId: campaign.provider_run_id ?? `mock-${campaign.id}`,
    },
  })

  const { error } = await input.supabase.from('venture_events').insert(rows)
  if (error) throw new Error(error.message)

  await input.supabase.from('autonomy_actions').insert({
    user_id: input.userId,
    venture_id: input.venture.id,
    action_type: 'record_tracking',
    risk_level: 'low',
    status: 'completed',
    input: {
      source: 'revenue_proof',
      draft_id: campaign.id,
    },
    output: {
      events: rows.map((row) => row.event_type),
    },
    created_at: input.nowIso,
    updated_at: input.nowIso,
  })

  await insertAuditEvent(input.supabase, {
    user_id: input.userId,
    event_type: 'revenue.proof.tracking_recorded',
    metadata: {
      venture_id: input.venture.id,
      draft_id: campaign.id,
      events: rows.map((row) => row.event_type),
    },
  })

  return { events: rows.map((row) => row.event_type), draftId: campaign.id }
}

export async function POST(req: NextRequest) {
  const { user, supabase, response } = await requireAllowedUser(await cookies())
  if (response) return response

  const parsed = proofRequestSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return apiError('Payload preuve revenue invalide', 400)

  try {
    const nowIso = new Date().toISOString()
    const venture = await loadVenture({
      supabase,
      userId: user!.id,
      ventureId: parsed.data.ventureId,
    })

    if (parsed.data.action === 'publish_controlled_campaign') {
      const campaign = await publishControlledCampaign({
        supabase,
        userId: user!.id,
        venture,
        nowIso,
      })
      return NextResponse.json({ ok: true, action: parsed.data.action, venture, campaign })
    }

    const tracking = await recordControlledTracking({
      supabase,
      userId: user!.id,
      venture,
      nowIso,
    })
    return NextResponse.json({ ok: true, action: parsed.data.action, venture, tracking })
  } catch (error) {
    return apiError(error instanceof Error ? error.message : 'Preuve revenue impossible', 500)
  }
}
