export interface MarketingOutputShape {
  channels: string[]
  messages: string[]
  day1?: string
  day3?: string
  day7?: string
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
