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
