'use client'

import { useEffect, useState } from 'react'
import { createSupabaseBrowser } from '@/lib/supabase-browser'
import { useAuth } from '@/lib/auth-context'
import { useIsMobile } from '@/lib/studio-utils'
import { toast } from 'sonner'
import { CkShell } from '@/components/CkShell'
import {
  surface,
  surface2,
  line,
  line2,
  text,
  muted,
  muted2,
  accent,
  accent2,
  emerald,
  rose,
  amber,
} from '@/lib/ck-vars'
import { Copy, Eye, EyeOff, KeyRound, Plus, Trash2 } from 'lucide-react'

interface ApiKey {
  id: string
  name: string
  key_prefix: string
  last_used_at: string | null
  created_at: string
}

function generateKey() {
  const arr = new Uint8Array(24)
  crypto.getRandomValues(arr)
  return 'ken_' + Array.from(arr, (b) => b.toString(16).padStart(2, '0')).join('')
}

async function sha256(s: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('')
}

function timeSince(iso: string) {
  const d = Date.now() - new Date(iso).getTime()
  const h = Math.floor(d / 3600000)
  if (h < 1) return "il y a moins d'1h"
  if (h < 24) return `il y a ${h}h`
  const days = Math.floor(h / 24)
  if (days < 30) return `il y a ${days}j`
  return new Date(iso).toLocaleDateString('fr-FR')
}

