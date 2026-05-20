import { describe, expect, it } from 'vitest'
import { adaptDraftToChannel } from './channel-adapter'

describe('adaptDraftToChannel', () => {
  const draft = {
    id: 'draft-1',
    channel: 'reddit',
    content:
      'I built a simple tool that turns messy founder meeting notes into follow-up actions and Stripe-ready tasks.',
    metadata: {
      title: 'Founders lose revenue in meeting notes',
      cta: 'Join the waitlist',
      format: 'reddit post',
      asset_kind: 'post',
    },
  }

  it('adapte un draft Reddit au format LinkedIn', () => {
    const adapted = adaptDraftToChannel(draft, 'linkedin')

    expect(adapted.channel).toBe('linkedin')
    expect(adapted.content).toContain('Founders lose revenue in meeting notes')
    expect(adapted.metadata).toMatchObject({
      format: 'LinkedIn post + carousel angle',
      asset_kind: 'post',
      source_channel: 'reddit',
      adapted_to_channel: 'linkedin',
      cta: 'Join the waitlist',
    })
  })

  it('adapte un draft LinkedIn au format TikTok faceless', () => {
    const adapted = adaptDraftToChannel({ ...draft, channel: 'linkedin' }, 'tiktok')

    expect(adapted.channel).toBe('tiktok')
    expect(adapted.metadata).toMatchObject({
      format: '9:16 short 30-45s',
      asset_kind: 'faceless_video',
      source_channel: 'linkedin',
      adapted_to_channel: 'tiktok',
    })
    expect(adapted.metadata.video).toMatchObject({
      hook: 'Founders lose revenue in meeting notes',
    })
    expect(adapted.content).toContain('Hook:')
  })

  it('adapte un draft au format YouTube Shorts avec script vidéo', () => {
    const adapted = adaptDraftToChannel(draft, 'youtube')

    expect(adapted.channel).toBe('youtube')
    expect(adapted.metadata).toMatchObject({
      format: 'YouTube Shorts 45-60s',
      asset_kind: 'faceless_video',
    })
    expect(adapted.metadata.video).toMatchObject({
      visual_prompt: expect.stringContaining('no human face'),
    })
  })
})
