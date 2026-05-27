export interface ScoutSignalDbRow {
  source_id: string | null
  source_label: string | null
  signal_type: string | null
  subreddit: string | null
  title: string | null
  url: string | null
  score: number | null
  evidence: string | null
  created_at: string | null
}

export interface ScoutSignalView {
  sourceId: string
  sourceLabel: string
  signalType: string
  subreddit: string | null
  title: string
  url: string
  score: number
  evidence: string
  createdAt: string
}

export interface ScoutSignalsApiView {
  status: 'live' | 'degraded'
  lastFetchedAt: string | null
  signals: ScoutSignalView[]
}

export function buildScoutSignalsApiView(rows: ScoutSignalDbRow[]): ScoutSignalsApiView {
  const signals = rows
    .filter((row) => row.title && row.url && row.created_at)
    .map((row) => ({
      sourceId: row.source_id ?? 'reddit',
      sourceLabel: row.source_label ?? 'Reddit',
      signalType: row.signal_type ?? 'pain',
      subreddit: row.subreddit ?? null,
      title: row.title ?? '',
      url: row.url ?? '',
      score: row.score ?? 0,
      evidence: row.evidence ?? '',
      createdAt: row.created_at ?? new Date(0).toISOString(),
    }))
    .sort((a, b) => {
      if (a.createdAt === b.createdAt) return b.score - a.score
      return a.createdAt < b.createdAt ? 1 : -1
    })

  return {
    status: signals.length > 0 ? 'live' : 'degraded',
    lastFetchedAt: signals[0]?.createdAt ?? null,
    signals,
  }
}
