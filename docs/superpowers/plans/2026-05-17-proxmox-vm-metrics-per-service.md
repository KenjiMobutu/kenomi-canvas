# Proxmox VM Metrics Per Service Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Afficher les métriques CPU/RAM/Disk/Net de la VM ou LXC Proxmox correspondante dans le `ServiceInspector` de la page Infrastructure, et masquer les jauges pour les services sans VM Proxmox.

**Architecture:** Un champ `vmid: number | null` est ajouté à chaque entrée de `SERVICES_IN`. Le `ServiceInspector` fait un `.find(v => v.vmid === svc.vmid)` sur `proxmox.vms` (déjà chargées) pour obtenir les métriques — aucun nouveau endpoint. Pour les services sans `vmid`, les jauges sont masquées. Le type `ProxmoxVM` dans la page est enrichi avec `disk_pct`, `netin`, `netout`.

**Tech Stack:** Next.js 15 App Router, React, TypeScript, inline styles (pattern `ck-vars`)

---

### Task 1 : Ajouter `vmid` dans `SERVICES_IN` et enrichir `ProxmoxVM`

**Files:**

- Modify: `app/studio/infrastructure/page.tsx:11-20` (SERVICES_IN)
- Modify: `app/studio/infrastructure/page.tsx:55-65` (type ProxmoxVM)

- [ ] **Step 1 : Ajouter `vmid` dans `SERVICES_IN`**

Remplacer le bloc `SERVICES_IN` (lignes 11-20) par :

```ts
const SERVICES_IN = [
  {
    id: 'proxmox',
    vmid: null,
    label: 'Proxmox VE',
    short: 'PROX',
    color: '#34d399',
    role: 'Compute · cluster local',
    endpoint: 'proxmox.local',
    healthKey: null,
  },
  {
    id: 'coolify',
    vmid: 102,
    label: 'Coolify',
    short: 'COOL',
    color: '#34d399',
    role: 'Deploy · landings + APIs',
    endpoint: '192.168.0.19:8000',
    healthKey: 'coolify',
  },
  {
    id: 'nginx',
    vmid: 101,
    label: 'Nginx PM',
    short: 'NPM',
    color: '#22d3ee',
    role: 'Proxy · SSL · domains',
    endpoint: 'npm.local',
    healthKey: null,
  },
  {
    id: 'uptime',
    vmid: null,
    label: 'Uptime Kuma',
    short: 'UPT',
    color: '#a78bfa',
    role: 'Monitor',
    endpoint: 'uptime.local',
    healthKey: null,
  },
  {
    id: 'vault',
    vmid: 100,
    label: 'Vaultwarden',
    short: 'VLT',
    color: '#fbbf24',
    role: 'Secrets · creds · OAuth',
    endpoint: 'vault.local',
    healthKey: null,
  },
  {
    id: 'supabase',
    vmid: null,
    label: 'Supabase',
    short: 'SUP',
    color: '#34d399',
    role: 'Auth · Postgres · Storage',
    endpoint: 'supabase.kenomi.eu',
    healthKey: 'supabase',
  },
  {
    id: 'n8n',
    vmid: null,
    label: 'n8n',
    short: 'N8N',
    color: '#e879f9',
    role: 'Automation',
    endpoint: 'n8n.kenomi.eu',
    healthKey: 'n8n',
  },
  {
    id: 'ollama',
    vmid: null,
    label: 'Ollama',
    short: 'OLL',
    color: '#fb923c',
    role: 'LLM · inference locale',
    endpoint: '192.168.0.14:11434',
    healthKey: 'ollama',
  },
]
```

- [ ] **Step 2 : Enrichir le type `ProxmoxVM`**

Remplacer le type `ProxmoxVM` (lignes 55-65) par :

```ts
type ProxmoxVM = {
  vmid: number
  name: string
  status: 'running' | 'stopped' | 'paused'
  type: 'qemu' | 'lxc'
  cpu_pct: number
  mem_pct: number
  disk_pct: number
  mem_fmt: string
  maxmem_fmt: string
  disk_used_fmt: string
  maxdisk_fmt: string
  uptime_fmt: string
  netin: number
  netout: number
}
```

