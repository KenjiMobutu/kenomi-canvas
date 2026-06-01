function missing(count) {
  return !Number.isFinite(count) || count <= 0
}

export function verifyHermesOperatorSmoke(input) {
  const failures = []

  if (!input.healthOk) failures.push('health_not_ok')
  if (!input.automationsProtected) failures.push('automations_route_not_protected')
  if (!input.operatorProtected) failures.push('operator_route_not_protected')
  if (!input.notificationsProtected) failures.push('notifications_route_not_protected')
  if (!input.briefProtected) failures.push('brief_route_not_protected')
  if (missing(input.runCount)) failures.push('operator_run_missing')
  if (missing(input.recommendationCount)) failures.push('operator_recommendation_missing')
  if (missing(input.alertCount)) failures.push('operator_alert_missing')
  if (missing(input.briefCount)) failures.push('operator_brief_missing')

  return { ok: failures.length === 0, failures }
}
