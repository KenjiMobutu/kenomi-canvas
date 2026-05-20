export interface MarketingOutputShape {
  channels: string[]
  messages: string[]
  day1?: string
  day3?: string
  day7?: string
  assets?: MarketingAssetShape[]
}

export type MarketingAssetKind =
  | 'post'
  | 'thread'
  | 'newsletter'
  | 'seo_article'
  | 'short_video'
  | 'faceless_video'

export interface MarketingVideoBrief {
  hook?: string
  voiceover?: string
  scenes?: string[]
  captions?: string[]
  visual_prompt?: string
}

export interface MarketingAssetShape {
  channel: string
  asset_kind?: MarketingAssetKind
  format: string
  title: string
  body: string
  cta: string
  video?: MarketingVideoBrief
}

export interface DraftToCreate {
  user_id: string
  venture_id: string | null
  channel: string
  content: string
  status: 'draft'
  metadata: Record<string, unknown>
}

export function buildCampaignDrafts(input: {
  userId: string
  ventureId: string | null
  output: MarketingOutputShape
}): DraftToCreate[] {
  const richDrafts = buildAssetDrafts(input)
  if (richDrafts.length > 0) return richDrafts

  const { channels, messages } = input.output
  if (!channels?.length || !messages?.length) return []

  const drafts: DraftToCreate[] = []
  channels.forEach((rawChannel, channelIndex) => {
    const channel = rawChannel.trim()
    if (!channel) return
    messages.forEach((rawMessage, messageIndex) => {
      const content = rawMessage.trim()
      if (!content) return
      drafts.push({
        user_id: input.userId,
        venture_id: input.ventureId,
        channel,
        content,
        status: 'draft',
        metadata: {
          channel_index: channelIndex,
          message_index: messageIndex,
        },
      })
    })
  })
  return drafts
}

function cleanText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function buildAssetDrafts(input: {
  userId: string
  ventureId: string | null
  output: MarketingOutputShape
}): DraftToCreate[] {
  const assets = input.output.assets ?? []
  if (!assets.length) return []

  return assets.flatMap((asset, assetIndex) => {
    const channel = cleanText(asset.channel)
    const content = cleanText(asset.body)
    if (!channel || !content) return []

    const metadata: Record<string, unknown> = {
      asset_index: assetIndex,
      asset_kind: cleanText(asset.asset_kind) || 'post',
      format: cleanText(asset.format),
      title: cleanText(asset.title),
      cta: cleanText(asset.cta),
      body: content,
    }

    if (asset.video && Object.keys(asset.video).length > 0) {
      metadata.video = asset.video
    }

    return [
      {
        user_id: input.userId,
        venture_id: input.ventureId,
        channel,
        content,
        status: 'draft' as const,
        metadata,
      },
    ]
  })
}
