import { describe, expect, it } from 'vitest'
import {
  getMissingAnalyticsEventsAction,
  getMissingLandingAction,
  getMissingMarketingDraftsAction,
} from './supervised-loop-state'

describe('supervised loop repair actions', () => {
  it('asks the operator to run Builder when a venture has no public landing', () => {
    expect(getMissingLandingAction({ ventureName: 'InboxPulse', hasLanding: false })).toEqual({
      id: 'run-builder',
      label: 'Lancer Builder',
      detail: 'Aucune landing publique matérialisée pour InboxPulse.',
      href: '/studio/agents',
      agentId: 'builder',
      tone: 'warn',
    })
  })

  it('does not create a repair action when a landing already exists', () => {
    expect(getMissingLandingAction({ ventureName: 'InboxPulse', hasLanding: true })).toBeNull()
  })

  it('asks the operator to run Marketing when no draft exists', () => {
    expect(getMissingMarketingDraftsAction({ draftCount: 0, pendingApprovalCount: 0 })).toEqual({
      id: 'run-marketing',
      label: 'Lancer Marketing',
      detail: 'Aucun draft marketing généré.',
      href: '/studio/agents',
      agentId: 'marketing',
      tone: 'warn',
    })
  })

  it('keeps pending marketing approvals as the primary action', () => {
    expect(getMissingMarketingDraftsAction({ draftCount: 0, pendingApprovalCount: 2 })).toBeNull()
  })

  it('opens the public landing when analytics has no event yet but a slug exists', () => {
    expect(getMissingAnalyticsEventsAction({ hasEvents: false, publicSlug: 'inboxpulse' })).toEqual({
      id: 'open-public-landing',
      label: 'Ouvrir landing publique',
      detail: 'Aucun événement capturé. Ouvrez la landing pour générer un page_view.',
      href: '/inboxpulse',
      tone: 'warn',
    })
  })

  it('sends the operator back to Ventures when analytics has no events and no landing', () => {
    expect(getMissingAnalyticsEventsAction({ hasEvents: false, publicSlug: '' })).toEqual({
      id: 'prepare-landing',
      label: 'Préparer une landing',
      detail: 'Aucun événement capturé et aucune landing publique détectée.',
      href: '/studio/ventures',
      tone: 'warn',
    })
  })
})
