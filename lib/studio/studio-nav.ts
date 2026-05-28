export type StudioNavItem = {
  href: string
  label: string
}

export const STUDIO_PRIMARY_NAV: StudioNavItem[] = [
  { href: '/studio', label: 'Cockpit' },
  { href: '/studio/prospects', label: 'Prospects' },
  { href: '/studio/revenue', label: 'Revenue' },
  { href: '/studio/automations', label: 'Automations' },
  { href: '/studio/infrastructure', label: 'Infrastructure' },
]

export const STUDIO_SECONDARY_NAV: StudioNavItem[] = [
  { href: '/studio/ventures', label: 'Ventures' },
  { href: '/studio/agents', label: 'Agents' },
  { href: '/studio/marketing', label: 'Marketing' },
  { href: '/studio/analytics', label: 'Analytics' },
  { href: '/studio/gamification', label: 'Gamification' },
  { href: '/studio/documents', label: 'Documents' },
  { href: '/studio/chat', label: 'Command Chat' },
  { href: '/studio/api-keys', label: 'API Keys' },
  { href: '/studio/settings', label: 'Settings' },
]

export const STUDIO_MOBILE_PRIMARY_NAV: StudioNavItem[] = [
  { href: '/studio', label: 'Cockpit' },
  { href: '/studio/prospects', label: 'Prospects' },
  { href: '/studio/revenue', label: 'Revenue' },
  { href: '/studio/automations', label: 'Ops' },
]

export function getStudioCommandPaletteItems(): StudioNavItem[] {
  return [
    { href: '/studio/prospects', label: 'Prospects' },
    { href: '/studio/revenue', label: 'Revenue' },
    { href: '/studio/automations', label: 'Automations' },
    { href: '/studio/infrastructure', label: 'Infrastructure' },
    { href: '/studio/ventures', label: 'Ventures' },
    { href: '/studio/agents', label: 'Agents' },
    { href: '/studio/analytics', label: 'Analytics' },
    { href: '/studio/marketing', label: 'Marketing' },
    { href: '/studio/documents', label: 'Documents' },
  ]
}
