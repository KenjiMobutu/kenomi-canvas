import { makeSourceStatus, type SourceStatus } from './source-status'
import { buildOpsActionIntent, type OpsActionIntent } from './action-intents'

export type StudioOpsMode = 'calm' | 'attention'

export interface StudioOpsCard {
  label: string
  value: string
  tone: 'ok' | 'warn' | 'muted'
  source: SourceStatus
}

export interface StudioOpsAction {
  id: string
  label: string
  detail: string
  href: string
  tone: 'ok' | 'warn' | 'muted'
  intent: OpsActionIntent
}

export interface StudioOpsSummary {
  mode: StudioOpsMode
  primaryRepairHref: string
  cards: StudioOpsCard[]
  actions: StudioOpsAction[]
}

export function buildStudioOpsSummary(input: {
  agentRunCount: number
  automationRunCount: number
  pendingApprovalCount: number
  failedAutomationRunCount: number
  staleServiceCount: number
  latestAgentRunAt: string | null
  latestAutomationRunAt: string | null
  now?: Date
}): StudioOpsSummary {
  const mode: StudioOpsMode =
    input.pendingApprovalCount > 0 ||
    input.failedAutomationRunCount > 0 ||
    input.staleServiceCount > 0
      ? 'attention'
      : 'calm'
  const now = input.now ?? new Date()
  const actions: StudioOpsAction[] = []

  if (input.pendingApprovalCount > 0) {
    actions.push({
      id: 'review-approvals',
      label: 'Valider les approvals',
      detail: `${input.pendingApprovalCount} gate${input.pendingApprovalCount > 1 ? 's' : ''} humain${input.pendingApprovalCount > 1 ? 's' : ''} en attente.`,
      href: '/studio/agents',
      tone: 'warn',
      intent: buildOpsActionIntent('review-approvals'),
    })
  }
  if (input.failedAutomationRunCount > 0) {
    actions.push({
      id: 'inspect-automation-failures',
      label: 'Inspecter les automations',
      detail: `${input.failedAutomationRunCount} run${input.failedAutomationRunCount > 1 ? 's' : ''} automation en erreur.`,
      href: '/studio/automations',
      tone: 'warn',
      intent: buildOpsActionIntent('inspect-automation-failures'),
    })
  }
  if (input.staleServiceCount > 0) {
    actions.push({
      id: 'repair-infrastructure',
      label: 'Réparer infrastructure',
      detail: `${input.staleServiceCount} service${input.staleServiceCount > 1 ? 's' : ''} à vérifier.`,
      href: '/studio/infrastructure',
      tone: 'warn',
      intent: buildOpsActionIntent('repair-infrastructure'),
    })
  }
  if (input.agentRunCount === 0) {
    actions.push({
      id: 'run-first-agent',
      label: 'Lancer un agent',
      detail: 'Aucun run agent réel enregistré pour ce compte.',
      href: '/studio/agents',
      tone: 'muted',
      intent: buildOpsActionIntent('run-first-agent'),
    })
  }
  if (input.automationRunCount === 0) {
    actions.push({
      id: 'trigger-first-automation',
      label: 'Déclencher un workflow',
      detail: 'Aucun run automation réel enregistré pour ce compte.',
      href: '/studio/automations',
      tone: 'muted',
      intent: buildOpsActionIntent('trigger-first-automation'),
    })
  }
  if (actions.length === 0) {
    actions.push({
      id: 'verify-sources',
      label: 'Vérifier les sources',
      detail: 'Les sources critiques répondent. Ouvrir le cockpit pour inspection.',
      href: '/studio',
      tone: 'ok',
      intent: buildOpsActionIntent('verify-sources'),
    })
  }

  return {
    mode,
    primaryRepairHref:
      input.pendingApprovalCount > 0
        ? '/studio/agents'
        : input.failedAutomationRunCount > 0
          ? '/studio/automations'
          : input.staleServiceCount > 0
            ? '/studio/infrastructure'
            : '/studio',
    actions,
    cards: [
      {
        label: 'Agents',
        value: String(input.agentRunCount),
        tone: input.agentRunCount > 0 ? 'ok' : 'muted',
        source: makeSourceStatus({
          source: 'agent_runs',
          checkedAt: input.latestAgentRunAt,
          repairHref: '/studio/agents',
          emptyLabel: 'Aucun run agent enregistré',
          now,
        }),
      },
      {
        label: 'Automations',
        value: String(input.automationRunCount),
        tone:
          input.failedAutomationRunCount > 0
            ? 'warn'
            : input.automationRunCount > 0
              ? 'ok'
              : 'muted',
        source: makeSourceStatus({
          source: 'automation_runs',
          checkedAt: input.latestAutomationRunAt,
          repairHref: '/studio/automations',
          emptyLabel: 'Aucun run automation enregistré',
          now,
        }),
      },
      {
        label: 'Approvals',
        value: String(input.pendingApprovalCount),
        tone: input.pendingApprovalCount > 0 ? 'warn' : 'ok',
        source: makeSourceStatus({
          source: 'human_approvals',
          checkedAt: now.toISOString(),
          repairHref: '/studio/agents',
          emptyLabel: 'Aucun gate en attente',
          now,
        }),
      },
      {
        label: 'Infrastructure',
        value: String(input.staleServiceCount),
        tone: input.staleServiceCount > 0 ? 'warn' : 'ok',
        source: makeSourceStatus({
          source: 'services_health',
          checkedAt: now.toISOString(),
          repairHref: '/studio/infrastructure',
          emptyLabel: 'Tous les checks infra répondent',
          now,
        }),
      },
    ],
  }
}
