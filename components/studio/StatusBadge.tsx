'use client'

import { muted2 } from '@/lib/ck-vars'

const STATUS_COLORS: Record<string, string> = {
  // Drafts
  draft: '#94a3b8',
  blocked: '#fbbf24',
  approved: '#22d3ee',
  published: '#34d399',
  failed: '#f87171',
  rejected: '#94a3b8',
  // Approvals / jobs / actions
  pending: '#fbbf24',
  running: '#22d3ee',
  completed: '#34d399',
  cancelled: '#94a3b8',
  queued: '#a78bfa',
  // Ventures
  active: '#34d399',
  stopped: '#f87171',
  paused: '#fbbf24',
}

export interface StatusBadgeProps {
  status: string
  /** sm = chip 3x7, md = chip 4x10. */
  size?: 'sm' | 'md'
  /** Couleur override si statut non whitelisté. */
  color?: string
}

export function getStatusColor(status: string): string {
  return STATUS_COLORS[status] ?? muted2
}

export function StatusBadge({ status, size = 'sm', color: colorOverride }: StatusBadgeProps) {
  const color = colorOverride ?? getStatusColor(status)
  const padding = size === 'md' ? '4px 10px' : '3px 7px'
  const fontSize = size === 'md' ? 10 : 9

  return (
    <span
      style={{
        fontFamily: 'var(--font-mono)',
        fontSize,
        padding,
        borderRadius: 4,
        background: `${color}22`,
        color,
        border: `1px solid ${color}40`,
        letterSpacing: '.14em',
        textTransform: 'uppercase',
        fontWeight: 800,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
      }}
    >
      {status}
    </span>
  )
}
