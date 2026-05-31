export type HermesOperatorEffectKey = 'follow_up_scan' | 'prospect' | 'devops'

export function buildHermesOperatorEffectHref(effect: HermesOperatorEffectKey): string {
  switch (effect) {
    case 'follow_up_scan':
      return '/studio/prospects?status=follow_up_due'
    case 'devops':
      return '/studio/infrastructure'
    case 'prospect':
    default:
      return '/studio/prospects'
  }
}

export function buildHermesOperatorEffectLabel(effect: HermesOperatorEffectKey): string {
  switch (effect) {
    case 'follow_up_scan':
      return 'FU'
    case 'devops':
      return 'OPS'
    case 'prospect':
    default:
      return 'PRO'
  }
}
