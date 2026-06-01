export type AutonomyRiskLevel = 'low' | 'medium' | 'high' | 'critical'

export type AutonomyActionType =
  | 'run_agent'
  | 'create_landing'
  | 'create_checkout'
  | 'deploy'
  | 'publish_campaign'
  | 'scale_budget'
  | 'stop_venture'

export type AutonomyEnvironment = 'development' | 'staging' | 'production'

export interface AutonomyAction {
  actionType: AutonomyActionType
  riskLevel: AutonomyRiskLevel
  environment: AutonomyEnvironment
  estimatedCostEur: number
  budgetCapEur?: number
}

export type CampaignDraftStatus =
  | 'draft'
  | 'blocked'
  | 'approved'
  | 'published'
  | 'failed'
  | 'rejected'

export interface CampaignDraft {
  id: string
  user_id: string
  venture_id: string | null
  channel: string
  content: string
  status: CampaignDraftStatus
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

export type VentureLifecycleStatus =
  | 'draft'
  | 'validating'
  | 'ready'
  | 'launched'
  | 'scaling'
  | 'pivoting'
  | 'stopped'
  | 'archived'

export type VentureDecisionVerdict = 'continue' | 'pivot' | 'scale' | 'stop'

export type LandingHealthStatus =
  | 'unknown'
  | 'missing'
  | 'repair_required'
  | 'ready'
  | 'deployed'
  | 'stopped'

export type PaymentProviderStatus =
  | 'not_configured'
  | 'approval_required'
  | 'pending'
  | 'ready'
  | 'completed'
  | 'failed'
  | 'disabled'

export type DecisionActionStatus =
  | 'proposed'
  | 'blocked'
  | 'approved'
  | 'executed'
  | 'rejected'
  | 'failed'

export interface HermesAutoExecutionInput {
  mode: 'observe' | 'recommend' | 'act'
  actionType: AutonomyActionType
  riskLevel: AutonomyRiskLevel
  recommendationKind?: string | null
  agentId?: string | null
  caps?: {
    maxAutoActionsPerDay: number
    maxAutoProspectRunsPerDay: number
    maxAutoFollowUpScansPerDay: number
    maxAutoDevopsRunsPerDay: number
  }
  usage?: {
    totalAutoActionsToday: number
    prospectRunsToday: number
    followUpScansToday: number
    devopsRunsToday: number
  }
}

export type HermesPolicyBlockReason =
  | 'mode_disallows'
  | 'risk_too_high'
  | 'action_not_allowlisted'
  | 'daily_cap_reached'
  | 'action_cap_reached'
