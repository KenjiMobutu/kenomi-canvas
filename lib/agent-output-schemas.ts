import { z } from 'zod'

const scoutSchema = z.object({
  title: z.string().min(1),
  niche: z.string().min(1),
  problem: z.string().min(1),
  solution: z.string().min(1),
  market: z.string().min(1),
})

const validationSchema = z.object({
  score: z.number().int().min(0).max(100),
  tam: z.string().min(1),
  cpc: z.string().min(1),
  seo_difficulty: z.enum(['faible', 'moyen', 'élevé']),
  verdict: z.enum(['go', 'no-go']),
  reason: z.string().min(1),
})

const builderSchema = z.object({
  headline: z.string().min(1),
  subline: z.string().min(1),
  cta: z.string().min(1),
  features: z.array(z.string().min(1)).min(1),
  pricing: z.string().min(1),
})

const paymentSchema = z.object({
  product_name: z.string().min(1),
  price_amount: z.number().int().positive(),
  price_currency: z.string().length(3),
  billing: z.enum(['one_time', 'monthly', 'yearly']),
  checkout_description: z.string().min(1),
  trial_days: z.number().int().min(0).max(30),
})

const marketingSchema = z.object({
  channels: z.array(z.string().min(1)).min(1),
  messages: z.array(z.string().min(1)).min(1),
  day1: z.string().min(1),
  day3: z.string().min(1),
  day7: z.string().min(1),
})

const decisionSchema = z.object({
  verdict: z.enum(['continue', 'pivot', 'stop']),
  confidence: z.number().int().min(0).max(100),
  rationale: z.string().min(1),
  next_step: z.string().min(1),
})

const schemas = {
  scout: scoutSchema,
  validation: validationSchema,
  builder: builderSchema,
  payment: paymentSchema,
  marketing: marketingSchema,
  decision: decisionSchema,
} as const

type AgentId = keyof typeof schemas

function parseJson(content: string, agentId: string): unknown {
  try {
    return JSON.parse(content)
  } catch {
    throw new Error(`Invalid ${agentId} output: malformed JSON`)
  }
}

function parseScoutLegacy(content: string): z.infer<typeof scoutSchema> {
  const extract = (key: string) => {
    const match = content.match(new RegExp(`^${key}:\\s*(.+)$`, 'im'))
    return match?.[1]?.trim() ?? ''
  }

  return scoutSchema.parse({
    title: extract('TITRE'),
    niche: extract('NICHE'),
    problem: extract('PROBL[EÈ]ME'),
    solution: extract('SOLUTION'),
    market: extract('MARCH[EÉ]'),
  })
}

export type AgentOutput =
  | z.infer<typeof scoutSchema>
  | z.infer<typeof validationSchema>
  | z.infer<typeof builderSchema>
  | z.infer<typeof paymentSchema>
  | z.infer<typeof marketingSchema>
  | z.infer<typeof decisionSchema>

export function parseAgentOutput(agentId: string, content: string): AgentOutput {
  const schema = schemas[agentId as AgentId]
  if (!schema) throw new Error(`Invalid ${agentId} output: unknown agent`)

  try {
    if (agentId === 'scout' && !content.trim().startsWith('{')) {
      return parseScoutLegacy(content)
    }

    return schema.parse(parseJson(content, agentId))
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Invalid')) {
      throw error
    }
    throw new Error(`Invalid ${agentId} output`)
  }
}
