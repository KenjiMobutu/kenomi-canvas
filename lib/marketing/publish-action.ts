import type { MarketingPublisher } from './adapters/types'

export interface PublishActionSupabase {
  from(table: string): {
    select(columns?: string): {
      eq(field: string, value: unknown): {
        maybeSingle(): Promise<{ data: PublishDraftRow | null; error: { message: string } | null }>
      }
    }
    insert(row: Record<string, unknown>): PromiseLike<{ error: { message: string } | null }>
    update(patch: Record<string, unknown>): {
      eq(field: string, value: unknown): PromiseLike<{ error: { message: string } | null }>
    }
  }
}

export interface PublishDraftRow {
  id: string
  venture_id: string | null
  channel: string
  content: string
  metadata: Record<string, unknown> | null
}

export interface ExecutePublishInput {
  supabase: PublishActionSupabase
  publisher: MarketingPublisher
  draftId: string
  userId: string
  now?: () => Date
}

export type ExecutePublishResult =
  | { success: true; externalId: string; url?: string; spendEur: number }
  | { success: false; error: string }

function safeNumber(value: unknown): number {
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0) return 0
  return n
}

export async function executePublishCampaign(input: ExecutePublishInput): Promise<ExecutePublishResult> {
  const nowIso = (input.now ?? (() => new Date()))().toISOString()

  const { data: draft, error: draftError } = await input.supabase
    .from('campaign_drafts')
    .select('id, venture_id, channel, content, metadata')
    .eq('id', input.draftId)
    .maybeSingle()

  if (draftError) return { success: false, error: draftError.message }
  if (!draft) return { success: false, error: 'draft introuvable' }

  if (!draft.venture_id) {
    await input.supabase
      .from('campaign_drafts')
      .update({ status: 'failed', metadata: { ...(draft.metadata ?? {}), error: 'venture_id manquant' }, updated_at: nowIso })
      .eq('id', input.draftId)
    return { success: false, error: 'draft sans venture_id' }
  }

  try {
    const publishResult = await input.publisher.publish({
      channel: draft.channel,
      content: draft.content,
      ventureId: draft.venture_id,
      metadata: draft.metadata ?? {},
    })

    await input.supabase.from('venture_events').insert({
      user_id: input.userId,
      venture_id: draft.venture_id,
      event_type: 'campaign_published',
      occurred_at: nowIso,
      payload: {
        external_id: publishResult.externalId,
        url: publishResult.url ?? null,
        channel: draft.channel,
        draft_id: draft.id,
      },
    })

    const budgetEur = safeNumber((draft.metadata ?? {}).budget_eur)
    if (budgetEur > 0) {
      await input.supabase.from('venture_events').insert({
        user_id: input.userId,
        venture_id: draft.venture_id,
        event_type: 'campaign_spend',
        value: Math.round(budgetEur * 100),
        occurred_at: nowIso,
        payload: {
          channel: draft.channel,
          external_id: publishResult.externalId,
          draft_id: draft.id,
        },
      })
    }

    await input.supabase
      .from('campaign_drafts')
      .update({
        status: 'published',
        metadata: { ...(draft.metadata ?? {}), external_id: publishResult.externalId, url: publishResult.url ?? null },
        updated_at: nowIso,
      })
      .eq('id', draft.id)

    return { success: true, externalId: publishResult.externalId, url: publishResult.url, spendEur: budgetEur }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'publish failed'
    await input.supabase
      .from('campaign_drafts')
      .update({
        status: 'failed',
        metadata: { ...(draft.metadata ?? {}), error: message },
        updated_at: nowIso,
      })
      .eq('id', draft.id)
    return { success: false, error: message }
  }
}
