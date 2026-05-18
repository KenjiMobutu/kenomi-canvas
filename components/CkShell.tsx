'use client'
import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { CK_DARK, CK_LIGHT, bg, line, muted, muted2, text } from '@/lib/ck-vars'
import { useIsMobile } from '@/lib/studio-utils'

interface CkShellProps {
  breadcrumb: string
  title: string
  subtitle?: string
  actions?: React.ReactNode
  children: React.ReactNode
}

export function CkShell({ breadcrumb, title, subtitle, actions, children }: CkShellProps) {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark')
  const router = useRouter()
  const isMobile = useIsMobile()

  useEffect(() => {
    try {
      setTheme((localStorage.getItem('kenomi-ck-theme') as 'dark' | 'light') || 'dark')
    } catch {}
  }, [])

  const toggleTheme = useCallback(() => {
    setTheme((t) => {
      const next = t === 'dark' ? 'light' : 'dark'
      try {
        localStorage.setItem('kenomi-ck-theme', next)
      } catch {}
      return next
    })
  }, [])

  const ckVars = theme === 'dark' ? CK_DARK : CK_LIGHT

  return (
    <div
      style={
        {
          ...ckVars,
          background: bg,
          color: text,
          minHeight: '100dvh',
          fontFamily: 'var(--font-sans)',
        } as React.CSSProperties
      }
    >
      <style>{`
        .ck-input {
          background: var(--ck-bg);
          color: var(--ck-text);
          border: 1px solid var(--ck-line-2);
          border-radius: 8px;
          padding: 8px 12px;
          font-family: var(--font-sans);
          font-size: 13px;
          outline: none;
          width: 100%;
          box-sizing: border-box;
          transition: border-color .15s;
        }
        .ck-input:focus { border-color: var(--ck-accent); }
        .ck-input::placeholder { color: var(--ck-muted-2); }
        .ck-select {
          background: var(--ck-bg);
          color: var(--ck-text);
          border: 1px solid var(--ck-line-2);
          border-radius: 8px;
          padding: 8px 12px;
          font-family: var(--font-sans);
          font-size: 13px;
          outline: none;
          cursor: pointer;
          box-sizing: border-box;
          transition: border-color .15s;
        }
        .ck-select:focus { border-color: var(--ck-accent); }
        .ck-row-hover:hover { background: var(--ck-surface-2) !important; }
        @media (max-width: 767px) {
          .ck-actions-wrap { flex-wrap: wrap; gap: 6px !important; overflow-x: auto; }
          .ck-actions-wrap > * { flex-shrink: 0; }
        }
      `}</style>

      <header
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 10,
          minHeight: isMobile ? 50 : 56,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: isMobile ? '0 12px' : '0 24px',
          gap: 8,
          background: bg,
          borderBottom: `1px solid ${line}`,
          flexWrap: isMobile ? 'wrap' : 'nowrap',
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: isMobile ? 9 : 10,
              letterSpacing: '.18em',
              textTransform: 'uppercase',
              color: muted,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {breadcrumb}
          </div>
          {subtitle && !isMobile && (
            <div
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 10,
                color: muted2,
                letterSpacing: '.06em',
                marginTop: 1,
              }}
            >
              {subtitle}
            </div>
          )}
        </div>

        <div
          className="ck-actions-wrap"
          style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}
        >
          {actions}
          {!isMobile && (
            <button
              onClick={() => router.push('/studio')}
              style={{
                padding: '5px 10px',
                borderRadius: 6,
                cursor: 'pointer',
                background: 'transparent',
                color: muted,
                border: `1px solid ${line}`,
                fontFamily: 'var(--font-mono)',
                fontSize: 10,
                letterSpacing: '.12em',
                whiteSpace: 'nowrap',
              }}
            >
              ← Cockpit
            </button>
          )}
          <button
            onClick={toggleTheme}
            title="Toggle theme"
            style={{
              padding: '5px 10px',
              borderRadius: 6,
              cursor: 'pointer',
              background: 'transparent',
              color: muted,
              border: `1px solid ${line}`,
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
            }}
          >
            {theme === 'dark' ? '☀' : '☾'}
          </button>
        </div>
      </header>

      <div style={{ padding: isMobile ? '16px 12px 24px' : '28px 32px 40px' }}>
        <div style={{ marginBottom: isMobile ? 16 : 28 }}>
          <h1
            style={{
              margin: 0,
              fontFamily: 'var(--font-display)',
              fontSize: isMobile ? 22 : 32,
              fontWeight: 800,
              letterSpacing: '-.03em',
              color: text,
              lineHeight: 1.1,
            }}
          >
            {title}
          </h1>
        </div>
        {children}
      </div>
    </div>
  )
}
