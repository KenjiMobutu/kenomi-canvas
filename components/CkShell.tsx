'use client'
import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { CK_DARK, CK_LIGHT, bg, line, muted, text } from '@/lib/ck-vars'

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

  useEffect(() => {
    try { setTheme((localStorage.getItem('kenomi-ck-theme') as 'dark' | 'light') || 'dark') } catch {}
  }, [])

  const toggleTheme = useCallback(() => {
    setTheme(t => {
      const next = t === 'dark' ? 'light' : 'dark'
      try { localStorage.setItem('kenomi-ck-theme', next) } catch {}
      return next
    })
  }, [])

  const ckVars = theme === 'dark' ? CK_DARK : CK_LIGHT

  return (
    <div style={{ ...ckVars, background: bg, color: text, minHeight: '100dvh', fontFamily: 'var(--font-sans)' } as React.CSSProperties}>
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
      `}</style>

      <header style={{
        position: 'sticky', top: 0, zIndex: 10,
        height: 56,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 24px',
        background: bg,
        borderBottom: `1px solid ${line}`,
      }}>
        <div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '.18em', textTransform: 'uppercase', color: muted }}>
            {breadcrumb}
          </div>
          {subtitle && (
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--ck-muted-2)', letterSpacing: '.06em', marginTop: 1 }}>
              {subtitle}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {actions}
          <button
            onClick={() => router.push('/studio')}
            style={{
              padding: '5px 10px', borderRadius: 6, cursor: 'pointer',
              background: 'transparent', color: muted,
              border: `1px solid ${line}`,
              fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '.12em',
            }}
          >← Cockpit</button>
          <button
            onClick={toggleTheme}
            title="Toggle theme (T)"
            style={{
              padding: '5px 10px', borderRadius: 6, cursor: 'pointer',
              background: 'transparent', color: muted,
              border: `1px solid ${line}`,
              fontFamily: 'var(--font-mono)', fontSize: 11,
            }}
          >{theme === 'dark' ? '☀' : '☾'}</button>
        </div>
      </header>

      <div style={{ padding: '28px 32px 40px' }}>
        <div style={{ marginBottom: 28 }}>
          <h1 style={{
            margin: 0,
            fontFamily: 'var(--font-display)', fontSize: 32, fontWeight: 800,
            letterSpacing: '-.03em', color: text, lineHeight: 1.1,
          }}>{title}</h1>
        </div>
        {children}
      </div>
    </div>
  )
}
