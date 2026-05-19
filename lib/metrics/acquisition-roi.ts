export interface AcquisitionEventRow {
  venture_id: string | null
  event_type: string
  value: number | null
  occurred_at?: string | null
  metadata?: Record<string, unknown> | null
}

export type AcquisitionRecommendation = 'scale' | 'hold' | 'cut'

export interface AcquisitionRoiRow {
  id: string
  channel: string
  campaignId: string
  publishedCount: number
  revenueCents: number
  spendCents: number
  profitCents: number
  roi: number
  recommendation: AcquisitionRecommendation
  recommendedBudgetEur: number
}

export interface AcquisitionRoiSnapshot {
  summary: {
    revenueCents: number
    spendCents: number
    profitCents: number
    roi: number
    recommendedBudgetEur: number
  }
  channels: AcquisitionRoiRow[]
  campaigns: AcquisitionRoiRow[]
}

interface CampaignTouch {
  ventureId: string
  channel: string
  campaignId: string
  occurredAt: number
}

function cents(value: unknown): number {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? n : 0
}

function metadataString(metadata: Record<string, unknown> | null | undefined, key: string): string {
  const value = metadata?.[key]
  return typeof value === 'string' && value.length > 0 ? value : ''
}

function eventTime(event: AcquisitionEventRow): number {
  return Date.parse(event.occurred_at ?? '') || 0
}

function campaignId(event: AcquisitionEventRow): string {
  return (
    metadataString(event.metadata, 'draft_id') ||
    metadataString(event.metadata, 'external_id') ||
    metadataString(event.metadata, 'campaign_id') ||
    'unattributed'
  )
}

function channel(event: AcquisitionEventRow): string {
  return metadataString(event.metadata, 'channel') || 'unattributed'
}

function makeEmpty(id: string, channelName: string, campaign: string): AcquisitionRoiRow {
  return {
    id,
    channel: channelName,
    campaignId: campaign,
    publishedCount: 0,
    revenueCents: 0,
    spendCents: 0,
    profitCents: 0,
    roi: 0,
    recommendation: 'hold',
    recommendedBudgetEur: 0,
  }
}

function finalize(row: AcquisitionRoiRow): AcquisitionRoiRow {
  const profitCents = row.revenueCents - row.spendCents
  const roi = row.spendCents > 0 ? profitCents / row.spendCents : row.revenueCents > 0 ? 1 : 0
  const recommendation: AcquisitionRecommendation =
    row.revenueCents > 0 && roi >= 0.5
      ? 'scale'
      : row.spendCents > 0 && row.revenueCents === 0
        ? 'cut'
        : 'hold'
  const currentSpendEur = row.spendCents / 100
  const recommendedBudgetEur =
    recommendation === 'scale'
      ? Math.min(
          100,
          Math.max(15, currentSpendEur > 0 ? currentSpendEur * 1.5 : row.revenueCents / 100)
        )
      : 0

  return {
    ...row,
    profitCents,
    roi,
    recommendation,
    recommendedBudgetEur,
  }
}

export function buildAcquisitionRoi(events: AcquisitionEventRow[]): AcquisitionRoiSnapshot {
  const sorted = [...events].sort((a, b) => eventTime(a) - eventTime(b))
  const touches: CampaignTouch[] = []
  const campaigns = new Map<string, AcquisitionRoiRow>()

  function getCampaignRow(channelName: string, campaign: string): AcquisitionRoiRow {
    const id = `${channelName}:${campaign}`
    const existing = campaigns.get(id)
    if (existing) return existing
    const row = makeEmpty(id, channelName, campaign)
    campaigns.set(id, row)
    return row
  }

  for (const event of sorted) {
    const ventureId = event.venture_id ?? ''
    if (event.event_type === 'campaign_published') {
      const row = getCampaignRow(channel(event), campaignId(event))
      row.publishedCount += 1
      if (ventureId) {
        touches.push({
          ventureId,
          channel: row.channel,
          campaignId: row.campaignId,
          occurredAt: eventTime(event),
        })
      }
    }

    if (event.event_type === 'campaign_spend') {
      const row = getCampaignRow(channel(event), campaignId(event))
      row.spendCents += cents(event.value)
      if (
        ventureId &&
        !touches.some(
          (touch) => touch.ventureId === ventureId && touch.campaignId === row.campaignId
        )
      ) {
        touches.push({
          ventureId,
          channel: row.channel,
          campaignId: row.campaignId,
          occurredAt: eventTime(event),
        })
      }
    }

    if (event.event_type === 'payment_succeeded') {
      const paidAt = eventTime(event)
      const touch = [...touches]
        .filter((candidate) => candidate.ventureId === ventureId && candidate.occurredAt <= paidAt)
        .sort((a, b) => b.occurredAt - a.occurredAt)[0]
      const row = touch
        ? getCampaignRow(touch.channel, touch.campaignId)
        : getCampaignRow(channel(event), campaignId(event))
      row.revenueCents += cents(event.value)
    }
  }

  const campaignRows = [...campaigns.values()]
    .map(finalize)
    .sort((a, b) => b.profitCents - a.profitCents || b.revenueCents - a.revenueCents)

  const channels = new Map<string, AcquisitionRoiRow>()
  for (const row of campaignRows) {
    const existing = channels.get(row.channel) ?? makeEmpty(row.channel, row.channel, 'all')
    existing.publishedCount += row.publishedCount
    existing.revenueCents += row.revenueCents
    existing.spendCents += row.spendCents
    channels.set(row.channel, existing)
  }

  const channelRows = [...channels.values()]
    .map(finalize)
    .sort((a, b) => b.profitCents - a.profitCents || b.revenueCents - a.revenueCents)

  const revenueCents = campaignRows.reduce((sum, row) => sum + row.revenueCents, 0)
  const spendCents = campaignRows.reduce((sum, row) => sum + row.spendCents, 0)
  const profitCents = revenueCents - spendCents

  return {
    summary: {
      revenueCents,
      spendCents,
      profitCents,
      roi: spendCents > 0 ? profitCents / spendCents : 0,
      recommendedBudgetEur: channelRows.reduce((sum, row) => sum + row.recommendedBudgetEur, 0),
    },
    channels: channelRows,
    campaigns: campaignRows,
  }
}

function eur(centsValue: number): string {
  return (centsValue / 100).toFixed(2)
}

export function buildAcquisitionRoiContext(snapshot: AcquisitionRoiSnapshot): string {
  if (snapshot.channels.length === 0) return ''
  const lines = snapshot.channels
    .slice(0, 4)
    .map((row) =>
      [
        `- ${row.channel}: revenu ${eur(row.revenueCents)} EUR`,
        `spend ${eur(row.spendCents)} EUR`,
        `profit ${eur(row.profitCents)} EUR`,
        `ROI ${row.roi.toFixed(2)}`,
        `reco ${row.recommendation}`,
        row.recommendedBudgetEur > 0
          ? `budget ${row.recommendedBudgetEur.toFixed(0)} EUR`
          : 'budget 0 EUR',
      ].join(', ')
    )
  return ['ROI acquisition par canal/campagne :', ...lines].join('\n')
}
