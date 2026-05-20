/**
 * lib/ops/ops-health.ts
 * Agrège 4 signaux de santé opérationnelle pour la carte Ops Health du cockpit.
 *
 * Pure function : on lui passe les compteurs déjà collectés, elle décide
 * tone (ok | warn | crit) et message lisible par humain.
 *
 * Couvre la recommandation P1 de l'audit 2026-05-20.
 */

export type OpsHealthTone = 'ok' | 'warn' | 'crit' | 'muted'

export interface OpsHealthSignal {
  /** Identifiant stable côté UI. */
  id: 'jobs_failed_24h' | 'approvals_pending' | 'last_deploy' | 'disk_root' | 'revenue_today'
  /** Libellé court (max 24 chars). */
  label: string
  /** Valeur principale formatée (ex: "3 failed", "12h ago", "89%"). */
  value: string
  /** Sévérité visuelle. */
  tone: OpsHealthTone
  /** Lien de réparation suggéré. */
  href: string
  /** Détail human-readable optionnel pour tooltip / sub-text. */
  detail?: string
}

export interface OpsHealthSummary {
  /** Mode global : 'attention' si au moins un signal en warn|crit, sinon 'calm'. */
  mode: 'calm' | 'attention'
  /** Indique si les 5 signaux ont au moins une valeur fraîche. */
  signalsFresh: boolean
  signals: OpsHealthSignal[]
}

export interface OpsHealthInput {
  jobsFailed24h: number
  approvalsPending: number
  lastDeployCommit: string | null
  lastDeployStatus: 'ok' | 'degraded' | 'down' | null
  /** ISO date. */
  lastDeployAt: string | null
  /** % 0-100, null si Proxmox indisponible. */
  diskRootPct: number | null
  paymentsCompletedToday: number
  ventureEventsToday: number
  /** Date courante pour calculs (test-friendly). */
  now?: Date
}

function formatRelativeAge(iso: string | null, now: Date): string {
  if (!iso) return 'inconnu'
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return 'inconnu'
  const diffMs = now.getTime() - t
  const minutes = Math.floor(diffMs / 60_000)
  if (minutes < 1) return "à l'instant"
  if (minutes < 60) return `il y a ${minutes} min`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `il y a ${hours} h`
  const days = Math.floor(hours / 24)
  return `il y a ${days} j`
}

export function buildOpsHealthSummary(input: OpsHealthInput): OpsHealthSummary {
  const now = input.now ?? new Date()

  // 1. Jobs failed 24h
  const jobsFailedSignal: OpsHealthSignal = {
    id: 'jobs_failed_24h',
    label: 'Jobs failed 24h',
    value: input.jobsFailed24h === 0 ? '0' : `${input.jobsFailed24h} failed`,
    tone: input.jobsFailed24h === 0 ? 'ok' : input.jobsFailed24h >= 5 ? 'crit' : 'warn',
    href: '/studio/agents',
    detail:
      input.jobsFailed24h === 0
        ? 'Aucun échec autonomy_jobs sur 24h'
        : `${input.jobsFailed24h} job${input.jobsFailed24h > 1 ? 's' : ''} failed dans autonomy_jobs`,
  }

  // 2. Approvals pending
  const approvalsSignal: OpsHealthSignal = {
    id: 'approvals_pending',
    label: 'Approvals pending',
    value: String(input.approvalsPending),
    tone: input.approvalsPending === 0 ? 'ok' : input.approvalsPending >= 5 ? 'crit' : 'warn',
    href: '/studio/agents',
    detail:
      input.approvalsPending === 0
        ? 'Aucun gate humain à traiter'
        : `${input.approvalsPending} approval${input.approvalsPending > 1 ? 's' : ''} en attente`,
  }

  // 3. Last deploy — commit obligatoire, date optionnelle (Coolify ne l'expose
  //    pas toujours). On dégrade en tone selon le status services.
  let lastDeploySignal: OpsHealthSignal
  if (!input.lastDeployCommit) {
    lastDeploySignal = {
      id: 'last_deploy',
      label: 'Dernier deploy',
      value: 'inconnu',
      tone: 'muted',
      href: '/studio/infrastructure',
      detail: 'Aucune info de déploiement disponible',
    }
  } else {
    const ageLabel = input.lastDeployAt ? ` · ${formatRelativeAge(input.lastDeployAt, now)}` : ''
    const stale =
      input.lastDeployAt &&
      now.getTime() - new Date(input.lastDeployAt).getTime() > 7 * 24 * 60 * 60 * 1000
    const tone: OpsHealthTone =
      input.lastDeployStatus === 'down'
        ? 'crit'
        : input.lastDeployStatus === 'degraded' || stale
          ? 'warn'
          : input.lastDeployStatus === 'ok'
            ? 'ok'
            : 'muted'
    lastDeploySignal = {
      id: 'last_deploy',
      label: 'Dernier deploy',
      value: `${input.lastDeployCommit.slice(0, 7)}${ageLabel}`,
      tone,
      href: '/studio/infrastructure',
      detail: `Status: ${input.lastDeployStatus ?? 'inconnu'}`,
    }
  }

  // 4. Disque root (Proxmox)
  let diskSignal: OpsHealthSignal
  if (input.diskRootPct === null) {
    diskSignal = {
      id: 'disk_root',
      label: 'Disque /',
      value: 'n/a',
      tone: 'muted',
      href: '/studio/infrastructure',
      detail: 'Proxmox indisponible',
    }
  } else {
    const tone: OpsHealthTone =
      input.diskRootPct >= 90 ? 'crit' : input.diskRootPct >= 80 ? 'warn' : 'ok'
    diskSignal = {
      id: 'disk_root',
      label: 'Disque /',
      value: `${input.diskRootPct}%`,
      tone,
      href: '/studio/infrastructure',
      detail:
        input.diskRootPct >= 90
          ? "Critique: libérer de l'espace ou étendre le volume"
          : input.diskRootPct >= 80
            ? 'Surveillance recommandée'
            : 'OK',
    }
  }

  // 5. Revenue today
  const revenueValue =
    input.paymentsCompletedToday === 0 && input.ventureEventsToday === 0
      ? '0 events'
      : `${input.paymentsCompletedToday}€ · ${input.ventureEventsToday} ev`
  const revenueSignal: OpsHealthSignal = {
    id: 'revenue_today',
    label: 'Revenue today',
    value: revenueValue,
    tone: input.paymentsCompletedToday > 0 ? 'ok' : input.ventureEventsToday > 0 ? 'warn' : 'muted',
    href: '/studio/revenue',
    detail:
      input.paymentsCompletedToday > 0
        ? `${input.paymentsCompletedToday} paiement(s) complété(s) aujourd'hui`
        : input.ventureEventsToday > 0
          ? `${input.ventureEventsToday} venture_events captés, aucun paiement`
          : "Aucune trace business aujourd'hui",
  }

  const signals: OpsHealthSignal[] = [
    jobsFailedSignal,
    approvalsSignal,
    lastDeploySignal,
    diskSignal,
    revenueSignal,
  ]

  const mode: 'calm' | 'attention' = signals.some((s) => s.tone === 'warn' || s.tone === 'crit')
    ? 'attention'
    : 'calm'
  const signalsFresh = signals.every((s) => s.tone !== 'muted')

  return { mode, signalsFresh, signals }
}
