import { buildProspectHref, buildSegmentPushHref, buildSourceFocusHref } from './prospect-filters'
import { buildRevenueHref } from './revenue-links'

type WeeklyReviewLinkKind =
  | 'best_source'
  | 'best_segment'
  | 'best_offer'
  | 'best_angle'
  | 'top_objection'
  | 'main_leak'
  | 'next_experiment'

export function buildWeeklyReviewHref(
  kind: WeeklyReviewLinkKind,
  input?: {
    source?: string | null
    band?: string | null
    stageKey?: string | null
    focus?: string | null
  }
) {
  if (kind === 'best_source') {
    return buildSourceFocusHref({ source: input?.source })
  }

  if (kind === 'best_segment') {
    return buildSegmentPushHref({ source: input?.source, band: input?.band })
  }

  if (kind === 'best_offer' || kind === 'best_angle') {
    return buildRevenueHref({ focus: 'cash_30d' })
  }

  if (kind === 'top_objection') {
    return buildProspectHref({ status: 'replied' })
  }

  if (kind === 'main_leak') {
    if (input?.stageKey === 'contact_to_reply') {
      return buildProspectHref({ status: 'sent' })
    }
    return buildProspectHref({ status: 'replied' })
  }

  if (kind === 'next_experiment') {
    if (input?.focus === 'segment') {
      return buildSegmentPushHref({ source: input?.source, band: input?.band })
    }
    if (input?.focus === 'source') {
      return buildSourceFocusHref({ source: input?.source })
    }
    return buildRevenueHref({ focus: 'cash_30d' })
  }

  return buildRevenueHref()
}
