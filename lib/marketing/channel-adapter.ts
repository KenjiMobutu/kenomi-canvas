export type MarketingChannelId =
  | 'linkedin'
  | 'tiktok'
  | 'instagram'
  | 'youtube'
  | 'reddit'
  | 'seo'
  | 'newsletter'

export interface AdaptableDraft {
  id: string
  channel: string
  content: string
  metadata: Record<string, unknown>
}

export interface AdaptedDraft {
  channel: MarketingChannelId
  content: string
  metadata: Record<string, unknown>
}

const CHANNEL_FORMATS: Record<
  MarketingChannelId,
  { format: string; assetKind: string; prefix: string; ctaLabel: string }
> = {
  linkedin: {
    format: 'LinkedIn post + carousel angle',
    assetKind: 'post',
    prefix: 'Angle LinkedIn',
    ctaLabel: 'CTA commentaire',
  },
  tiktok: {
    format: '9:16 short 30-45s',
    assetKind: 'faceless_video',
    prefix: 'Script TikTok faceless',
    ctaLabel: 'CTA écran final',
  },
  instagram: {
    format: 'Instagram Reel 30s + caption',
    assetKind: 'faceless_video',
    prefix: 'Script Instagram Reel',
    ctaLabel: 'CTA bio/link sticker',
  },
  youtube: {
    format: 'YouTube Shorts 45-60s',
    assetKind: 'faceless_video',
    prefix: 'Script YouTube Shorts',
    ctaLabel: 'CTA description',
  },
  reddit: {
    format: 'Reddit problem/solution post',
    assetKind: 'post',
    prefix: 'Angle Reddit',
    ctaLabel: 'CTA soft',
  },
  seo: {
    format: 'SEO article outline',
    assetKind: 'seo_article',
    prefix: 'Brief SEO',
    ctaLabel: 'CTA landing',
  },
  newsletter: {
    format: 'Newsletter/email launch',
    assetKind: 'newsletter',
    prefix: 'Email newsletter',
    ctaLabel: 'CTA email',
  },
}

export function adaptDraftToChannel(
  draft: AdaptableDraft,
  targetChannel: MarketingChannelId
): AdaptedDraft {
  const target = CHANNEL_FORMATS[targetChannel]
  const title = cleanText(draft.metadata.title, firstSentence(draft.content))
  const cta = cleanText(draft.metadata.cta, 'Découvrir l’offre')
  const sourceChannel = cleanText(draft.channel, 'unknown')
  const normalizedSource = normalizeBody(draft.content)

  const video =
    target.assetKind === 'faceless_video'
      ? {
          hook: title,
          voiceover: `${title}. ${normalizedSource}`,
          scenes: [
            'Montrer la douleur avec texte à l’écran',
            'Montrer le workflow produit en interface',
            'Afficher la preuve/CTA vers landing ou checkout',
          ],
          captions: [title, cta],
          visual_prompt: `${title}. Fast-paced SaaS product visuals, kinetic text overlays, no human face.`,
        }
      : undefined

  return {
    channel: targetChannel,
    content: buildAdaptedContent({ title, body: normalizedSource, cta, target }),
    metadata: {
      ...draft.metadata,
      title,
      cta,
      body: normalizedSource,
      format: target.format,
      asset_kind: target.assetKind,
      source_channel: sourceChannel,
      adapted_to_channel: targetChannel,
      adapted_from_draft_id: draft.id,
      ...(video ? { video } : {}),
    },
  }
}

function cleanText(value: unknown, fallback: string) {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback
}

function firstSentence(content: string) {
  const clean = normalizeBody(content)
  return clean.split(/[.!?]/)[0]?.trim() || 'Nouvel angle marketing'
}

function normalizeBody(content: string) {
  return content.replace(/\s+/g, ' ').trim()
}

function buildAdaptedContent(input: {
  title: string
  body: string
  cta: string
  target: { prefix: string; ctaLabel: string; assetKind: string }
}) {
  if (input.target.assetKind === 'faceless_video') {
    return [
      `Hook: ${input.title}`,
      `Voiceover: ${input.body}`,
      `Plan: douleur -> produit -> preuve -> ${input.cta}`,
      `${input.target.ctaLabel}: ${input.cta}`,
    ].join('\n')
  }

  return [
    `${input.target.prefix}: ${input.title}`,
    '',
    input.body,
    '',
    `${input.target.ctaLabel}: ${input.cta}`,
  ].join('\n')
}
