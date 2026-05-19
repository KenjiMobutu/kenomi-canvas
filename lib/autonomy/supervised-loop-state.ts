export type SupervisedLoopRepairActionId =
  | 'run-builder'
  | 'run-marketing'
  | 'open-public-landing'
  | 'prepare-landing'

export interface SupervisedLoopRepairAction {
  id: SupervisedLoopRepairActionId
  label: string
  detail: string
  href: string
  tone: 'warn' | 'muted' | 'ok'
}

export function getMissingLandingAction(input: {
  ventureName: string
  hasLanding: boolean
}): SupervisedLoopRepairAction | null {
  if (input.hasLanding) return null

  return {
    id: 'run-builder',
    label: 'Lancer Builder',
    detail: `Aucune landing publique matérialisée pour ${input.ventureName}.`,
    href: '/studio/agents',
    tone: 'warn',
  }
}

export function getMissingMarketingDraftsAction(input: {
  draftCount: number
  pendingApprovalCount: number
}): SupervisedLoopRepairAction | null {
  if (input.draftCount > 0 || input.pendingApprovalCount > 0) return null

  return {
    id: 'run-marketing',
    label: 'Lancer Marketing',
    detail: 'Aucun draft marketing généré.',
    href: '/studio/agents',
    tone: 'warn',
  }
}

export function getMissingAnalyticsEventsAction(input: {
  hasEvents: boolean
  publicSlug?: string | null
}): SupervisedLoopRepairAction | null {
  if (input.hasEvents) return null

  const slug = input.publicSlug?.trim()
  if (slug) {
    return {
      id: 'open-public-landing',
      label: 'Ouvrir landing publique',
      detail: 'Aucun événement capturé. Ouvrez la landing pour générer un page_view.',
      href: `/${slug}`,
      tone: 'warn',
    }
  }

  return {
    id: 'prepare-landing',
    label: 'Préparer une landing',
    detail: 'Aucun événement capturé et aucune landing publique détectée.',
    href: '/studio/ventures',
    tone: 'warn',
  }
}
