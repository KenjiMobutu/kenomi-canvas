'use client'

import { line, muted, surface, surface2, text } from '@/lib/ck-vars'

export interface KpiCardProps {
  label: string
  value: string
  /** Couleur d'accent (ck-vars). Bordure gauche + chip delta. */
  color: string
  /** Optionnel: chip de variation type "+12%" ou "-3 pts". */
  delta?: string
  /** Optionnel: path SVG calculé pour la sparkline (utilise sparkPath/areaPath). */
  sparkPath?: string
  /** Variante "compact": padding réduit, taille typo plus petite (pour les grilles serrées). */
  compact?: boolean
}

export function KpiCard({
  label,
  value,
  color,
  delta,
  sparkPath,
  compact = false,
}: KpiCardProps) {
  return (
    <div
      style={{
        background: compact ? surface2 : surface,
        border: `1px solid ${line}`,
        borderRadius: compact ? 10 : 12,
        padding: compact ? '10px 12px' : 12,
        position: 'relative',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        gap: compact ? 4 : 0,
      }}
    >
      {!compact && (
        <div
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            bottom: 0,
            width: 3,
            background: color,
            opacity: 0.7,
          }}
        />
      )}
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: compact ? 9 : 9.5,
            color: muted,
            letterSpacing: '.14em',
            textTransform: 'uppercase',
          }}
        >
          {label}
        </span>
        {delta && (
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 9.5,
              padding: '2px 6px',
              borderRadius: 3,
              background: `${color}1a`,
              color,
              letterSpacing: 1,
              fontWeight: 700,
            }}
          >
            {delta}
          </span>
        )}
      </div>
      <div
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: compact ? 18 : 26,
          fontWeight: 800,
          letterSpacing: '-.02em',
          marginTop: compact ? 0 : 6,
          color: compact ? color : text,
        }}
      >
        {value}
      </div>
      {sparkPath && !compact && (
        <svg
          viewBox="0 0 100 22"
          preserveAspectRatio="none"
          style={{ width: '100%', height: 20, marginTop: 4, display: 'block' }}
        >
          <path d={sparkPath} fill="none" stroke={color} strokeWidth="1.4" />
        </svg>
      )}
    </div>
  )
}
