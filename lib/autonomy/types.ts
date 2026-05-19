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
