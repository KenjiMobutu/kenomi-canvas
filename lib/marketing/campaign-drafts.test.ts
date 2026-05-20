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

  it('crée un draft structuré par asset marketing avec brief vidéo faceless', () => {
    const drafts = buildCampaignDrafts({
      userId: 'u1',
      ventureId: 'v1',
      output: {
        channels: ['linkedin', 'tiktok'],
        messages: ['fallback'],
        assets: [
          {
            channel: 'linkedin',
            asset_kind: 'post',
            format: 'carousel 5 slides',
            title: 'Stop losing founder notes',
            body: 'Centralise les notes clients et transforme-les en actions.',
            cta: 'Rejoindre la waitlist',
          },
          {
            channel: 'tiktok',
            asset_kind: 'faceless_video',
            format: '9:16 short 35s',
            title: 'Le chaos des notes founder',
            body: 'Un angle vidéo pour vendre la douleur sans visage.',
            cta: 'Essayer NoteFast',
            video: {
              hook: 'Tu perds déjà des revenus dans tes notes.',
              voiceover: 'Chaque meeting crée des actions que personne ne suit.',
              scenes: ['Inbox saturée', 'Synthèse IA', 'CTA checkout'],
              captions: ['Trop de notes', 'Une action claire', 'Teste maintenant'],
              visual_prompt: 'Clean SaaS dashboard, fast cuts, no human face',
            },
          },
        ],
      },
    })

    expect(drafts).toHaveLength(2)
    expect(drafts[0]).toMatchObject({
      channel: 'linkedin',
      content: 'Centralise les notes clients et transforme-les en actions.',
      metadata: {
        asset_kind: 'post',
        format: 'carousel 5 slides',
        title: 'Stop losing founder notes',
        cta: 'Rejoindre la waitlist',
        asset_index: 0,
      },
    })
    expect(drafts[1]).toMatchObject({
      channel: 'tiktok',
      content: 'Un angle vidéo pour vendre la douleur sans visage.',
      metadata: {
        asset_kind: 'faceless_video',
        format: '9:16 short 35s',
        title: 'Le chaos des notes founder',
        cta: 'Essayer NoteFast',
        video: {
          hook: 'Tu perds déjà des revenus dans tes notes.',
          scenes: ['Inbox saturée', 'Synthèse IA', 'CTA checkout'],
        },
      },
    })
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
