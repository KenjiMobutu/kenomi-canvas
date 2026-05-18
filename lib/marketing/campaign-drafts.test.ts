import { describe, it, expect } from 'vitest'
import { buildCampaignDrafts } from './campaign-drafts'

describe('buildCampaignDrafts', () => {
  it('crée un draft par channel × message', () => {
    const drafts = buildCampaignDrafts({
      userId: 'u1',
      ventureId: 'v1',
      output: {
        channels: ['email', 'twitter'],
        messages: ['Launch!', 'Try it free'],
      },
    })
    expect(drafts).toHaveLength(4)
    expect(drafts[0]).toMatchObject({
      user_id: 'u1',
      venture_id: 'v1',
      channel: 'email',
      content: 'Launch!',
      status: 'draft',
    })
    expect(drafts[3]).toMatchObject({
      channel: 'twitter',
      content: 'Try it free',
    })
  })

  it('retourne [] si channels ou messages vide', () => {
    expect(
      buildCampaignDrafts({
        userId: 'u1',
        ventureId: 'v1',
        output: { channels: [], messages: ['Hi'] },
      })
    ).toEqual([])
    expect(
      buildCampaignDrafts({
        userId: 'u1',
        ventureId: 'v1',
        output: { channels: ['email'], messages: [] },
      })
    ).toEqual([])
  })

  it('ignore channels et messages vides ou whitespace-only', () => {
    const drafts = buildCampaignDrafts({
      userId: 'u1',
      ventureId: 'v1',
      output: {
        channels: ['email', '   ', 'twitter'],
        messages: ['Go', '', 'Buy'],
      },
    })
    expect(drafts).toHaveLength(4)
    expect(drafts.every((d) => d.channel.trim().length > 0)).toBe(true)
    expect(drafts.every((d) => d.content.trim().length > 0)).toBe(true)
  })

  it('expose channel_index et message_index dans metadata', () => {
    const drafts = buildCampaignDrafts({
      userId: 'u1',
      ventureId: 'v1',
      output: { channels: ['email'], messages: ['m1', 'm2'] },
    })
    expect(drafts[0].metadata).toMatchObject({ channel_index: 0, message_index: 0 })
    expect(drafts[1].metadata).toMatchObject({ channel_index: 0, message_index: 1 })
  })

  it('accepte ventureId null', () => {
    const drafts = buildCampaignDrafts({
      userId: 'u1',
      ventureId: null,
      output: { channels: ['email'], messages: ['Hi'] },
    })
    expect(drafts[0].venture_id).toBeNull()
  })
})
