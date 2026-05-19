'use client'

import { useEffect, useState } from 'react'
import { createSupabaseBrowser } from '@/lib/supabase-browser'
import { useAuth } from '@/lib/auth-context'
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
  emerald,
  amber,
  rose,
  cyan,
} from '@/lib/ck-vars'
import { Bot, CreditCard, Database, Download, Save, Server, Trash2, User, Zap } from 'lucide-react'
import { useIsMobile } from '@/lib/studio-utils'
import {
  DEFAULT_USER_SETTINGS,
  isMissingInfraSettingsColumnError,
  normalizeUserSettings,
  omitInfraSettings,
  type UserSettings,
} from '@/lib/user-settings-normalization'

const MODELS_OLLAMA = ['qwen3:8b', 'qwen3:14b', 'llama3.1:8b', 'mistral:7b', 'codestral:latest']

type Section = 'modeles' | 'infrastructure' | 'payments' | 'compte'
type InfraSettingsDiagnostics = {
  checkedAt: string
  runtime: {
    environment: string
    sourceCommit: string
    commitShort: string
  }
  summary: {
    ok: boolean
    checksOk: number
    checksTotal: number
  }
  services: {
    id: string
    label: string
    status: 'ok' | 'degraded' | 'down'
    source: 'settings' | 'env' | 'runtime'
    urlLabel: string
    latencyMs: number
    lastError: string | null
    repairAction: string
  }[]
  proxmox: {
    id: string
    label: string
    status: 'ok' | 'degraded' | 'down'
    source: 'settings' | 'env' | 'runtime'
    urlLabel: string
    latencyMs: number
    lastError: string | null
    repairAction: string
    detail?: string
  }
}

function SectionCard({
  title,
  icon,
  children,
}: {
  title: string
  icon: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div
      style={{
        background: surface,
        border: `1px solid ${line}`,
        borderRadius: 14,
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '14px 20px',
          borderBottom: `1px solid ${line}`,
          background: surface2,
        }}
      >
        <div style={{ color: accent, display: 'flex' }}>{icon}</div>
        <span
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 14,
            fontWeight: 800,
            color: text,
            letterSpacing: '-.01em',
          }}
        >
          {title}
        </span>
      </div>
      <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
        {children}
      </div>
    </div>
  )
}

function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div>
      <label
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 10,
          letterSpacing: '.14em',
          textTransform: 'uppercase',
          color: muted,
          display: 'block',
          marginBottom: 6,
        }}
      >
        {label}
      </label>
      {children}
      {hint && (
        <div
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
            color: muted2,
            marginTop: 5,
            letterSpacing: '.04em',
            lineHeight: 1.4,
          }}
        >
          {hint}
        </div>
      )}
    </div>
  )
}

