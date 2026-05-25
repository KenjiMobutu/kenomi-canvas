import type {
  ProspectBand,
  ProspectFit,
  ProspectScoreInput,
  ProspectScoreResult,
  ProspectSource,
  ProspectUrgency,
} from './types'

const FIT_BONUS: Record<ProspectFit, number> = {
  low: 5,
  medium: 20,
  high: 35,
}

const URGENCY_BONUS: Record<ProspectUrgency, number> = {
  low: 5,
  medium: 20,
  high: 35,
}

const SOURCE_BONUS: Record<ProspectSource, number> = {
  linkedin: 10,
  malt: 15,
  upwork: 20,
  indeed: 8,
  reddit: 5,
  other: 0,
}

function clampScore(score: number): number {
  return Math.max(0, Math.min(100, score))
}

function bandFromScore(score: number): ProspectBand {
  if (score >= 80) return 'hot'
  if (score >= 55) return 'warm'
  return 'cold'
}

export function scoreProspect(input: ProspectScoreInput): ProspectScoreResult {
  const signals = input.signals.filter((signal) => signal.trim().length > 0)
  const reasons = [
    `${input.companyName} sourced from ${input.source}`,
    `${input.fit} fit`,
    `${input.urgency} urgency`,
    `${signals.length} signal${signals.length === 1 ? '' : 's'}`,
  ]

  const score = clampScore(
    SOURCE_BONUS[input.source] +
      FIT_BONUS[input.fit] +
      URGENCY_BONUS[input.urgency] +
      Math.min(signals.length * 5, 20)
  )

  return {
    score,
    band: bandFromScore(score),
    reasons,
  }
}
