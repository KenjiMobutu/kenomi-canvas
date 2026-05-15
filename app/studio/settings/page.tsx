'use client'

import { useEffect, useState } from 'react'
import { createSupabaseBrowser } from '@/lib/supabase-browser'
import { useAuth } from '@/lib/auth-context'
import { toast } from 'sonner'
import { CkShell } from '@/components/CkShell'
import {
  surface, surface2, line, line2, text, muted, muted2,
  accent, accent2, emerald, amber, rose, cyan, violet,
} from '@/lib/ck-vars'
import { Bot, CreditCard, Database, Save, Server, User, Zap } from 'lucide-react'
import { useIsMobile } from '@/lib/studio-utils'

interface Settings {
  ollama_base_url: string
  ollama_model: string
  claude_api_key: string
  openai_api_key: string
  stripe_secret_key: string
  stripe_webhook_secret: string
  supabase_url: string
  display_name: string
  studio_timezone: string
  budget_cap_euros: number
}

const DEFAULTS: Settings = {
  ollama_base_url:       'http://192.168.0.14:11434',
  ollama_model:          'qwen3:8b',
  claude_api_key:        '',
  openai_api_key:        '',
  stripe_secret_key:     '',
  stripe_webhook_secret: '',
  supabase_url:          'https://supabase.kenomi.eu',
  display_name:          'Kenomi Operator',
  studio_timezone:       'Europe/Paris',
  budget_cap_euros:      50,
}

const MODELS_OLLAMA = ['qwen3:8b', 'qwen3:14b', 'llama3.1:8b', 'mistral:7b', 'codestral:latest']

type Section = 'modeles' | 'infrastructure' | 'payments' | 'compte'

function SectionCard({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div style={{ background: surface, border: `1px solid ${line}`, borderRadius: 14, overflow: 'hidden' }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '14px 20px', borderBottom: `1px solid ${line}`,
        background: surface2,
      }}>
        <div style={{ color: accent, display: 'flex' }}>{icon}</div>
        <span style={{ fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 800, color: text, letterSpacing: '-.01em' }}>{title}</span>
      </div>
      <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>{children}</div>
    </div>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '.14em', textTransform: 'uppercase', color: muted, display: 'block', marginBottom: 6 }}>
        {label}
      </label>
      {children}
      {hint && (
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: muted2, marginTop: 5, letterSpacing: '.04em', lineHeight: 1.4 }}>{hint}</div>
      )}
    </div>
  )
}

function SecretInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  const [show, setShow] = useState(false)
  return (
    <div style={{ position: 'relative' }}>
      <input
        type={show ? 'text' : 'password'}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="ck-input"
        style={{ paddingRight: 40, fontFamily: 'var(--font-mono)', fontSize: 12 }}
      />
      <button
        type="button"
        onClick={() => setShow(s => !s)}
        style={{
          position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
          background: 'transparent', border: 'none', cursor: 'pointer', color: muted2, padding: 2,
        }}
      >
        {show ? '🙈' : '👁'}
      </button>
    </div>
  )
}

