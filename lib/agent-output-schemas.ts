import { z } from 'zod'

const scoutSchema = z.object({
  title: z.string().min(1),
  niche: z.string().min(1),
  buyer: z.string().min(5),
  urgent_pain: z.string().min(10),
  concrete_promise: z.string().min(10),
  offer: z.string().min(10),
  price_hypothesis_eur: z.number().positive().max(5000),
  acquisition_channel: z.string().min(2),
  landing_angle: z.string().min(10),
  evidence: z.array(z.string().min(5)).min(1),
  confidence: z.number().min(0).max(100),
  problem: z.string().min(1).optional(),
  solution: z.string().min(1).optional(),
  market: z.string().min(1).optional(),
})

const validationSchema = z.object({
  score: z.number().int().min(0).max(100),
  tam: z.string().min(1),
  cpc: z.string().min(1),
  seo_difficulty: z.enum(['faible', 'moyen', 'élevé']),
  verdict: z.enum(['go', 'no-go']),
  reason: z.string().min(1),
})

const prospectSchema = z.object({
  company_name: z.string().min(1),
  source: z.enum(['linkedin', 'malt', 'upwork', 'indeed', 'reddit', 'other']),
  contact_name: z.string().min(1).optional(),
  score: z.number().int().min(0).max(100),
  band: z.enum(['hot', 'warm', 'cold']),
  summary: z.string().min(1),
  pain_points: z.array(z.string().min(2)).min(1),
  outreach_subject: z.string().min(1),
  outreach_body: z.string().min(1),
  cta: z.string().min(1),
})

const builderSchema = z.object({
  headline: z.string().min(1),
  subline: z.string().min(1),
  cta: z.string().min(1),
  features: z.array(z.string().min(1)).min(1),
  pricing: z.string().min(1),
  buyer: z.string().min(5),
  urgent_pain: z.string().min(10),
  concrete_promise: z.string().min(10),
  price_anchor: z.string().min(10),
  objection_handling: z.array(z.string().min(5)).min(2),
  sections: z.array(z.object({ title: z.string().min(1), body: z.string().min(1) })).min(2),
  faq: z.array(z.object({ q: z.string().min(1), a: z.string().min(1) })).min(2),
})

const paymentSchema = z.object({
  product_name: z.string().min(1),
  price_amount: z.number().int().positive(),
  price_currency: z.string().length(3),
  billing: z.enum(['one_time', 'monthly', 'yearly']),
  checkout_description: z.string().min(1),
  trial_days: z.number().int().min(0).max(30),
})

const marketingVideoSchema = z.object({
  hook: z.string().min(1).optional(),
  voiceover: z.string().min(1).optional(),
  scenes: z.array(z.string().min(1)).optional(),
  captions: z.array(z.string().min(1)).optional(),
  visual_prompt: z.string().min(1).optional(),
})

const marketingAssetSchema = z.object({
  channel: z.string().min(1),
  asset_kind: z
    .enum(['post', 'thread', 'newsletter', 'seo_article', 'short_video', 'faceless_video'])
    .optional(),
  format: z.string().min(1),
  title: z.string().min(1),
  body: z.string().min(1),
  cta: z.string().min(1),
  video: marketingVideoSchema.optional(),
})

const marketingSchema = z.object({
  channels: z.array(z.string().min(1)).min(1),
  messages: z.array(z.string().min(1)).min(1),
  day1: z.string().min(1),
  day3: z.string().min(1),
  day7: z.string().min(1),
  assets: z.array(marketingAssetSchema).optional(),
})

const decisionSchema = z.object({
  verdict: z.enum(['continue', 'pivot', 'stop']),
  confidence: z.number().int().min(0).max(100),
  rationale: z.string().min(1),
  next_step: z.string().min(1),
})

const devopsServiceSchema = z.object({
  id: z.string().min(1),
  status: z.enum(['ok', 'degraded', 'down']),
  severity: z.enum(['low', 'medium', 'high']),
  reason: z.string().min(1),
  next_step: z.string().min(1),
})