- [ ] **Step 3 : Vérifier TypeScript**

```bash
npm run typecheck
```

Attendu : zéro erreur (les nouveaux champs `disk_pct`, `netin`, `netout` sont déjà retournés par la route — ils étaient juste absents du type).

- [ ] **Step 4 : Commit**

```bash
git add app/studio/infrastructure/page.tsx
git commit -m "feat(infra): ajout vmid dans SERVICES_IN + enrichissement type ProxmoxVM"
```

---

### Task 2 : Réécrire `ServiceInspector` avec métriques VM/LXC

**Files:**

- Modify: `app/studio/infrastructure/page.tsx:217-281` (ServiceInspector)

- [ ] **Step 1 : Remplacer entièrement `ServiceInspector`**

Remplacer la fonction `ServiceInspector` (lignes 217-281) par :

```tsx
function ServiceInspector({
  svc,
  health,
  proxmox,
}: {
  svc: ServiceIn
  health: HealthData | null
  proxmox: ProxmoxData | null
}) {
  const hk = svc.healthKey as keyof HealthData | null
  const result = hk && health ? health[hk] : null
  const isLive = result?.ok ?? null
  const latency = result?.latencyMs ?? null
  const statusLabel = isLive === null ? '—' : isLive ? 'ONLINE' : 'OFFLINE'
  const statusCol = statusColor(isLive)

  // Résolution des métriques selon le type de service
  const isProxmoxNode = svc.id === 'proxmox'
  const pxNode = isProxmoxNode ? (proxmox?.nodes[0] ?? null) : null
  const vm = svc.vmid != null ? (proxmox?.vms.find((v) => v.vmid === svc.vmid) ?? null) : null
  const hasMetrics = isProxmoxNode ? pxNode !== null : vm !== null

  // Valeurs des jauges
  const cpuPct = isProxmoxNode ? (pxNode?.cpu_pct ?? 0) : (vm?.cpu_pct ?? 0)
  const memPct = isProxmoxNode ? (pxNode?.mem_pct ?? 0) : (vm?.mem_pct ?? 0)
  const diskPct = isProxmoxNode ? (pxNode?.disk_pct ?? 0) : (vm?.disk_pct ?? 0)
  const uptimeFmt = isProxmoxNode ? (pxNode?.uptime_fmt ?? '—') : (vm?.uptime_fmt ?? '—')

  // 4ème jauge : VMs actives pour le nœud, Net I/O (Mo) pour les VMs
  const vmRunning = proxmox ? proxmox.vms.filter((v) => v.status === 'running').length : 0
  const vmTotal = proxmox?.vms.length ?? 1
  const netMo = vm ? Math.round((vm.netin + vm.netout) / 1_048_576) : 0
  const netMax = 10_000 // cap à 10 000 Mo pour l'affichage de la jauge

  const isMonitored = hk ? true : hasMetrics

  return (
    <div
      style={{
        background: surface,
        border: `1px solid ${line}`,
        borderRadius: 14,
        padding: 16,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        borderLeft: `3px solid ${svc.color}`,
      }}
    >
      {/* Header */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 10,
              color: svc.color,
              letterSpacing: '.14em',
              textTransform: 'uppercase',
              fontWeight: 700,
            }}
          >
            Service · {svc.short}
          </span>
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 10,
              padding: '3px 8px',
              borderRadius: 4,
              background: `${statusCol}22`,
              color: statusCol,
              letterSpacing: 1.5,
              fontWeight: 800,
            }}
          >
            {statusLabel}
          </span>
        </div>
        <div
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 22,
            fontWeight: 800,
            letterSpacing: '-.02em',
            marginTop: 4,
            color: text,
          }}
        >
          {svc.label}
        </div>
        <div style={{ fontSize: 12, color: muted, marginTop: 4 }}>{svc.role}</div>
        <div
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 9.5,
            color: muted2,
            letterSpacing: '.14em',
            marginTop: 6,
          }}
        >
          → {svc.endpoint}
        </div>
      </div>

      {/* Jauges — affichées uniquement si métriques disponibles */}
      {hasMetrics && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <ArcGauge label="CPU" value={cpuPct} max={100} color={cyan} />
          <ArcGauge label="RAM" value={memPct} max={100} color={emerald} />
          <ArcGauge label="Disk" value={diskPct} max={100} color={violet} />
          {isProxmoxNode ? (
            <ArcGauge
              label="VMs"
              value={vmRunning}
              max={Math.max(vmTotal, 1)}
              color={amber}
              unit=""
            />
          ) : (
            <ArcGauge label="Net" value={netMo} max={netMax} color={fuchsia} unit="Mo" />
          )}
        </div>
      )}

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
        <InfraStat label="Uptime" value={hasMetrics ? uptimeFmt : '—'} color={emerald} />
        <InfraStat label="Latency" value={latency !== null ? `${latency}ms` : '—'} color={cyan} />
        <InfraStat
          label="Monitored"
          value={isMonitored ? 'oui' : 'non'}
          color={isMonitored ? emerald : muted}
        />
      </div>

      {/* Warning si aucune métrique */}
      {!hasMetrics && !hk && (
        <div
          style={{
            padding: '10px 12px',
            borderRadius: 8,
            background: `${amber}12`,
            border: `1px solid ${amber}33`,
            fontSize: 11,
            color: amber,
            fontFamily: 'var(--font-mono)',
          }}
        >
          ⚠ Aucune métrique · service non hébergé sur Proxmox
        </div>
      )}

      {/* Actions */}
      <div style={{ display: 'flex', gap: 6, marginTop: 'auto' }}>
        <button
          style={{
            flex: 1,
            padding: '9px 12px',
            borderRadius: 8,
            background: svc.color,
            color: '#0b0d12',
            border: 'none',
            fontFamily: 'var(--font-display)',
            fontWeight: 800,
            fontSize: 11.5,
            letterSpacing: '.06em',
            cursor: 'pointer',
          }}
        >
          ↗ {svc.endpoint}
        </button>
        <button
          style={{
            padding: '9px 12px',
            borderRadius: 8,
            background: surface2,
            color: text,
            border: `1px solid ${line2}`,
            fontFamily: 'var(--font-mono)',
            fontWeight: 700,
            fontSize: 10,
            letterSpacing: '.14em',
            cursor: 'pointer',
          }}
        >
          RESTART
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2 : Vérifier TypeScript**

```bash
npm run typecheck
```

Attendu : zéro erreur.

- [ ] **Step 3 : Vérifier visuellement dans le navigateur**

Ouvrir `http://localhost:3000/studio/infrastructure` et tester :

