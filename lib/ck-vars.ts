/* Cockpit design-system tokens — used by all studio pages via inline styles */

export const CK_DARK: Record<string, string> = {
  '--ck-bg':       '#07090d',
  '--ck-surface':  '#0e1118',
  '--ck-surface-2':'#141823',
  '--ck-line':     'rgba(255,255,255,.07)',
  '--ck-line-2':   'rgba(255,255,255,.12)',
  '--ck-text':     '#e7eaf0',
  '--ck-muted':    '#8a93a6',
  '--ck-muted-2':  '#5b6478',
  '--ck-accent':   '#ff6a3d',
  '--ck-accent-2': '#ffd166',
  '--ck-emerald':  '#34d399',
  '--ck-amber':    '#fbbf24',
  '--ck-rose':     '#fb7185',
}

export const CK_LIGHT: Record<string, string> = {
  ...CK_DARK,
  '--ck-bg':       '#f4f1ec',
  '--ck-surface':  '#ffffff',
  '--ck-surface-2':'#f9f5ee',
  '--ck-line':     'rgba(15,18,28,.08)',
  '--ck-line-2':   'rgba(15,18,28,.14)',
  '--ck-text':     '#14181f',
  '--ck-muted':    '#5b6478',
  '--ck-muted-2':  '#8a93a6',
}

export const bg       = 'var(--ck-bg)'
export const surface  = 'var(--ck-surface)'
export const surface2 = 'var(--ck-surface-2)'
export const line     = 'var(--ck-line)'
export const line2    = 'var(--ck-line-2)'
export const text     = 'var(--ck-text)'
export const muted    = 'var(--ck-muted)'
export const muted2   = 'var(--ck-muted-2)'
export const accent   = 'var(--ck-accent)'
export const accent2  = 'var(--ck-accent-2)'
export const emerald  = 'var(--ck-emerald)'
export const amber    = 'var(--ck-amber)'
export const rose     = 'var(--ck-rose)'
