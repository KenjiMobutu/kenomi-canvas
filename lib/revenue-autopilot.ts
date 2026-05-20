import type { RevenueLoopItem, RevenueLoopNextAction, RevenueLoopSnapshot } from './revenue-loop'
import type { AutonomyEnvironment, AutonomyRiskLevel } from './autonomy/types'
import type { RevenueRoiDecision } from './revenue-proof'

export type RevenueAutopilotExecution = 'auto' | 'approval' | 'hold'
export type RevenueAutopilotMode = 'execute' | 'approval_required' | 'hold'

export type RevenueAutopilotStepKind =
  | 'run_agent'
  | 'create_checkout'
  | 'publish_campaign'
  | 'scale_budget'
  | 'stop_venture'
  | 'monitor'

export interface RevenueAutopilotStep {
  kind: RevenueAutopilotStepKind
  execution: RevenueAutopilotExecution
  risk: AutonomyRiskLevel
  ventureId?: string | null
  pipelineId?: string | null
  agentId?: string
  approvalActionType?: string
  label: string
  reason: string
  blockedRevenueEur: number
  recommendedBudgetEur?: number
}

export interface RevenueAutopilotPlan {
  mode: RevenueAutopilotMode
  generatedAt: string
  revenueEur: number
  blockedRevenueEur: number
  steps: RevenueAutopilotStep[]
}

export interface BuildRevenueAutopilotPlanInput {
  snapshot: RevenueLoopSnapshot
  environment: AutonomyEnvironment
  now?: Date
  staleNoRevenueDays?: number
  maxSteps?: number
}

export interface RevenueAutopilotExistingAction {
  action_type?: string | null
  venture_id?: string | null
  status?: string | null
  input?: Record<string, unknown> | null
  created_at?: string | null
}

export interface FilterDuplicateDailyAutopilotStepsInput {
  plan: RevenueAutopilotPlan
  actions: RevenueAutopilotExistingAction[]
  now?: Date
}

export function stepFromRoiDecision(input: {
  roiDecision: RevenueRoiDecision
  ventureId: string | null
  recommendedBudgetEur?: number
}): RevenueAutopilotStep | null {
  if (!input.ventureId) return null

  if (input.roiDecision.decision === 'scale') {
    return {
      kind: 'scale_budget',
      execution: 'approval',
      risk: 'high',
      ventureId: input.ventureId,
      label: 'Approuver scale budget ROI',
      reason: input.roiDecision.reason,
      blockedRevenueEur: 0,
      recommendedBudgetEur: Math.max(1, input.recommendedBudgetEur ?? 25),
    }
  }

  if (input.roiDecision.decision === 'cut') {
    return {
      kind: 'stop_venture',
      execution: 'approval',
      risk: 'high',
      ventureId: input.ventureId,
      label: 'Approuver arrêt venture ROI',
      reason: input.roiDecision.reason,
      blockedRevenueEur: 0,
    }
  }

  return null
}

function daysSince(value: string | null | undefined, now: Date): number {
  const ms = Date.parse(value ?? '')
  if (!Number.isFinite(ms)) return 0
  return Math.max(0, Math.floor((now.getTime() - ms) / 86_400_000))
}

function stageDone(loop: RevenueLoopItem, key: string): boolean {
  return loop.stages.some((stage) => stage.key === key && stage.status === 'done')
}

function findLoopForRecommended(snapshot: RevenueLoopSnapshot): RevenueLoopItem | null {
  const loopId = snapshot.summary.recommendedAction?.loopId
  if (!loopId) return snapshot.loops[0] ?? null
  return snapshot.loops.find((loop) => loop.id === loopId) ?? snapshot.loops[0] ?? null
}

function stepFromNextAction(input: {
  action: RevenueLoopNextAction
  loop?: RevenueLoopItem | null
  environment: AutonomyEnvironment
}): RevenueAutopilotStep {
  const { action, loop } = input
  const reason =
    loop?.priorityReason ??
    ('reason' in action && typeof action.reason === 'string' ? action.reason : 'Priorité revenue')
  const blockedRevenueEur =
    loop?.blockedRevenueEur ??
    ('blockedRevenueEur' in action && typeof action.blockedRevenueEur === 'number'
      ? action.blockedRevenueEur
      : 0)
  if (action.type === 'run_agent') {
    return {
      kind: 'run_agent',
      execution: 'auto',
      risk: 'low',
      ventureId: action.ventureId,
      agentId: action.agentId,
      label: action.label,
      reason,
      blockedRevenueEur,
    }
  }

  if (action.type === 'create_checkout') {
    return {
      kind: 'monitor',
      execution: 'hold',
      risk: 'low',
      ventureId: action.ventureId,
      pipelineId: action.pipelineId,
      label: action.label,
      reason: 'Paiement client uniquement sur landing publique',
      blockedRevenueEur,
    }
  }

  if (action.type === 'configure_stripe') {
    return {
      kind: 'monitor',
      execution: 'hold',
      risk: 'low',
      ventureId: action.ventureId,
      pipelineId: action.pipelineId,
      label: action.label,
      reason: action.reason,
      blockedRevenueEur,
    }
  }

  if (action.type === 'resolve_approval') {
    return {
      kind:
        action.actionType === 'publish_campaign'
          ? 'publish_campaign'
          : action.actionType === 'scale_budget'
            ? 'scale_budget'
            : action.actionType === 'stop_venture'
              ? 'stop_venture'
              : 'create_checkout',
      execution: 'approval',
      risk: action.actionType === 'create_checkout' ? 'medium' : 'high',
      ventureId: action.ventureId,
      approvalActionType: action.actionType,
      label: action.label,
      reason: action.reason ?? 'Approval humaine requise',
      blockedRevenueEur,
    }
  }

  return {
    kind: 'monitor',
    execution: 'hold',
    risk: 'low',
    ventureId: action.ventureId,
    label: action.label,
    reason,
    blockedRevenueEur,
  }
}

