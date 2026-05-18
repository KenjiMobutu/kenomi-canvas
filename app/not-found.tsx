import Link from 'next/link'
import { bg, surface, line2, text, muted, accent } from '@/lib/ck-vars'
import { Compass, Home } from 'lucide-react'

export default function NotFound() {
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
          <Compass size={20} color={accent} />
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
            Page introuvable
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
          Cette page n&apos;existe pas, ou n&apos;est plus disponible.
        </p>
        <Link
          href="/"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 7,
            padding: '10px 18px',
            borderRadius: 8,
            background: accent,
            color: '#0b0d12',
            textDecoration: 'none',
            fontFamily: 'var(--font-display)',
            fontWeight: 800,
            fontSize: 12,
            letterSpacing: '.04em',
            marginTop: 8,
          }}
        >
          <Home size={13} /> Retour à l&apos;accueil
        </Link>
      </div>
    </div>
  )
}
