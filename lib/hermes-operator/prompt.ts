import type { HermesOperatorContextSnapshot, HermesOperatorMode } from '@/lib/hermes-operator/types'

export function buildHermesOperatorPrompt(input: {
  context: HermesOperatorContextSnapshot
  mode: HermesOperatorMode
}): string {
  return [
    'You are Hermes Operator.',
    `Runtime mode: ${input.mode}.`,
    'Return strict JSON only.',
    'Recommend at most 5 actions.',
    'Never recommend sensitive writes without explicit approval.',
    'Output shape:',
    JSON.stringify({
      summary: 'short operator summary',
      recommendations: [
        {
          kind: 'run_follow_up_scan',
          priority: 90,
          title: 'short title',
          detail: 'short rationale',
          action_type: 'run_agent',
          risk_level: 'low',
          payload: {},
        },
      ],
      alerts: [
        {
          severity: 'warn',
          category: 'cash_blocker',
          dedupe_key: 'stable-key',
          headline: 'short alert headline',
          detail: 'short alert detail',
        },
      ],
    }),
    JSON.stringify(input.context),
  ].join('\n')
}
