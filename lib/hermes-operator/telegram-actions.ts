import type { TelegramCommandKind } from './telegram-types'

type TelegramOperatorExecution =
  | {
      actionType: 'run_agent'
      recommendationKind: 'run_prospect' | 'run_devops'
      deepLink: '/studio/prospects' | '/studio/infrastructure'
      successSummary: string
      payload: {
        agentId: 'prospect' | 'devops'
      }
    }
  | {
      actionType: 'follow_up_scan'
      recommendationKind: 'run_follow_up_scan'
      deepLink: '/studio/prospects?status=follow_up_due'
      successSummary: string
      payload: {}
    }

function isTelegramOperatorActionKind(
  kind: TelegramCommandKind
): kind is 'run_prospect' | 'run_devops' | 'scan_followups' {
  return kind === 'run_prospect' || kind === 'run_devops' || kind === 'scan_followups'
}

export function mapTelegramActionToOperatorExecution(
  kind: TelegramCommandKind
): TelegramOperatorExecution | null {
  if (!isTelegramOperatorActionKind(kind)) return null

  switch (kind) {
    case 'run_prospect':
      return {
        actionType: 'run_agent',
        recommendationKind: 'run_prospect',
        deepLink: '/studio/prospects',
        successSummary: 'Prospect run launched.',
        payload: { agentId: 'prospect' },
      }
    case 'run_devops':
      return {
        actionType: 'run_agent',
        recommendationKind: 'run_devops',
        deepLink: '/studio/infrastructure',
        successSummary: 'DevOps run launched.',
        payload: { agentId: 'devops' },
      }
    case 'scan_followups':
      return {
        actionType: 'follow_up_scan',
        recommendationKind: 'run_follow_up_scan',
        deepLink: '/studio/prospects?status=follow_up_due',
        successSummary: 'Follow-up scan launched.',
        payload: {},
      }
  }
}