function SecretInput({
  value,
  onChange,
  placeholder,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
}) {
  const [show, setShow] = useState(false)
  return (
    <div style={{ position: 'relative' }}>
      <input
        type={show ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="ck-input"
        style={{ paddingRight: 40, fontFamily: 'var(--font-mono)', fontSize: 12 }}
      />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        style={{
          position: 'absolute',
          right: 10,
          top: '50%',
          transform: 'translateY(-50%)',
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          color: muted2,
          padding: 2,
        }}
      >
        {show ? '🙈' : '👁'}
      </button>
    </div>
  )
}

function InfraSettingsCheck({
  diagnostics,
  loading,
  error,
  onCheck,
}: {
  diagnostics: InfraSettingsDiagnostics | null
  loading: boolean
  error: string | null
  onCheck: () => void
}) {
  const rows = diagnostics ? [...diagnostics.services, diagnostics.proxmox] : []
  const summaryColor = diagnostics?.summary.ok ? emerald : diagnostics ? amber : muted

  return (
    <SectionCard title="Vérification endpoints" icon={<Server size={16} />}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 10,
              color: muted2,
              letterSpacing: '.12em',
              textTransform: 'uppercase',
            }}
          >
            Supabase · VM Coolify
          </div>
          <div style={{ fontSize: 12, color: muted, marginTop: 4 }}>
            Instance self-hosted vérifiée depuis le serveur Studio.
          </div>
        </div>
        <button
          type="button"
          onClick={onCheck}
          disabled={loading}
          style={{
            minHeight: 32,
            padding: '6px 12px',
            borderRadius: 7,
            border: `1px solid ${cyan}35`,
            background: loading ? surface2 : `${cyan}12`,
            color: loading ? muted2 : cyan,
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
            letterSpacing: '.1em',
            textTransform: 'uppercase',
            cursor: loading ? 'wait' : 'pointer',
          }}
        >
          {loading ? 'Check...' : 'Tester'}
        </button>
      </div>

      {error && (
        <div
          style={{
            padding: '9px 10px',
            borderRadius: 7,
            background: `${rose}12`,
            border: `1px solid ${rose}30`,
            color: rose,
            fontFamily: 'var(--font-mono)',
            fontSize: 10.5,
          }}
        >
          {error}
        </div>
      )}

      {diagnostics && (
        <>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr 1fr',
              gap: 8,
            }}
          >
            {[
              {
                label: 'Checks',
                value: `${diagnostics.summary.checksOk}/${diagnostics.summary.checksTotal}`,
                color: summaryColor,
              },
              {
                label: 'Runtime',
                value: diagnostics.runtime.environment,
                color: cyan,
              },
              {
                label: 'Source',
                value: diagnostics.runtime.commitShort,
                color: muted,
              },
            ].map((item) => (
              <div
                key={item.label}
                style={{
                  background: surface2,
                  border: `1px solid ${line}`,
                  borderRadius: 8,
                  padding: '8px 10px',
                  minWidth: 0,
                }}
              >
                <div
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 8.5,
                    color: muted2,
                    letterSpacing: '.14em',
                    textTransform: 'uppercase',
                  }}
                >
                  {item.label}
                </div>
                <div
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 10.5,
                    color: item.color,
                    marginTop: 3,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {item.value}
                </div>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {rows.map((row) => {
              const color = row.status === 'ok' ? emerald : row.status === 'degraded' ? amber : rose
              return (
                <div
                  key={row.id}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '92px 1fr 72px',
                    gap: 8,
                    alignItems: 'center',
                    padding: '8px 10px',
                    borderRadius: 8,
                    background: surface2,
                    border: `1px solid ${line}`,
                  }}
                >
                  <span style={{ color: text, fontSize: 11, fontWeight: 800 }}>{row.label}</span>
                  <span
                    style={{
                      color: row.lastError ? rose : muted2,
                      fontFamily: 'var(--font-mono)',
                      fontSize: 9.5,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                    title={row.lastError ?? row.urlLabel}
                  >
                    {row.lastError ?? `${row.source} · ${row.urlLabel}`}
                  </span>
                  <span
                    style={{
                      color,
                      fontFamily: 'var(--font-mono)',
                      fontSize: 9,
                      letterSpacing: '.1em',
                      textTransform: 'uppercase',
                    }}
                  >
                    {row.status}
                  </span>
                </div>
              )
            })}
          </div>
        </>
      )}
    </SectionCard>
  )
}

