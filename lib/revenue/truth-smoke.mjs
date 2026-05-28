function missing(count) {
  return !Number.isFinite(count) || count <= 0
}

export function evalRevenueTruthGate(input) {
  const failures = []

  if (!input.healthOk) failures.push('health_not_ok')
  if (!input.insightsProtected) failures.push('revenue_insights_not_protected')
  if (missing(input.prospectsWithOffer)) failures.push('offer_truth_missing')
  if (missing(input.conversationEvents)) failures.push('conversation_truth_missing')
  if (missing(input.offerTaggedProspects)) failures.push('offer_tagged_prospects_missing')
  if (missing(input.sourceTaggedProspects)) failures.push('source_truth_missing')
  if (missing(input.bandTaggedProspects)) failures.push('segment_truth_missing')
  if (missing(input.weeklyReviews)) failures.push('weekly_reviews_missing')

  return { ok: failures.length === 0, failures }
}
