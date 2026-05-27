import type { RunAgentStepSupabase } from '@/lib/autonomy/run-agent-step'
import type { ScoutSourceCollection, ScoutSourceSignal } from './free-sources'

function normalizedPayload(signal: ScoutSourceSignal): Record<string, unknown> {
  return {
    sourceId: signal.sourceId,
    sourceLabel: signal.sourceLabel,
    signalType: signal.signalType,
    subreddit: signal.subreddit ?? null,
    title: signal.title,
    url: signal.url,
    score: signal.score,
    evidence: signal.evidence,
    sellableOffer: signal.sellableOffer,
  }
}

export function buildScoutSignalRows(input: {
  userId: string
  collection: ScoutSourceCollection
  limit?: number
}): Array<Record<string, unknown>> {
  return input.collection.signals.slice(0, input.limit ?? 6).map((signal) => ({
    user_id: input.userId,
    source_id: signal.sourceId,
    source_label: signal.sourceLabel,
    signal_type: signal.signalType,
    subreddit: signal.subreddit ?? null,
    title: signal.title,
    url: signal.url,
    score: signal.score,
    evidence: signal.evidence,
    normalized_payload: normalizedPayload(signal),
    created_at: input.collection.generatedAt,
  }))
}

export async function appendScoutSignals(input: {
  supabase: RunAgentStepSupabase
  userId: string
  collection: ScoutSourceCollection
  limit?: number
}): Promise<void> {
  const rows = buildScoutSignalRows(input)
  if (rows.length === 0) return
  const { error } = await input.supabase.from('scout_signals').insert(rows)
  if (error) throw new Error(error.message)
}