export default function SettingsPage() {
  const { user } = useAuth()
  const [cfg, setCfg] = useState<UserSettings>(DEFAULT_USER_SETTINGS)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [section, setSection] = useState<Section>('modeles')
  const isMobile = useIsMobile()
  const [exportLoading, setExportLoading] = useState(false)
  const [deleteStep, setDeleteStep] = useState<'idle' | 'confirm' | 'deleting'>('idle')
  const [deleteToken, setDeleteToken] = useState<string | null>(null)
  const [infraDiagnostics, setInfraDiagnostics] = useState<InfraSettingsDiagnostics | null>(null)
  const [infraDiagnosticsLoading, setInfraDiagnosticsLoading] = useState(false)
  const [infraDiagnosticsError, setInfraDiagnosticsError] = useState<string | null>(null)

  function patch(partial: Partial<UserSettings>) {
    setCfg((prev) => ({ ...prev, ...partial }))
    setDirty(true)
  }

  useEffect(() => {
    if (!user) return
    const supabase = createSupabaseBrowser()
    supabase
      .from('user_settings')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setCfg(normalizeUserSettings(data))
      })
  }, [user])

  async function exportData() {
    setExportLoading(true)
    try {
      const res = await fetch('/api/studio/privacy/export')
      if (!res.ok) {
        toast.error("Erreur lors de l'export")
        return
      }
      const data = await res.json()
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `kenomi-data-${new Date().toISOString().slice(0, 10)}.json`
      a.click()
      URL.revokeObjectURL(url)
      toast.success('Export téléchargé')
    } finally {
      setExportLoading(false)
    }
  }

  async function requestDeletion() {
    setDeleteStep('confirm')
    const res = await fetch('/api/studio/privacy/delete', { method: 'POST' })
    if (!res.ok) {
      toast.error('Erreur lors de la demande de suppression')
      setDeleteStep('idle')
      return
    }
    const { token } = await res.json()
    setDeleteToken(token)
  }

  async function confirmDeletion() {
    if (!deleteToken) return
    setDeleteStep('deleting')
    const res = await fetch('/api/studio/privacy/delete', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: deleteToken }),
    })
    if (!res.ok) {
      const { error } = await res.json().catch(() => ({ error: 'Erreur inconnue' }))
      toast.error(error || 'Erreur lors de la suppression')
      setDeleteStep('idle')
      setDeleteToken(null)
      return
    }
    toast.success('Compte supprimé. Redirection…')
    setTimeout(() => {
      window.location.href = '/'
    }, 2000)
  }

  async function checkInfrastructureSettings() {
    setInfraDiagnosticsLoading(true)
    setInfraDiagnosticsError(null)
    try {
      const res = await fetch('/api/studio/infra/diagnostics')
      const data = (await res.json().catch(() => null)) as InfraSettingsDiagnostics | null
      if (!res.ok && !data) {
        setInfraDiagnosticsError(`Diagnostic indisponible · HTTP ${res.status}`)
        return
      }
      if (data) {
        setInfraDiagnostics(data)
        toast.success(`Infra vérifiée · ${data.summary.checksOk}/${data.summary.checksTotal}`)
        return
      }
      setInfraDiagnosticsError('Diagnostic indisponible')
    } catch {
      setInfraDiagnosticsError('Diagnostic indisponible · requête réseau échouée')
    } finally {
      setInfraDiagnosticsLoading(false)
    }
  }

  async function save() {
    if (!user || !dirty) return
    setSaving(true)
    const supabase = createSupabaseBrowser()
    const { error } = await supabase.from('user_settings').upsert({ user_id: user.id, ...cfg })
    if (isMissingInfraSettingsColumnError(error)) {
      const { error: fallbackError } = await supabase
        .from('user_settings')
        .upsert({ user_id: user.id, ...omitInfraSettings(cfg) })
      setSaving(false)
      if (fallbackError) return toast.error(fallbackError.message)
      setDirty(false)
      toast.warning('Paramètres sauvegardés · migration infra requise pour les nouveaux services')
      return
    }
    setSaving(false)
    if (error) return toast.error(error.message)
    setDirty(false)
    toast.success('Paramètres sauvegardés')
  }

  const saveAction = (
    <button
      onClick={save}
      disabled={!dirty || saving}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '6px 16px',
        borderRadius: 999,
        background: dirty ? accent : surface2,
        color: dirty ? '#0b0d12' : muted2,
        border: `1px solid ${dirty ? accent : line}`,
        fontFamily: 'var(--font-display)',
        fontWeight: 800,
        fontSize: 12,
        cursor: dirty ? 'pointer' : 'default',
        transition: 'all .15s',
      }}
    >
      <Save size={13} /> {saving ? 'Sauvegarde…' : 'Sauvegarder'}
    </button>
  )

  const tabs: { id: Section; label: string; icon: React.ReactNode }[] = [
    { id: 'modeles', label: 'Modèles IA', icon: <Bot size={13} /> },
    { id: 'infrastructure', label: 'Infrastructure', icon: <Server size={13} /> },
    { id: 'payments', label: 'Paiements', icon: <CreditCard size={13} /> },
    { id: 'compte', label: 'Compte', icon: <User size={13} /> },
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
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setSection(t.id)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '7px 16px',
              borderRadius: 8,
              background: section === t.id ? surface2 : 'transparent',
              color: section === t.id ? text : muted,
              border: section === t.id ? `1px solid ${line2}` : `1px solid transparent`,
              cursor: 'pointer',
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              fontWeight: section === t.id ? 700 : 400,
              letterSpacing: '.06em',
              transition: 'all .15s',
            }}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      <div style={{ maxWidth: 720, display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Modèles IA */}
        {section === 'modeles' && (
          <>
            <SectionCard title="Ollama (Local LLM)" icon={<Zap size={16} />}>
              <Field
                label="Base URL"
                hint="URL accessible depuis l'infra Kenomi — tunnel SSH ou reverse proxy Coolify."
              >
                <input
                  value={cfg.ollama_base_url}
                  onChange={(e) => patch({ ollama_base_url: e.target.value })}
                  placeholder="http://192.168.0.14:11434"
                  className="ck-input"
                  style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}
                />
              </Field>
              <Field
                label="Modèle par défaut"
                hint={`Utilisé pour les tâches légères (agents légers). qwen3:8b recommandé.`}
              >
                <select
                  value={cfg.ollama_model}
                  onChange={(e) => patch({ ollama_model: e.target.value })}
                  className="ck-select"
                  style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}
                >
                  {MODELS_OLLAMA.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                  <option value={cfg.ollama_model}>{cfg.ollama_model}</option>
                </select>
              </Field>
            </SectionCard>

            <SectionCard title="n8n — Automations" icon={<Zap size={16} />}>
              <Field
                label="Base URL"
                hint="URL de votre instance n8n (self-hosted ou cloud). Ex: http://192.168.0.19:5678"
              >
                <input
                  value={cfg.n8n_base_url}
                  onChange={(e) => patch({ n8n_base_url: e.target.value })}
                  placeholder="http://192.168.0.19:5678"
                  className="ck-input"
                  style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}
                />
              </Field>
              <Field
                label="API Key"
                hint="Clé API n8n pour déclencher les workflows depuis le studio."
              >
                <SecretInput
                  value={cfg.n8n_api_key}
                  onChange={(v) => patch({ n8n_api_key: v })}
                  placeholder="n8n_api_key_…"
                />
              </Field>
            </SectionCard>

            <SectionCard title="Claude API (Anthropic)" icon={<Bot size={16} />}>
              <Field
                label="Clé API"
                hint="Utilisée pour les agents code-production (Builder, Decision). Stocker de façon sécurisée."
              >
                <SecretInput
                  value={cfg.claude_api_key}
                  onChange={(v) => patch({ claude_api_key: v })}
                  placeholder="sk-ant-…"
                />
              </Field>
              <div
                style={{
                  padding: '10px 14px',
                  borderRadius: 8,
                  background: emerald + '14',
                  border: `1px solid ${emerald}30`,
                  fontSize: 11,
                  color: muted,
                  lineHeight: 1.5,
                }}
              >
                <span style={{ color: emerald, fontWeight: 700 }}>Modèle actif :</span>{' '}
                claude-sonnet-4-6 (code), claude-haiku-4-5-20251001 (rapide)
              </div>
            </SectionCard>

            <SectionCard title="OpenAI (optionnel)" icon={<Bot size={16} />}>
              <Field label="Clé API OpenAI" hint="Fallback uniquement si Anthropic indisponible.">
                <SecretInput
                  value={cfg.openai_api_key}
                  onChange={(v) => patch({ openai_api_key: v })}
                  placeholder="sk-…"
                />
              </Field>
            </SectionCard>
          </>
        )}

        {/* Infrastructure */}
        {section === 'infrastructure' && (
          <>
            <InfraSettingsCheck
              diagnostics={infraDiagnostics}
              loading={infraDiagnosticsLoading}
              error={infraDiagnosticsError}
              onCheck={checkInfrastructureSettings}
            />

            <SectionCard title="Supabase (Self-hosted)" icon={<Database size={16} />}>
              <Field
                label="URL Supabase"
                hint="Votre instance self-hosted. Ne modifiez que si vous migrez d'instance."
              >
                <input
                  value={cfg.supabase_url}
                  onChange={(e) => patch({ supabase_url: e.target.value })}
                  placeholder="https://supabase.kenomi.eu"
                  className="ck-input"
                  style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}
                />
              </Field>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr',
                  gap: 12,
                  padding: '12px 14px',
                  borderRadius: 8,
                  background: surface2,
                  border: `1px solid ${line}`,
                }}
              >
                {[
                  { label: 'Statut', value: '● Connecté', color: emerald },
                  { label: 'Région', value: 'Self-hosted (EU)', color: muted },
                  { label: 'RGPD', value: '✓ Conforme', color: emerald },
                  { label: 'Chiffrement', value: 'TLS 1.3 + AES-256', color: cyan },
                ].map((s) => (
                  <div key={s.label}>
                    <div
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: 9,
                        letterSpacing: '.14em',
                        textTransform: 'uppercase',
                        color: muted2,
                      }}
                    >
                      {s.label}
                    </div>
                    <div
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: 12,
                        color: s.color,
                        fontWeight: 700,
                        marginTop: 3,
                      }}
                    >
                      {s.value}
                    </div>
                  </div>
                ))}
              </div>
            </SectionCard>

            <SectionCard title="Proxmox VE" icon={<Server size={16} />}>
              <Field
                label="Base URL Proxmox"
                hint="Adresse du cluster Proxmox utilisée comme repère opérationnel. Les tokens restent côté serveur."
              >
                <input
                  value={cfg.proxmox_base_url}
                  onChange={(e) => patch({ proxmox_base_url: e.target.value })}
                  placeholder="https://192.168.0.10:8006"
                  className="ck-input"
                  style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}
                />
              </Field>
              <Field
                label="Nœud par défaut"
                hint="Nom du node Proxmox interrogé pour les métriques VM/LXC."
              >
                <input
                  value={cfg.proxmox_node}
                  onChange={(e) => patch({ proxmox_node: e.target.value })}
                  placeholder="proxmox"
                  className="ck-input"
                  style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}
                />
              </Field>
            </SectionCard>

            <SectionCard title="Coolify — Déploiements" icon={<Server size={16} />}>
              <Field
                label="URL Coolify"
                hint="Console de déploiement self-hosted. Le token API reste dans l'environnement serveur."
              >
                <input
                  value={cfg.coolify_url}
                  onChange={(e) => patch({ coolify_url: e.target.value })}
                  placeholder="http://192.168.0.19:8000"
                  className="ck-input"
                  style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}
                />
              </Field>
              <div
                style={{
                  padding: '10px 14px',
                  borderRadius: 8,
                  background: emerald + '14',
                  border: `1px solid ${emerald}30`,
                  fontSize: 11,
                  color: muted,
                  lineHeight: 1.5,
                }}
              >
                <span style={{ color: emerald, fontWeight: 700 }}>Secret attendu :</span>{' '}
                COOLIFY_TOKEN dans l&apos;environnement serveur, pas dans le formulaire navigateur.
              </div>
            </SectionCard>

            <SectionCard title="Edge & observabilité" icon={<Server size={16} />}>
              <Field label="Nginx Proxy Manager" hint="Reverse proxy et certificats SSL.">
                <input
                  value={cfg.nginx_pm_url}
                  onChange={(e) => patch({ nginx_pm_url: e.target.value })}
                  placeholder="https://npm.tailnet.local"
                  className="ck-input"
                  style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}
                />
              </Field>
              <Field label="Uptime Kuma" hint="Monitoring et pages de statut.">
                <input
                  value={cfg.uptime_kuma_url}
                  onChange={(e) => patch({ uptime_kuma_url: e.target.value })}
                  placeholder="https://uptime.tailnet.local"
                  className="ck-input"
                  style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}
                />
              </Field>
              <Field label="Vaultwarden" hint="Coffre d'identifiants opérationnels.">
                <input
                  value={cfg.vaultwarden_url}
                  onChange={(e) => patch({ vaultwarden_url: e.target.value })}
                  placeholder="https://vault.tailnet.local"
                  className="ck-input"
                  style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}
                />
              </Field>
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
                    onChange={(e) => patch({ budget_cap_euros: Number(e.target.value) })}
                    className="ck-input"
                    style={{ fontFamily: 'var(--font-mono)', fontSize: 14, maxWidth: 120 }}
                  />
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 14, color: muted }}>
                    €
                  </span>
                </div>
              </Field>
              <div
                style={{
                  padding: '10px 14px',
                  borderRadius: 8,
                  background: amber + '14',
                  border: `1px solid ${amber}30`,
                  fontSize: 11,
                  color: muted,
                  lineHeight: 1.5,
                }}
              >
                <span style={{ color: amber, fontWeight: 700 }}>⚠ Sécurité :</span> Les agents ne
                peuvent pas déclencher de dépenses publicitaires sans confirmation humaine
                explicite.
              </div>
            </SectionCard>
          </>
        )}

        {/* Paiements */}
        {section === 'payments' && (
          <>
            <SectionCard title="Stripe" icon={<CreditCard size={16} />}>
              <Field
                label="Clé secrète Stripe"
                hint="Utilisée par l'agent Payment pour gérer les checkout et abonnements."
              >
                <SecretInput
                  value={cfg.stripe_secret_key}
                  onChange={(v) => patch({ stripe_secret_key: v })}
                  placeholder="sk_live_… ou sk_test_…"
                />
              </Field>
              <Field
                label="Webhook secret Stripe"
                hint="Pour valider les événements entrants (whsec_…)."
              >
                <SecretInput
                  value={cfg.stripe_webhook_secret}
                  onChange={(v) => patch({ stripe_webhook_secret: v })}
                  placeholder="whsec_…"
                />
              </Field>
              <div
                style={{
                  padding: '10px 14px',
                  borderRadius: 8,
                  background: surface2,
                  border: `1px solid ${line}`,
                  fontFamily: 'var(--font-mono)',
                  fontSize: 10,
                  color: muted2,
                  letterSpacing: '.04em',
                  lineHeight: 1.6,
                }}
              >
                Endpoint webhook :{' '}
                <span style={{ color: accent }}>lab.kenomi.eu/api/stripe/webhook</span>
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
                  style={{
                    opacity: 0.6,
                    cursor: 'not-allowed',
                    fontFamily: 'var(--font-mono)',
                    fontSize: 12,
                  }}
                />
              </Field>
              <Field label="Nom d'affichage">
                <input
                  value={cfg.display_name}
                  onChange={(e) => patch({ display_name: e.target.value })}
                  placeholder="Kenomi Operator"
                  className="ck-input"
                />
              </Field>
              <Field label="Fuseau horaire studio">
                <select
                  value={cfg.studio_timezone}
                  onChange={(e) => patch({ studio_timezone: e.target.value })}
                  className="ck-select"
                  style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}
                >
                  {[
                    'Europe/Paris',
                    'Europe/London',
                    'America/New_York',
                    'America/Los_Angeles',
                    'Asia/Tokyo',
                    'UTC',
                  ].map((tz) => (
                    <option key={tz} value={tz}>
                      {tz}
                    </option>
                  ))}
                </select>
              </Field>
            </SectionCard>

            <SectionCard title="Sécurité" icon={<Zap size={16} />}>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr',
                  gap: 12,
                  padding: '12px 14px',
                  borderRadius: 8,
                  background: surface2,
                  border: `1px solid ${line}`,
                }}
              >
                {[
                  { label: 'Authentification', value: 'Supabase Auth (email)', color: emerald },
                  { label: 'Session', value: 'JWT · 1h expiry', color: muted },
                  { label: 'RLS', value: '✓ Activé (toutes tables)', color: emerald },
                  {
                    label: 'Dernière connexion',
                    value: user?.last_sign_in_at
                      ? new Date(user.last_sign_in_at).toLocaleDateString('fr-FR')
                      : '—',
                    color: muted,
                  },
                ].map((s) => (
                  <div key={s.label}>
                    <div
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: 9,
                        letterSpacing: '.14em',
                        textTransform: 'uppercase',
                        color: muted2,
                      }}
                    >
                      {s.label}
                    </div>
                    <div
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: 11,
                        color: s.color,
                        fontWeight: 600,
                        marginTop: 3,
                      }}
                    >
                      {s.value}
                    </div>
                  </div>
                ))}
              </div>
            </SectionCard>

            <SectionCard title="Données & Vie privée" icon={<Database size={16} />}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div>
                  <div
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: 10,
                      letterSpacing: '.14em',
                      textTransform: 'uppercase',
                      color: muted,
                      marginBottom: 6,
                    }}
                  >
                    Exporter mes données
                  </div>
                  <div
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: 11,
                      color: muted2,
                      marginBottom: 10,
                      lineHeight: 1.5,
                    }}
                  >
                    Télécharge toutes vos données (ventures, conversations, agents, automations) au
                    format JSON.
                  </div>
                  <button
                    onClick={exportData}
                    disabled={exportLoading}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '7px 16px',
                      borderRadius: 8,
                      background: surface2,
                      color: text,
                      border: `1px solid ${line2}`,
                      fontFamily: 'var(--font-display)',
                      fontWeight: 700,
                      fontSize: 12,
                      cursor: exportLoading ? 'default' : 'pointer',
                      opacity: exportLoading ? 0.6 : 1,
                    }}
                  >
                    <Download size={13} />{' '}
                    {exportLoading ? 'Export en cours…' : 'Exporter mes données'}
                  </button>
                </div>

                <div style={{ borderTop: `1px solid ${line}`, paddingTop: 12 }}>
                  <div
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: 10,
                      letterSpacing: '.14em',
                      textTransform: 'uppercase',
                      color: rose,
                      marginBottom: 6,
                    }}
                  >
                    Supprimer mon compte
                  </div>
                  <div
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: 11,
                      color: muted2,
                      marginBottom: 10,
                      lineHeight: 1.5,
                    }}
                  >
                    Supprime définitivement toutes vos données et votre compte. Action irréversible.
                  </div>

                  {deleteStep === 'idle' && (
                    <button
                      onClick={requestDeletion}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        padding: '7px 16px',
                        borderRadius: 8,
                        background: rose + '14',
                        color: rose,
                        border: `1px solid ${rose}40`,
                        fontFamily: 'var(--font-display)',
                        fontWeight: 700,
                        fontSize: 12,
                        cursor: 'pointer',
                      }}
                    >
                      <Trash2 size={13} /> Supprimer mon compte
                    </button>
                  )}

                  {deleteStep === 'confirm' && !deleteToken && (
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: muted2 }}>
                      Génération du token…
                    </div>
                  )}

                  {deleteStep === 'confirm' && deleteToken && (
                    <div
                      style={{
                        padding: '14px',
                        borderRadius: 8,
                        background: rose + '10',
                        border: `1px solid ${rose}30`,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 10,
                      }}
                    >
                      <div
                        style={{
                          fontFamily: 'var(--font-display)',
                          fontSize: 13,
                          fontWeight: 800,
                          color: rose,
                        }}
                      >
                        Confirmer la suppression ?
                      </div>
                      <div
                        style={{
                          fontFamily: 'var(--font-mono)',
                          fontSize: 11,
                          color: muted2,
                          lineHeight: 1.5,
                        }}
                      >
                        Cette action est irréversible. Toutes vos données seront effacées (ventures,
                        agents, conversations, automations, paramètres). Token valide 15 minutes.
                      </div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button
                          onClick={confirmDeletion}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 6,
                            padding: '7px 16px',
                            borderRadius: 8,
                            background: rose,
                            color: '#fff',
                            border: 'none',
                            fontFamily: 'var(--font-display)',
                            fontWeight: 800,
                            fontSize: 12,
                            cursor: 'pointer',
                          }}
                        >
                          <Trash2 size={13} /> Confirmer la suppression
                        </button>
                        <button
                          onClick={() => {
                            setDeleteStep('idle')
                            setDeleteToken(null)
                          }}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 6,
                            padding: '7px 16px',
                            borderRadius: 8,
                            background: 'transparent',
                            color: muted,
                            border: `1px solid ${line}`,
                            fontFamily: 'var(--font-display)',
                            fontWeight: 700,
                            fontSize: 12,
                            cursor: 'pointer',
                          }}
                        >
                          Annuler
                        </button>
                      </div>
                    </div>
                  )}

                  {deleteStep === 'deleting' && (
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: rose }}>
                      Suppression en cours…
                    </div>
                  )}
                </div>
              </div>
            </SectionCard>
          </>
        )}
      </div>
    </CkShell>
  )
}