function hardBusinessStep(input: {
  snapshot: RevenueLoopSnapshot
  now: Date
  staleNoRevenueDays: number
}): RevenueAutopilotStep | null {
  const winner = input.snapshot.loops.find((loop) => loop.revenueEur > 0 && loop.paidPayments > 0)
  if (winner?.ventureId) {
    const recommendedBudgetEur = Math.min(250, Math.max(25, Math.round(winner.revenueEur * 0.3)))
    return {
      kind: 'scale_budget',
      execution: 'approval',
      risk: 'high',
      ventureId: winner.ventureId,
      pipelineId: winner.pipelineId,
      label: 'Proposer scale budget',
      reason: `${winner.ventureName} encaisse déjà ${winner.revenueEur} EUR sur ${winner.paidPayments} paiements.`,
      blockedRevenueEur: 0,
      recommendedBudgetEur,
    }
  }

  const stale = input.snapshot.loops.find((loop) => {
    if (!loop.ventureId || loop.revenueEur > 0) return false
    if (!stageDone(loop, 'checkout') || !stageDone(loop, 'marketing')) return false
    return daysSince(loop.updatedAt, input.now) >= input.staleNoRevenueDays
  })

  if (stale?.ventureId) {
    const age = daysSince(stale.updatedAt, input.now)
    return {
      kind: 'stop_venture',
      execution: 'approval',
      risk: 'high',
      ventureId: stale.ventureId,
      pipelineId: stale.pipelineId,
      label: 'Proposer arrêt venture',
      reason: `${stale.ventureName} a ${age} jours de funnel actif sans revenu.`,
      blockedRevenueEur: 0,
    }
  }

  return null
}

export function buildRevenueAutopilotPlan(
  input: BuildRevenueAutopilotPlanInput
): RevenueAutopilotPlan {
  const now = input.now ?? new Date()
  const staleNoRevenueDays = input.staleNoRevenueDays ?? 7
  const hardStep = hardBusinessStep({ snapshot: input.snapshot, now, staleNoRevenueDays })
  const loop = findLoopForRecommended(input.snapshot)
  const recommendedStep = input.snapshot.summary.recommendedAction
    ? stepFromNextAction({
        action: input.snapshot.summary.recommendedAction,
        loop,
        environment: input.environment,
      })
    : null
  let steps: RevenueAutopilotStep[] = []

  if (hardStep) {
    steps = [hardStep]
  } else {
    const eligibleAutoSteps = input.snapshot.loops
      .map((loop) =>
        loop.nextAction
          ? stepFromNextAction({
              action: loop.nextAction,
              loop,
              environment: input.environment,
            })
          : null
      )
      .filter((step): step is RevenueAutopilotStep => step !== null)
      .filter((step) => step.execution === 'auto')

    const fallbackSteps =
      eligibleAutoSteps.length > 0 ? eligibleAutoSteps : recommendedStep ? [recommendedStep] : []

    const maxSteps = Math.max(1, input.maxSteps ?? 1)
    let approvalCount = 0
    steps = fallbackSteps.filter((step) => {
      if (step.execution !== 'approval') return true
      approvalCount += 1
      return approvalCount <= 1
    })
    steps = steps.slice(0, maxSteps)
  }

  const firstExecution = steps[0]?.execution
  const mode: RevenueAutopilotMode =
    firstExecution === 'auto'
      ? 'execute'
      : firstExecution === 'approval'
        ? 'approval_required'
        : 'hold'

  return {
    mode,
    generatedAt: now.toISOString(),
    revenueEur: input.snapshot.summary.revenueEur,
    blockedRevenueEur: input.snapshot.summary.blockedRevenueEur,
    steps,
  }
}

function actionTypeForStep(step: RevenueAutopilotStep): string {
  return step.kind
}

function sameUtcDay(a: Date, b: Date): boolean {
  return a.toISOString().slice(0, 10) === b.toISOString().slice(0, 10)
}

function isActiveAutopilotAction(
  action: RevenueAutopilotExistingAction,
  step: RevenueAutopilotStep,
  now: Date
): boolean {
  const createdAt = Date.parse(action.created_at ?? '')
  if (!Number.isFinite(createdAt)) return false
  if (!sameUtcDay(new Date(createdAt), now)) return false
  if (action.action_type !== actionTypeForStep(step)) return false
  if ((action.venture_id ?? null) !== (step.ventureId ?? null)) return false
  if (action.input?.source !== 'revenue_autopilot') return false
  return ['blocked', 'running', 'completed', 'planned'].includes(String(action.status ?? ''))
}

function modeForSteps(steps: RevenueAutopilotStep[]): RevenueAutopilotMode {
  const firstExecution = steps[0]?.execution
  if (firstExecution === 'auto') return 'execute'
  if (firstExecution === 'approval') return 'approval_required'
  return 'hold'
}

export function filterDuplicateDailyAutopilotSteps(
  input: FilterDuplicateDailyAutopilotStepsInput
): RevenueAutopilotPlan {
  const now = input.now ?? new Date()
  const steps = input.plan.steps.filter(
    (step) => !input.actions.some((action) => isActiveAutopilotAction(action, step, now))
  )

  return {
    ...input.plan,
    mode: modeForSteps(steps),
    steps,
  }
}
