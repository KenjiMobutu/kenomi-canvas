import { describe, expect, it } from 'vitest'
import {
  STUDIO_MOBILE_PRIMARY_NAV,
  STUDIO_PRIMARY_NAV,
  STUDIO_SECONDARY_NAV,
  getStudioCommandPaletteItems,
} from './studio-nav'

describe('studio navigation', () => {
  it('keeps the primary navigation focused on revenue operations', () => {
    expect(STUDIO_PRIMARY_NAV.map((item) => item.label)).toEqual([
      'Cockpit',
      'Prospects',
      'Revenue',
      'Automations',
      'Infrastructure',
    ])
  })

  it('demotes non-revenue surfaces into the secondary navigation', () => {
    expect(STUDIO_SECONDARY_NAV.map((item) => item.label)).toEqual([
      'Ventures',
      'Agents',
      'Marketing',
      'Analytics',
      'Gamification',
      'Documents',
      'Command Chat',
      'API Keys',
      'Settings',
    ])
  })

  it('keeps mobile primary navigation tight', () => {
    expect(STUDIO_MOBILE_PRIMARY_NAV.map((item) => item.label)).toEqual([
      'Cockpit',
      'Prospects',
      'Revenue',
      'Ops',
    ])
  })

  it('puts revenue pages ahead of meta surfaces in the command palette', () => {
    expect(getStudioCommandPaletteItems().map((item) => item.label)).toEqual([
      'Prospects',
      'Revenue',
      'Automations',
      'Infrastructure',
      'Ventures',
      'Agents',
      'Analytics',
      'Marketing',
      'Documents',
    ])
  })
})
