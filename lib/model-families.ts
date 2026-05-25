export const HERMES_MODELS = ['hermes3:8b', 'hermes3:latest'] as const
export const QWEN_MODELS = ['qwen3:8b', 'qwen3:14b'] as const

export function isHermesModel(model: string): boolean {
  return HERMES_MODELS.includes(model as (typeof HERMES_MODELS)[number])
}

export function getModelFamily(model: string): 'hermes' | 'qwen' | 'claude' | 'other' {
  if (isHermesModel(model)) return 'hermes'
  if (QWEN_MODELS.includes(model as (typeof QWEN_MODELS)[number])) return 'qwen'
  if (model.startsWith('claude')) return 'claude'
  return 'other'
}
