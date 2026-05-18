import { z } from 'zod'
import type { AutonomyAction, AutonomyEnvironment } from '@/lib/autonomy/types'

const deployRequestSchema = z.object({
  ventureId: z.string().min(1),
  projectId: z.string().min(1),
  serviceId: z.string().min(1),
})

export interface DeployRequest {
  ventureId: string
  projectId: string
  serviceId: string
}

export function parseDeployRequest(input: unknown): DeployRequest {
  try {
    return deployRequestSchema.parse(input)
  } catch {
    throw new Error('Invalid deploy request')
  }
}

export function buildDeployAutonomyAction(input: {
  environment: AutonomyEnvironment
  estimatedCostEur?: number
  budgetCapEur?: number
}): AutonomyAction {
  return {
    actionType: 'deploy',
    riskLevel: 'medium',
    environment: input.environment,
    estimatedCostEur: input.estimatedCostEur ?? 0,
    budgetCapEur: input.budgetCapEur,
  }
}

export function getDeployEnvironment(
  env: NodeJS.ProcessEnv = process.env
): AutonomyEnvironment {
  if (
    env.KENOMI_ENV === 'development' ||
    env.KENOMI_ENV === 'staging' ||
    env.KENOMI_ENV === 'production'
  ) {
    return env.KENOMI_ENV
  }

  if (env.VERCEL_ENV === 'production' || env.NODE_ENV === 'production') {
    return 'production'
  }

  if (env.VERCEL_ENV === 'preview') {
    return 'staging'
  }

  return 'development'
}