export default function ApiKeysPage() {
  const { user } = useAuth()
  const isMobile = useIsMobile()
  const [keys, setKeys] = useState<ApiKey[]>([])
  const [name, setName] = useState('')
  const [reveal, setReveal] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [showNew, setShowNew] = useState(false)

  async function load() {
    const supabase = createSupabaseBrowser()
    const { data } = await supabase
      .from('api_keys')
      .select('id,name,key_prefix,last_used_at,created_at')
      .eq('user_id', user!.id)
      .order('created_at', { ascending: false })
    setKeys((data as ApiKey[]) || [])
  }
  useEffect(() => {
    if (user) load()
  }, [user]) // eslint-disable-line react-hooks/exhaustive-deps

  async function create() {
    if (!user || !name.trim() || creating) return
    setCreating(true)
    const supabase = createSupabaseBrowser()
    const k = generateKey()
    const hash = await sha256(k)
    const { error } = await supabase.from('api_keys').insert({
      user_id: user.id,
      name: name.trim(),
      key_prefix: k.slice(0, 12),
      key_hash: hash,
    })
    setCreating(false)
    if (error) return toast.error(error.message)
    setReveal(k)
    setName('')
    setShowNew(false)
    load()
  }

  async function del(id: string) {
    const supabase = createSupabaseBrowser()
    await supabase.from('api_keys').delete().eq('id', id).eq('user_id', user!.id)
    toast.success('Clé supprimée')
    load()
  }

  const createAction = (
    <button
      onClick={() => setShowNew((n) => !n)}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '6px 14px',
        borderRadius: 999,
        background: accent,
        color: '#0b0d12',
        fontFamily: 'var(--font-display)',
        fontWeight: 800,
        fontSize: 12,
        border: 'none',
        cursor: 'pointer',
      }}
    >
      <Plus size={13} /> Nouvelle clé
    </button>
  )

  return (
    <CkShell
      breadcrumb="System / API Keys"
      title="API Keys"
      subtitle={`${keys.length} clé${keys.length !== 1 ? 's' : ''} active${keys.length !== 1 ? 's' : ''}`}
      actions={createAction}
    >
      {/* Revealed key banner */}
      {reveal && (
        <div
          style={{
            marginBottom: 20,
            padding: 20,
            borderRadius: 14,
            background: `linear-gradient(135deg, ${accent}18, ${accent2}12)`,
            border: `1.5px solid ${accent}55`,
            boxShadow: `0 0 30px ${accent}20`,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 10,
                color: accent,
                letterSpacing: '.18em',
                textTransform: 'uppercase',
                fontWeight: 800,
              }}
            >
              ⚠ Copiez cette clé maintenant — elle ne sera plus affichée
            </span>
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              background: surface2,
              border: `1px solid ${line2}`,
              borderRadius: 10,
              padding: '12px 14px',
            }}
          >
            <KeyRound size={14} style={{ color: accent, flexShrink: 0 }} />
            <span
              style={{
                flex: 1,
                fontFamily: 'var(--font-mono)',
                fontSize: 12.5,
                color: text,
                wordBreak: 'break-all',
                letterSpacing: '.04em',
              }}
            >
              {reveal}
            </span>
            <button
              onClick={() => {
                navigator.clipboard.writeText(reveal)
                toast.success('Clé copiée')
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                padding: '6px 12px',
                borderRadius: 7,
                background: accent + '20',
                color: accent,
                border: `1px solid ${accent}40`,
                cursor: 'pointer',
                fontFamily: 'var(--font-mono)',
                fontSize: 10,
                fontWeight: 800,
                letterSpacing: '.1em',
              }}
            >
              <Copy size={12} /> Copier
            </button>
          </div>
          <button
            onClick={() => setReveal(null)}
            style={{
              marginTop: 10,
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              fontFamily: 'var(--font-mono)',
              fontSize: 10,
              color: muted2,
              letterSpacing: '.1em',
            }}
          >
            Fermer ↑
          </button>
        </div>
      )}

      {/* Create form */}
      {showNew && (
        <div
          style={{
            marginBottom: 20,
            padding: 20,
            borderRadius: 12,
            background: surface,
            border: `1px solid ${line2}`,
            display: 'flex',
            gap: 10,
            alignItems: 'center',
          }}
        >
          <KeyRound size={16} style={{ color: muted, flexShrink: 0 }} />
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') create()
            }}
            placeholder="Nom de la clé (ex: production, staging…)"
            autoFocus
            className="ck-input"
            style={{ flex: 1 }}
          />
          <button
            onClick={create}
            disabled={!name.trim() || creating}
            style={{
              padding: '9px 18px',
              borderRadius: 8,
              background: name.trim() ? accent : surface2,
              color: name.trim() ? '#0b0d12' : muted2,
              border: `1px solid ${name.trim() ? accent : line}`,
              cursor: name.trim() ? 'pointer' : 'default',
              fontFamily: 'var(--font-display)',
              fontWeight: 800,
              fontSize: 12,
              letterSpacing: '.04em',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              flexShrink: 0,
              transition: 'all .15s',
            }}
          >
            {creating ? (
              '…'
            ) : (
              <>
                <Plus size={13} /> Générer
              </>
            )}
          </button>
          <button
            onClick={() => {
              setShowNew(false)
              setName('')
            }}
            style={{
              padding: '9px 12px',
              borderRadius: 8,
              background: 'transparent',
              color: muted,
              border: `1px solid ${line}`,
              cursor: 'pointer',
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
            }}
          >
            ✕
          </button>
        </div>
      )}

      {/* Keys list */}
      <div
        style={{
          background: surface,
          border: `1px solid ${line}`,
          borderRadius: 14,
          overflow: 'hidden',
        }}
      >
        {/* Header row */}
        {!isMobile && (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 160px 140px 100px 40px',
              padding: '10px 20px',
              borderBottom: `1px solid ${line}`,
              fontFamily: 'var(--font-mono)',
              fontSize: 9.5,
              letterSpacing: '.14em',
              textTransform: 'uppercase',
              color: muted2,
            }}
          >
            <span>Nom / Préfixe</span>
            <span>Créée le</span>
            <span>Dernière utilisation</span>
            <span>Statut</span>
            <span />
          </div>
        )}

        {keys.map((k, i) => (
          <div
            key={k.id}
            style={{
              display: isMobile ? 'flex' : 'grid',
              gridTemplateColumns: isMobile ? undefined : '1fr 160px 140px 100px 40px',
              flexDirection: isMobile ? 'row' : undefined,
              alignItems: 'center',
              justifyContent: isMobile ? 'space-between' : undefined,
              padding: isMobile ? '12px 16px' : '14px 20px',
              borderBottom: i < keys.length - 1 ? `1px solid ${line}` : 'none',
              transition: 'background .1s',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = surface2)}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          >
            {/* Name + prefix */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 9,
                  flexShrink: 0,
                  background: accent + '14',
                  border: `1px solid ${accent}30`,
                  display: 'grid',
                  placeItems: 'center',
                }}
              >
                <KeyRound size={16} style={{ color: accent }} />
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 13, color: text }}>{k.name}</div>
                <div
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 11,
                    color: muted2,
                    marginTop: 2,
                    letterSpacing: '.04em',
                  }}
                >
                  {k.key_prefix}••••••••••••
                </div>
              </div>
            </div>
            {/* Created */}
            {!isMobile && (
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: muted }}>
                {new Date(k.created_at).toLocaleDateString('fr-FR')}
              </span>
            )}
            {/* Last used */}
            {!isMobile && (
              <span
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 11,
                  color: k.last_used_at ? muted : muted2,
                }}
              >
                {k.last_used_at ? timeSince(k.last_used_at) : 'Jamais utilisée'}
              </span>
            )}
            {/* Status */}
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: emerald }} />
              {!isMobile && (
                <span
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 10,
                    color: emerald,
                    letterSpacing: '.1em',
                  }}
                >
                  Active
                </span>
              )}
            </div>
            {/* Actions */}
            <button
              onClick={() => del(k.id)}
              style={{
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                color: muted2,
                padding: 4,
                borderRadius: 4,
                display: 'grid',
                placeItems: 'center',
                transition: 'color .1s',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.color = rose)}
              onMouseLeave={(e) => (e.currentTarget.style.color = muted2)}
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}

        {keys.length === 0 && (
          <div style={{ padding: '64px 24px', textAlign: 'center' }}>
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: 14,
                margin: '0 auto 16px',
                background: accent + '14',
                border: `1px solid ${accent}30`,
                display: 'grid',
                placeItems: 'center',
              }}
            >
              <KeyRound size={24} style={{ color: accent }} />
            </div>
            <p style={{ fontSize: 14, fontWeight: 700, color: text, marginBottom: 6 }}>
              Aucune clé API
            </p>
            <p style={{ fontSize: 12, color: muted2 }}>
              Créez une clé pour accéder à l'API Kenomi depuis vos outils externes.
            </p>
          </div>
        )}
      </div>

      {/* Docs hint */}
      <div
        style={{
          marginTop: 20,
          padding: '14px 18px',
          borderRadius: 10,
          background: surface2,
          border: `1px solid ${line}`,
          display: 'flex',
          alignItems: 'center',
          gap: 12,
        }}
      >
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: 8,
            flexShrink: 0,
            background: amber + '20',
            border: `1px solid ${amber}30`,
            display: 'grid',
            placeItems: 'center',
            fontFamily: 'var(--font-display)',
            fontWeight: 800,
            fontSize: 14,
            color: amber,
          }}
        >
          ⚡
        </div>
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: text }}>Utilisation des clés API</div>
          <div style={{ fontSize: 11, color: muted, marginTop: 2 }}>
            Ajoutez l'en-tête{' '}
            <code
              style={{
                fontFamily: 'var(--font-mono)',
                background: surface2,
                padding: '1px 5px',
                borderRadius: 3,
                color: accent,
              }}
            >
              Authorization: Bearer ken_…
            </code>{' '}
            à chaque requête vers{' '}
            <code
              style={{
                fontFamily: 'var(--font-mono)',
                background: surface2,
                padding: '1px 5px',
                borderRadius: 3,
                color: accent,
              }}
            >
              lab.kenomi.eu/api/v1/
            </code>
          </div>
        </div>
      </div>
    </CkShell>
  )
}
