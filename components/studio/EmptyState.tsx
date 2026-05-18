'use client'

import { line2, muted, surface2 } from '@/lib/ck-vars'
import type { ReactNode } from 'react'

export interface EmptyStateProps {
  /** Texte principal (peut contenir du JSX inline pour <span style={{ color }}>). */
  children: ReactNode
  /** Padding interne du panel. Defaut 14px 16px. */
  padding?: string
}

export function EmptyState({ children, padding = '14px 16px' }: EmptyStateProps) {
  return (
    <div
      style={{
        padding,
        borderRadius: 10,
        background: surface2,
        border: `1px dashed ${line2}`,
        fontFamily: 'var(--font-mono)',
        fontSize: 11,
        color: muted,
        lineHeight: 1.6,
      }}
    >
      {children}
    </div>
  )
}
