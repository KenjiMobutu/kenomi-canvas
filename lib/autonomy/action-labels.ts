const ACTION_LABELS: Record<string, string> = {
  create_checkout: 'Create checkout',
  deploy: 'Deploy',
  publish_campaign: 'Publish campaign',
  record_tracking: 'Record tracking',
  run_agent: 'Run agent',
  scale_budget: 'Scale budget',
  send_follow_up: 'Send follow-up',
  send_outreach: 'Send outreach',
  stop_venture: 'Stop venture',
}

export function formatActionLabel(actionType?: string | null): string {
  if (!actionType) return 'Action inconnue'
  return ACTION_LABELS[actionType] ?? actionType.replaceAll('_', ' ')
}

export function isKnownActionType(actionType: string): boolean {
  return actionType in ACTION_LABELS
}
