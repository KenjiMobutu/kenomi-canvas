// lib/pipeline-types.ts

export const AGENT_CHAIN = [
  'scout',
  'validation',
  'builder',
  'payment',
  'marketing',
  'decision',
] as const
export type ChainAgent = (typeof AGENT_CHAIN)[number]

export type PipelineStatus = 'pending_validation' | 'approved' | 'rejected' | 'running' | 'done'

export interface PipelineRow {
  id: string
  user_id: string
  idea_title: string
  idea_niche: string
  idea_problem: string
  idea_solution: string
  idea_market: string
  scout_raw: string
  status: PipelineStatus
  validation_output: string | null
  validation_score: number | null
  builder_output: string | null
  payment_output: string | null
  marketing_output: string | null
  decision_output: string | null
  venture_id: string | null
  current_agent: string | null
  created_at: string
  updated_at: string
}

function parseJsonObject(raw: string | null | undefined): Record<string, unknown> {
  if (!raw?.trim().startsWith('{')) return {}
  try {
    const parsed = JSON.parse(raw) as unknown
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

type AgentOutputs = Pick<
  PipelineRow,
  | 'status'
  | 'validation_output'
  | 'builder_output'
  | 'payment_output'
  | 'marketing_output'
  | 'decision_output'
>

export function nextAgentInChain(agentId: string): ChainAgent | null {
  const idx = AGENT_CHAIN.indexOf(agentId as ChainAgent)
  if (idx === -1 || idx === AGENT_CHAIN.length - 1) return null
  return AGENT_CHAIN[idx + 1]
}

export function isAgentUnlocked(agentId: string, pipeline: AgentOutputs | null): boolean {
  if (agentId === 'scout') return true
  if (!pipeline || pipeline.status !== 'approved') return false
  switch (agentId) {
    case 'validation':
      return pipeline.validation_output === null
    case 'builder':
      return pipeline.validation_output !== null && pipeline.builder_output === null
    case 'payment':
      return pipeline.builder_output !== null && pipeline.payment_output === null
    case 'marketing':
      return pipeline.payment_output !== null && pipeline.marketing_output === null
    case 'decision':
      return pipeline.marketing_output !== null && pipeline.decision_output === null
    default:
      return false
  }
}

export function parsePipelineIdea(raw: string): {
  idea_title: string
  idea_niche: string
  idea_problem: string
  idea_solution: string
  idea_market: string
} {
  const parsed = parseJsonObject(raw)
  if (Object.keys(parsed).length > 0) {
    return {
      idea_title: readString(parsed.title),
      idea_niche: readString(parsed.niche),
      idea_problem: readString(parsed.urgent_pain) || readString(parsed.problem),
      idea_solution: readString(parsed.concrete_promise) || readString(parsed.solution),
      idea_market: readString(parsed.buyer) || readString(parsed.market),
    }
  }

  const extract = (key: string) => {
    const m = raw.match(new RegExp(`^${key}:\\s*(.+)$`, 'im'))
    return m ? m[1].trim() : ''
  }
  return {
    idea_title: extract('TITRE'),
    idea_niche: extract('NICHE'),
    idea_problem: extract('PROBL[EÈ]ME'),
    idea_solution: extract('SOLUTION'),
    idea_market: extract('MARCH[EÉ]'),
  }
}

function buildSellableOfferContext(pipeline: PipelineRow | null): string {
  const scout = parseJsonObject(pipeline?.scout_raw)
  if (Object.keys(scout).length === 0) return ''

  const buyer = readString(scout.buyer)
  const urgentPain = readString(scout.urgent_pain)
  const concretePromise = readString(scout.concrete_promise)
  const price = readString(scout.price_hypothesis_eur)
  const acquisitionChannel = readString(scout.acquisition_channel)
  const landingAngle = readString(scout.landing_angle)

  if (!buyer && !urgentPain && !concretePromise) return ''

  return `
Offre vendable issue du Scout :
- Acheteur: ${buyer || pipeline?.idea_market || 'non précisé'}
- Douleur urgente: ${urgentPain || pipeline?.idea_problem || 'non précisée'}
- Promesse concrete: ${concretePromise || pipeline?.idea_solution || 'non précisée'}
- Prix plausible: ${price || 'à valider'} EUR
- Canal d'acquisition: ${acquisitionChannel || 'à valider'}
- Angle landing: ${landingAngle || urgentPain || pipeline?.idea_problem || 'à valider'}
La landing doit vendre cette offre, pas seulement expliquer le produit.
`
}

export function buildSystemPrompt(
  agentId: string,
  pipeline: PipelineRow | null,
  customPrompt: string
): string {
  if (customPrompt.trim()) return customPrompt

  const ctx = pipeline
    ? `
Contexte venture active :
- Titre : ${pipeline.idea_title}
- Niche : ${pipeline.idea_niche}
- Problème : ${pipeline.idea_problem}
- Solution : ${pipeline.idea_solution}
- Marché cible : ${pipeline.idea_market}
${buildSellableOfferContext(pipeline)}
`
    : ''

  const prompts: Record<string, string> = {
    scout: `Tu es Scout, agent de découverte de ventures pour entrepreneur solo.
Ta mission : identifier une opportunité de micro-SaaS ou service digital à fort potentiel.
Réponds UNIQUEMENT dans ce format exact (5 lignes) :
TITRE: [nom court du produit]
NICHE: [marché cible précis]
PROBLÈME: [douleur principale en 1 phrase]
SOLUTION: [solution proposée en 1 phrase]
MARCHÉ: [segment cible précis]
Aucun texte avant ou après ces 5 lignes.`,

    validation: `Tu es Validation, agent de scoring de ventures.${ctx}
Ta mission : analyser cette idée sur 4 critères (TAM, CPC estimé, concurrence SEO, faisabilité solo).
Réponds en JSON strict :
{"score": <0-100>, "tam": "<estimation marché>", "cpc": "<coût clic estimé>", "seo_difficulty": "<faible|moyen|élevé>", "verdict": "go|no-go", "reason": "<justification 2 phrases>"}`,

    builder: `Tu es Builder, agent de création de landing page.${ctx}
Ta mission : générer le contenu complet d'une landing page qui vend l'offre publique de cette venture.
Réponds en JSON strict :
{"headline": "<titre qui vend la promesse>", "subline": "<sous-titre qui nomme l'acheteur et la douleur urgente>", "cta": "<Buy now|Get access|Start now|Rejoindre>", "features": ["<benefice: detail concret>", "<benefice: detail concret>", "<benefice: detail concret>"], "pricing": "<offre simple ex: 29 EUR one-time>", "buyer": "<acheteur cible>", "urgent_pain": "<douleur urgente>", "concrete_promise": "<promesse concrete>", "price_anchor": "<ancrage prix defendable>", "objection_handling": ["<reponse a objection 1>", "<reponse a objection 2>"], "sections": [{"title": "<section de vente>", "body": "<copy de vente>"}, {"title": "<section de vente>", "body": "<copy de vente>"}], "faq": [{"q": "<question acheteur>", "a": "<reponse concrete>"}, {"q": "<question acheteur>", "a": "<reponse concrete>"}]}
La page doit être achetable maintenant, traiter les objections, inclure une raison de croire et un prix défendable. Ne produis jamais une simple page d'explication.`,

    payment: `Tu es Payment, agent de monétisation.${ctx}
Ta mission : concevoir la configuration Stripe optimale pour cette venture.
Réponds en JSON strict :
{"product_name": "<nom produit>", "price_amount": <centimes entier>, "price_currency": "eur", "billing": "one_time|monthly|yearly", "checkout_description": "<description 1 phrase>", "trial_days": <0-30>}`,

    marketing: `Tu es Marketing, agent de distribution revenue-first.${ctx}
Ta mission : créer un plan de lancement sur 7 jours et des assets prêts à publier pour vendre cette venture.
Chaque asset doit être adapté au canal : LinkedIn post/carousel, TikTok ou YouTube Shorts en vidéo faceless, SEO article, newsletter/email, X thread si pertinent.
Pour les vidéos faceless, fournis un hook, une voix off, des scènes, des captions et un visual_prompt sans visage humain.
Réponds en JSON strict :
{"channels": ["linkedin", "tiktok", "seo", "newsletter"], "messages": ["<message clé 1>", "<message clé 2>", "<message clé 3>", "<message clé 4>", "<message clé 5>"], "day1": "<action J+1>", "day3": "<action J+3>", "day7": "<action J+7>", "assets": [{"channel": "<canal>", "asset_kind": "post|thread|newsletter|seo_article|short_video|faceless_video", "format": "<format exact>", "title": "<titre adapté au canal>", "body": "<texte prêt à publier>", "cta": "<CTA vers landing/checkout/waitlist>", "video": {"hook": "<hook 0-3s si vidéo>", "voiceover": "<voix off si vidéo>", "scenes": ["<scène 1>", "<scène 2>", "<scène 3>"], "captions": ["<caption 1>", "<caption 2>"], "visual_prompt": "<prompt vidéo IA sans visage>"}}]}`,

    decision: `Tu es Decision, agent de commande stratégique.${ctx}
Score validation : ${pipeline?.validation_score ?? '—'}/100
Builder output : ${pipeline?.builder_output ? 'prêt' : 'non exécuté'}
Payment output : ${pipeline?.payment_output ? 'configuré' : 'non exécuté'}
Marketing output : ${pipeline?.marketing_output ? 'planifié' : 'non exécuté'}
Ta mission : rendre un verdict stratégique final.
Réponds en JSON strict :
{"verdict": "continue|pivot|stop", "confidence": <0-100>, "rationale": "<justification 3 phrases>", "next_step": "<action immédiate concrète>"}`,
  }

  return prompts[agentId] ?? `Tu es l'agent ${agentId}. Tu es opérationnel.`
}
