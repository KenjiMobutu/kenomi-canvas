'use client'

import { useEffect } from 'react'
import { bg, surface, line2, text, muted, muted2, accent, rose } from '@/lib/ck-vars'
import { AlertTriangle, RotateCcw } from 'lucide-react'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[app.error]', { message: error.message, digest: error.digest })
  }, [error])

  return (
    <div
      style={{
        minHeight: '100vh',
        background: bg,
        display: 'grid',
        placeItems: 'center',
        padding: 24,
      }}
    >
      <div
        style={{
          background: surface,
          border: `1px solid ${line2}`,
          padding: 32,
          borderRadius: 14,
          maxWidth: 480,
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <AlertTriangle size={20} color={rose} />
          <h1
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 20,
              fontWeight: 800,
              color: text,
              margin: 0,
              letterSpacing: '-.01em',
            }}
          >
            Erreur interne
          </h1>
        </div>
        <p
          style={{
            color: muted,
            fontSize: 13,
            lineHeight: 1.6,
            margin: 0,
            fontFamily: 'var(--font-mono)',
          }}
        >
          {error.message || 'Une erreur inattendue est survenue.'}
        </p>
        {error.digest && (
          <code
            style={{
              fontSize: 10,
              color: muted2,
              fontFamily: 'var(--font-mono)',
              letterSpacing: '.06em',
            }}
          >
            digest: {error.digest}
          </code>
        )}
        <button
          onClick={reset}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 7,
            padding: '10px 18px',
            borderRadius: 8,
            background: accent,
            color: '#0b0d12',
            border: 'none',
            cursor: 'pointer',
            fontFamily: 'var(--font-display)',
            fontWeight: 800,
            fontSize: 12,
            letterSpacing: '.04em',
            marginTop: 8,
          }}
        >
          <RotateCcw size={13} /> Réessayer
        </button>
      </div>
    </div>
  )
}
