export function buildDiagnosticCashLaneSummary(input: {
  laneContactable: number
  laneAwaitingApproval: number
  laneFollowUpDue: number
  paidCount: number
  paidCashEur: number
}) {
  return {
    title: '300EUR diagnostic',
    subtitle: 'Freelancers / Small Agencies',
    primaryMetric: `${input.paidCashEur}EUR paid · ${input.paidCount} paid`,
    blockers: `${input.laneAwaitingApproval} approvals · ${input.laneFollowUpDue} follow-ups`,
    queue: `${input.laneContactable} contactable in active lane`,
    cta: 'Book diagnostic call',
  }
}
