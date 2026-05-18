'use client'

import { useEffect } from 'react'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[app.global-error]', { message: error.message, digest: error.digest })
  }, [error])

  return (
    <html lang="fr">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          background: '#0b0d12',
          color: '#e6e8ee',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          display: 'grid',
          placeItems: 'center',
          padding: 24,
        }}
      >
        <div
          style={{
            background: '#13151c',
            border: '1px solid #2a2d36',
            padding: 32,
            borderRadius: 14,
            maxWidth: 480,
            width: '100%',
          }}
        >
          <h1 style={{ fontSize: 20, fontWeight: 800, marginTop: 0 }}>Erreur critique</h1>
          <p style={{ color: '#8a8f9d', fontSize: 13, lineHeight: 1.6 }}>
            {error.message || 'Une erreur inattendue est survenue au niveau racine.'}
          </p>
          {error.digest && (
            <code style={{ fontSize: 10, color: '#5f6470' }}>digest: {error.digest}</code>
          )}
          <button
            onClick={reset}
            style={{
              display: 'block',
              marginTop: 18,
              padding: '10px 18px',
              borderRadius: 8,
              background: '#a78bfa',
              color: '#0b0d12',
              border: 'none',
              cursor: 'pointer',
              fontWeight: 800,
              fontSize: 12,
            }}
          >
            Réessayer
          </button>
        </div>
      </body>
    </html>
  )
}
