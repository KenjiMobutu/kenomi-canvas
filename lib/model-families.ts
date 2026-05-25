export const HERMES_MODELS = ['hermes3:8b', 'hermes3:latest'] as const

export function isHermesModel(model: string): boolean {
  return HERMES_MODELS.includes(model as (typeof HERMES_MODELS)[number])
}
