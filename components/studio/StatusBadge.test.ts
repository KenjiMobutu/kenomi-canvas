import { describe, it, expect } from 'vitest'
import { getStatusColor } from './StatusBadge'

describe('getStatusColor', () => {
  it('retourne la couleur pour les statuts drafts', () => {
    expect(getStatusColor('draft')).toBe('#94a3b8')
    expect(getStatusColor('blocked')).toBe('#fbbf24')
    expect(getStatusColor('published')).toBe('#34d399')
    expect(getStatusColor('failed')).toBe('#f87171')
  })

  it('retourne la couleur pour les statuts approvals/jobs', () => {
    expect(getStatusColor('pending')).toBe('#fbbf24')
    expect(getStatusColor('running')).toBe('#22d3ee')
    expect(getStatusColor('completed')).toBe('#34d399')
    expect(getStatusColor('queued')).toBe('#a78bfa')
  })

  it('retourne la couleur muted2 (fallback) pour un statut inconnu', () => {
    expect(getStatusColor('xyzzy')).toBe('var(--ck-muted-2)')
  })
})
