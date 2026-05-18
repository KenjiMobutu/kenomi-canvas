export interface VentureMetricEvent {
  event_type: string
  value: number | null
}

export interface VentureMetricSourceRow extends VentureMetricEvent {
  venture_id: string | null
}

export interface VentureMetrics {
  visits: number
  signups: number
  signupRate: number
  revenueCents: number
  spendCents: number
  profitCents: number
  roi: number
}

export interface VentureMetricSnapshot {
  ventureId: string
  name: string
  slug: string
  metrics: VentureMetrics
}

interface VentureMetricVenture {
  id: string
  name: string | null
  slug: string | null
}

function sumValues(events: VentureMetricEvent[], eventTypes: string[]): number {
  return events
    .filter((event) => eventTypes.includes(event.event_type))
    .reduce((sum, event) => sum + (typeof event.value === 'number' ? event.value : 0), 0)
}

export function aggregateVentureMetrics(events: VentureMetricEvent[]): VentureMetrics {
  const visits = events.filter((event) => event.event_type === 'page_view').length
  const signups = events.filter((event) => event.event_type === 'waitlist_signup').length
  const revenueCents = sumValues(events, ['payment_succeeded'])
  const spendCents = sumValues(events, ['campaign_spend'])
  const profitCents = revenueCents - spendCents

  return {
    visits,
    signups,
    signupRate: visits > 0 ? signups / visits : 0,
    revenueCents,
    spendCents,
    profitCents,
    roi: spendCents > 0 ? profitCents / spendCents : 0,
  }
}

export function buildVentureMetricSnapshots(
  ventures: VentureMetricVenture[],
  events: VentureMetricSourceRow[]
): VentureMetricSnapshot[] {
  return ventures.map((venture) => ({
    ventureId: venture.id,
    name: venture.name ?? 'Untitled venture',
    slug: venture.slug ?? '',
    metrics: aggregateVentureMetrics(events.filter((event) => event.venture_id === venture.id)),
  }))
}

function centsToEur(cents: number): string {
  return (cents / 100).toFixed(2)
}

export function buildDecisionMetricsContext(metrics: VentureMetrics): string {
  return [
    'Métriques business réelles :',
    `- Visites : ${metrics.visits}`,
    `- Signups : ${metrics.signups}`,
    `- Taux signup : ${(metrics.signupRate * 100).toFixed(1)}%`,
    `- Revenu : ${centsToEur(metrics.revenueCents)} EUR`,
    `- Coûts : ${centsToEur(metrics.spendCents)} EUR`,
    `- Profit : ${centsToEur(metrics.profitCents)} EUR`,
    `- ROI : ${metrics.roi.toFixed(2)}`,
  ].join('\n')
}
