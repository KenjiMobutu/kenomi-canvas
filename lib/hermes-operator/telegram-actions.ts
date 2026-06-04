import type { TelegramCommandKind } from './telegram-types'

type TelegramOperatorExecution =
  | {
      actionType: 'run_agent'
      payload: {
        agentId: 'prospect' | 'devops'
      }
    }
  | {
      actionType: 'follow_up_scan'
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
      return { actionType: 'run_agent', payload: { agentId: 'prospect' } }
    case 'run_devops':
      return { actionType: 'run_agent', payload: { agentId: 'devops' } }
    case 'scan_followups':
      return { actionType: 'follow_up_scan', payload: {} }
  }
}