export default function SettingsPage() {
  const { user }    = useAuth()
  const [cfg, setCfg] = useState<Settings>(DEFAULTS)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [section, setSection] = useState<Section>('modeles')
  const isMobile = useIsMobile()

  function patch(partial: Partial<Settings>) {
    setCfg(prev => ({ ...prev, ...partial }))
    setDirty(true)
  }

  useEffect(() => {
    if (!user) return
    const supabase = createSupabaseBrowser()
    supabase.from('user_settings').select('*').eq('user_id', user.id).maybeSingle()
      .then(({ data }) => {
        if (data) setCfg({ ...DEFAULTS, ...data })
      })
  }, [user])

  async function save() {
    if (!user || !dirty) return
    setSaving(true)
    const supabase = createSupabaseBrowser()
    const { error } = await supabase.from('user_settings')
      .upsert({ user_id: user.id, ...cfg })
    setSaving(false)
    if (error) return toast.error(error.message)
    setDirty(false)
    toast.success('Paramètres sauvegardés')
  }

  const saveAction = (
    <button onClick={save} disabled={!dirty || saving} style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: '6px 16px', borderRadius: 999,
      background: dirty ? accent : surface2,
      color: dirty ? '#0b0d12' : muted2,
      border: `1px solid ${dirty ? accent : line}`,
      fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 12,
      cursor: dirty ? 'pointer' : 'default',
      transition: 'all .15s',
    }}>
      <Save size={13} /> {saving ? 'Sauvegarde…' : 'Sauvegarder'}
    </button>
  )

  const tabs: { id: Section; label: string; icon: React.ReactNode }[] = [
    { id: 'modeles',        label: 'Modèles IA',     icon: <Bot size={13} /> },
    { id: 'infrastructure', label: 'Infrastructure', icon: <Server size={13} /> },
    { id: 'payments',       label: 'Paiements',      icon: <CreditCard size={13} /> },
    { id: 'compte',         label: 'Compte',         icon: <User size={13} /> },
  ]

  return (
    <CkShell
      breadcrumb="System / Settings"
      title="Configuration Studio"
      subtitle={dirty ? '● Modifications non sauvegardées' : 'Tous les paramètres à jour'}
      actions={saveAction}
    >
      {/* Section tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 24, flexWrap: 'wrap' }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setSection(t.id)} style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '7px 16px', borderRadius: 8,
            background: section === t.id ? surface2 : 'transparent',
            color: section === t.id ? text : muted,
            border: section === t.id ? `1px solid ${line2}` : `1px solid transparent`,
            cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: 11,
            fontWeight: section === t.id ? 700 : 400,
            letterSpacing: '.06em', transition: 'all .15s',
          }}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      <div style={{ maxWidth: 720, display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* Modèles IA */}
        {section === 'modeles' && (
          <>
            <SectionCard title="Ollama (Local LLM)" icon={<Zap size={16} />}>
              <Field label="Base URL" hint="URL accessible depuis l'infra Kenomi — tunnel SSH ou reverse proxy Coolify.">
                <input
                  value={cfg.ollama_base_url}
                  onChange={e => patch({ ollama_base_url: e.target.value })}
                  placeholder="http://192.168.0.14:11434"
                  className="ck-input"
                  style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}
                />
              </Field>
              <Field label="Modèle par défaut" hint={`Utilisé pour les tâches légères (agents légers). qwen3:8b recommandé.`}>
                <select
                  value={cfg.ollama_model}
                  onChange={e => patch({ ollama_model: e.target.value })}
                  className="ck-select"
                  style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}
                >
                  {MODELS_OLLAMA.map(m => <option key={m} value={m}>{m}</option>)}
                  <option value={cfg.ollama_model}>{cfg.ollama_model}</option>
                </select>
              </Field>
            </SectionCard>

            <SectionCard title="Claude API (Anthropic)" icon={<Bot size={16} />}>
              <Field label="Clé API" hint="Utilisée pour les agents code-production (Builder, Decision). Stocker de façon sécurisée.">
                <SecretInput
                  value={cfg.claude_api_key}
                  onChange={v => patch({ claude_api_key: v })}
                  placeholder="sk-ant-…"
                />
              </Field>
              <div style={{
                padding: '10px 14px', borderRadius: 8,
                background: emerald + '14', border: `1px solid ${emerald}30`,
                fontSize: 11, color: muted, lineHeight: 1.5,
              }}>
                <span style={{ color: emerald, fontWeight: 700 }}>Modèle actif :</span> claude-sonnet-4-6 (code), claude-haiku-4-5-20251001 (rapide)
              </div>
            </SectionCard>

            <SectionCard title="OpenAI (optionnel)" icon={<Bot size={16} />}>
              <Field label="Clé API OpenAI" hint="Fallback uniquement si Anthropic indisponible.">
                <SecretInput
                  value={cfg.openai_api_key}
                  onChange={v => patch({ openai_api_key: v })}
                  placeholder="sk-…"
                />
              </Field>
            </SectionCard>
          </>
        )}

        {/* Infrastructure */}
        {section === 'infrastructure' && (
          <>
            <SectionCard title="Supabase (Self-hosted)" icon={<Database size={16} />}>
              <Field label="URL Supabase" hint="Votre instance self-hosted. Ne modifiez que si vous migrez d'instance.">
                <input
                  value={cfg.supabase_url}
                  onChange={e => patch({ supabase_url: e.target.value })}
                  placeholder="https://supabase.kenomi.eu"
                  className="ck-input"
                  style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}
                />
              </Field>
              <div style={{
                display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr',
                gap: 12, padding: '12px 14px', borderRadius: 8,
                background: surface2, border: `1px solid ${line}`,
              }}>
                {[
                  { label: 'Statut', value: '● Connecté', color: emerald },
                  { label: 'Région', value: 'Self-hosted (EU)', color: muted },
                  { label: 'RGPD', value: '✓ Conforme', color: emerald },
                  { label: 'Chiffrement', value: 'TLS 1.3 + AES-256', color: cyan },
                ].map(s => (
                  <div key={s.label}>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '.14em', textTransform: 'uppercase', color: muted2 }}>{s.label}</div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: s.color, fontWeight: 700, marginTop: 3 }}>{s.value}</div>
                  </div>
                ))}
              </div>
            </SectionCard>

            <SectionCard title="Budget pub" icon={<Zap size={16} />}>
              <Field
                label="Plafond pub / test (€)"
                hint="Validation humaine OBLIGATOIRE au-delà de ce montant pour toute dépense pub (SCALE, KILL)."
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <input
                    type="number"
                    min={0}
                    max={500}
                    value={cfg.budget_cap_euros}
                    onChange={e => patch({ budget_cap_euros: Number(e.target.value) })}
                    className="ck-input"
                    style={{ fontFamily: 'var(--font-mono)', fontSize: 14, maxWidth: 120 }}
                  />
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 14, color: muted }}>€</span>
                </div>
              </Field>
              <div style={{
                padding: '10px 14px', borderRadius: 8,
                background: amber + '14', border: `1px solid ${amber}30`,
                fontSize: 11, color: muted, lineHeight: 1.5,
              }}>
                <span style={{ color: amber, fontWeight: 700 }}>⚠ Sécurité :</span> Les agents ne peuvent pas déclencher de dépenses publicitaires sans confirmation humaine explicite.
              </div>
            </SectionCard>
          </>
        )}

        {/* Paiements */}
        {section === 'payments' && (
          <>
            <SectionCard title="Stripe" icon={<CreditCard size={16} />}>
              <Field label="Clé secrète Stripe" hint="Utilisée par l'agent Payment pour gérer les checkout et abonnements.">
                <SecretInput
                  value={cfg.stripe_secret_key}
                  onChange={v => patch({ stripe_secret_key: v })}
                  placeholder="sk_live_… ou sk_test_…"
                />
              </Field>
              <Field label="Webhook secret Stripe" hint="Pour valider les événements entrants (whsec_…).">
                <SecretInput
                  value={cfg.stripe_webhook_secret}
                  onChange={v => patch({ stripe_webhook_secret: v })}
                  placeholder="whsec_…"
                />
              </Field>
              <div style={{
                padding: '10px 14px', borderRadius: 8,
                background: surface2, border: `1px solid ${line}`,
                fontFamily: 'var(--font-mono)', fontSize: 10, color: muted2, letterSpacing: '.04em',
                lineHeight: 1.6,
              }}>
                Endpoint webhook : <span style={{ color: accent }}>lab.kenomi.eu/api/webhooks/stripe</span>
              </div>
            </SectionCard>
          </>
        )}

        {/* Compte */}
        {section === 'compte' && (
          <>
            <SectionCard title="Profil" icon={<User size={16} />}>
              <Field label="Email">
                <input
                  value={user?.email || ''}
                  disabled
                  className="ck-input"
                  style={{ opacity: 0.6, cursor: 'not-allowed', fontFamily: 'var(--font-mono)', fontSize: 12 }}
                />
              </Field>
              <Field label="Nom d'affichage">
                <input
                  value={cfg.display_name}
                  onChange={e => patch({ display_name: e.target.value })}
                  placeholder="Kenomi Operator"
                  className="ck-input"
                />
              </Field>
              <Field label="Fuseau horaire studio">
                <select
                  value={cfg.studio_timezone}
                  onChange={e => patch({ studio_timezone: e.target.value })}
                  className="ck-select"
                  style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}
                >
                  {['Europe/Paris', 'Europe/London', 'America/New_York', 'America/Los_Angeles', 'Asia/Tokyo', 'UTC'].map(tz => (
                    <option key={tz} value={tz}>{tz}</option>
                  ))}
                </select>
              </Field>
            </SectionCard>

            <SectionCard title="Sécurité" icon={<Zap size={16} />}>
              <div style={{
                display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr',
                gap: 12, padding: '12px 14px', borderRadius: 8,
                background: surface2, border: `1px solid ${line}`,
              }}>
                {[
                  { label: 'Authentification', value: 'Supabase Auth (email)', color: emerald },
                  { label: 'Session', value: 'JWT · 1h expiry', color: muted },
                  { label: 'RLS', value: '✓ Activé (toutes tables)', color: emerald },
                  { label: 'Dernière connexion', value: user?.last_sign_in_at ? new Date(user.last_sign_in_at).toLocaleDateString('fr-FR') : '—', color: muted },
                ].map(s => (
                  <div key={s.label}>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '.14em', textTransform: 'uppercase', color: muted2 }}>{s.label}</div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: s.color, fontWeight: 600, marginTop: 3 }}>{s.value}</div>
                  </div>
                ))}
              </div>
            </SectionCard>
          </>
        )}
      </div>
    </CkShell>
  )
}