const devopsSchema = z.object({
  global_status: z.enum(['ok', 'degraded', 'down']),
  headline: z.string().min(1),
  services: z.array(devopsServiceSchema),
  summary: z.string().min(1),
  operator_next_step: z.string().min(1),
})

const schemas = {
  scout: scoutSchema,
  validation: validationSchema,
  prospect: prospectSchema,
  builder: builderSchema,
  payment: paymentSchema,
  marketing: marketingSchema,
  decision: decisionSchema,
  devops: devopsSchema,
} as const

type AgentId = keyof typeof schemas

function parseJson(content: string, agentId: string): unknown {
  try {
    return JSON.parse(content)
  } catch {
    throw new Error(`Invalid ${agentId} output: malformed JSON`)
  }
}

function normalizeDevopsObject(value: unknown): unknown {
  if (!value || typeof value !== 'object') return value
  const raw = value as Record<string, unknown>
  const services = Array.isArray(raw.services)
    ? raw.services.map((service) => {
        if (!service || typeof service !== 'object') return service
        const nextStep = (service as Record<string, unknown>)['next,step']
        if (nextStep === undefined) return service
        return {
          ...(service as Record<string, unknown>),
          next_step: (service as Record<string, unknown>).next_step ?? nextStep,
        }
      })
    : raw.services

  return {
    ...raw,
    services,
  }
}

function parseScoutLegacy(content: string): z.infer<typeof scoutSchema> {
  const extract = (key: string) => {
    const match = content.match(new RegExp(`^${key}:\\s*(.+)$`, 'im'))
    return match?.[1]?.trim() ?? ''
  }

  const title = extract('TITRE')
  const niche = extract('NICHE')
  const problem = extract('PROBL[EÈ]ME')
  const solution = extract('SOLUTION')
  const market = extract('MARCH[EÉ]')

  return scoutSchema.parse({
    title,
    niche,
    buyer: market || niche,
    urgent_pain: problem,
    concrete_promise: solution,
    offer: solution,
    price_hypothesis_eur: 29,
    acquisition_channel: 'manual_validation',
    landing_angle: problem ? `Résoudre maintenant : ${problem}` : `Offre pour ${niche}`,
    evidence: [`Signal Scout legacy pour ${market || niche}`],
    confidence: 50,
    problem,
    solution,
    market,
  })
}

export type AgentOutput =
  | z.infer<typeof scoutSchema>
  | z.infer<typeof validationSchema>
  | z.infer<typeof prospectSchema>
  | z.infer<typeof builderSchema>
  | z.infer<typeof paymentSchema>
  | z.infer<typeof marketingSchema>
  | z.infer<typeof decisionSchema>
  | z.infer<typeof devopsSchema>

export type ScoutOutput = z.infer<typeof scoutSchema>
export type ValidationOutput = z.infer<typeof validationSchema>
export type ProspectOutput = z.infer<typeof prospectSchema>
export type BuilderOutput = z.infer<typeof builderSchema>
export type PaymentOutput = z.infer<typeof paymentSchema>
export type MarketingOutput = z.infer<typeof marketingSchema>
export type DecisionOutput = z.infer<typeof decisionSchema>
export type DevopsOutput = z.infer<typeof devopsSchema>

export function parseAgentOutput(agentId: string, content: string): AgentOutput {
  const schema = schemas[agentId as AgentId]
  if (!schema) throw new Error(`Invalid ${agentId} output: unknown agent`)

  try {
    if (agentId === 'scout' && !content.trim().startsWith('{')) {
      return parseScoutLegacy(content)
    }
    const parsed = parseJson(content, agentId)
    return schema.parse(agentId === 'devops' ? normalizeDevopsObject(parsed) : parsed)
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Invalid')) {
      throw error
    }
    throw new Error(`Invalid ${agentId} output`)
  }
}
