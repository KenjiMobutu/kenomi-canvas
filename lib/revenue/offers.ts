export type OfferRow = {
  id: string
  name: string
  category?: string | null
  target_icp?: string | null
}

export type OfferProspectRow = {
  offer_id?: string | null
  pipeline_status?: string | null
}

export type OfferSnapshot = {
  id: string
  name: string
  category: string | null
  targetIcp: string | null
  totalProspects: number
  repliedProspects: number
  wonProspects: number
}

export function normalizeOfferText(value: string | null | undefined) {
  const normalized = value?.trim() ?? ''
  return normalized.length > 0 ? normalized : null
}

export function buildOfferSnapshots(input: {
  offers: OfferRow[]
  prospects: OfferProspectRow[]
}): OfferSnapshot[] {
  const counters = new Map<
    string,
    {
      totalProspects: number
      repliedProspects: number
      wonProspects: number
    }
  >()

  for (const prospect of input.prospects) {
    const offerId = normalizeOfferText(prospect.offer_id)
    if (!offerId) continue
    const counter = counters.get(offerId) ?? {
      totalProspects: 0,
      repliedProspects: 0,
      wonProspects: 0,
    }
    counter.totalProspects += 1
    if (prospect.pipeline_status === 'replied') counter.repliedProspects += 1
    if (prospect.pipeline_status === 'won') counter.wonProspects += 1
    counters.set(offerId, counter)
  }

  return input.offers
    .map((offer) => {
      const counts = counters.get(offer.id) ?? {
        totalProspects: 0,
        repliedProspects: 0,
        wonProspects: 0,
      }
      return {
        id: offer.id,
        name: offer.name,
        category: normalizeOfferText(offer.category),
        targetIcp: normalizeOfferText(offer.target_icp),
        ...counts,
      }
    })
    .sort(
      (left, right) =>
        right.wonProspects - left.wonProspects ||
        right.repliedProspects - left.repliedProspects ||
        right.totalProspects - left.totalProspects ||
        left.name.localeCompare(right.name)
    )
}