- Cliquer **Proxmox VE** → jauges CPU/RAM/Disk/VMs affichées avec vraies valeurs
- Cliquer **Coolify** → jauges CPU/RAM/Disk/Net affichées (vmid 102)
- Cliquer **Nginx PM** → jauges CPU/RAM/Disk/Net affichées (vmid 101)
- Cliquer **Vaultwarden** → jauges CPU/RAM/Disk/Net affichées (vmid 100)
- Cliquer **Uptime Kuma** → jauges masquées, warning "Aucune métrique"
- Cliquer **Supabase** → jauges masquées, warning "Aucune métrique"
- Cliquer **n8n** → jauges masquées, warning "Aucune métrique"
- Cliquer **Ollama** → jauges masquées, warning "Aucune métrique"

- [ ] **Step 4 : Commit**

```bash
git add app/studio/infrastructure/page.tsx
git commit -m "feat(infra): métriques VM/LXC par service dans ServiceInspector"
```

---

### Task 3 : Push et déploiement Coolify

**Files:** aucun

- [ ] **Step 1 : Push**

```bash
git push origin main
```

- [ ] **Step 2 : Déclencher le déploiement Coolify**

```bash
curl -s -X GET \
  -H "Authorization: Bearer $COOLIFY_API_TOKEN" \
  "http://192.168.0.19:8000/api/v1/deploy?uuid=yup6hpmw0fcowrkkf2o3bzl1" | python3 -m json.tool
```

Attendu : `"message": "Application kenomi-canvas deployment queued."`

- [ ] **Step 3 : Vérifier sur `https://lab.kenomi.eu/studio/infrastructure`**

Même checklist visuelle que Task 2 Step 3, sur la version production.
