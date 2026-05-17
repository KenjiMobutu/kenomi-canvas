# Métriques VM/LXC par service — Infrastructure page

**Date** : 2026-05-17
**Statut** : approuvé

## Contexte

La page `/studio/infrastructure` affiche un `ServiceInspector` avec 4 jauges ArcGauge (CPU, RAM, Disk, 4ème). Actuellement seul le nœud Proxmox remplit ces jauges. Les services `coolify`, `nginx` (NPM), et `vaultwarden` ont chacun une VM/LXC sur Proxmox dont les métriques sont déjà retournées par `/api/studio/infra/proxmox` mais pas utilisées.

## Objectif

Afficher les vraies métriques CPU/RAM/Disk/Net de la VM ou LXC correspondante quand un service est sélectionné dans le `ServiceInspector`.

## Mapping VM/LXC → Service

| Service id | vmid | Type |
|------------|------|------|
| `proxmox`  | `null` | nœud (cas spécial existant) |
| `coolify`  | `102`  | QEMU |
| `nginx`    | `101`  | LXC  |
| `vault`    | `100`  | LXC  |
| `uptime`   | `null` | pas de VM Proxmox |
| `supabase` | `null` | externe |
| `n8n`      | `null` | pas de VM Proxmox |
| `ollama`   | `null` | pas de VM Proxmox |

## Architecture

### Données (aucun changement API)

La route `GET /api/studio/infra/proxmox` retourne déjà :

```ts
{
  nodes: ProxmoxNode[],  // nœud proxmox — CPU/RAM/Disk/uptime
  vms: ProxmoxVM[],      // coolify, npm, vaultwarden — cpu_pct, mem_pct, disk_pct, netin, netout, uptime_fmt
  fetched_at: string
}
```

Aucun nouveau endpoint. La route et le client Proxmox ne changent pas.

### Changements frontend (un seul fichier)

**`app/studio/infrastructure/page.tsx`**

1. **`SERVICES_IN`** — ajout du champ `vmid: number | null` :
   ```ts
   { id: 'coolify', vmid: 102, ... }
   { id: 'nginx',   vmid: 101, ... }
   { id: 'vault',   vmid: 100, ... }
   // tous les autres : vmid: null
   ```

2. **`ServiceInspector`** — logique de sélection des métriques :
   ```
   svc.id === 'proxmox'  → utilise proxmox.nodes[0]  (comportement actuel)
   svc.vmid !== null     → proxmox.vms.find(v => v.vmid === svc.vmid)
   svc.vmid === null     → pas de jauges
   ```

3. **Affichage conditionnel** :
   - VM trouvée → 4 ArcGauge visibles : CPU, RAM, Disk, Net (netin en Mo)
   - vmid null → jauges masquées, seulement statut health + latence
   - InfraStat "Uptime" → `vm.uptime_fmt` si VM, sinon `—`
   - InfraStat "Monitored" → `oui` si VM trouvée ou healthKey présent

4. **4ème jauge** :
   - Proxmox nœud : VMs actives / total (comportement actuel)
   - VM/LXC : Net I/O — `netin` converti en Mo (total cumulé depuis boot)

## Comportement par service

| Service | Jauges | Source |
|---------|--------|--------|
| Proxmox VE | CPU, RAM, Disk, VMs actives | `nodes[0]` |
| Coolify | CPU, RAM, Disk, Net | `vms.find(102)` |
| Nginx PM | CPU, RAM, Disk, Net | `vms.find(101)` |
| Vaultwarden | CPU, RAM, Disk, Net | `vms.find(100)` |
| Uptime Kuma | masqué | — |
| Supabase | masqué | — |
| n8n | masqué | — |
| Ollama | masqué | — |

## Gestion des erreurs

- VM dans `SERVICES_IN` mais absente de `proxmox.vms` (VM arrêtée, non listée) → jauges masquées, pas d'erreur
- `proxmox` state null (données pas encore chargées) → jauges masquées

## Fichiers modifiés

- `app/studio/infrastructure/page.tsx` — seul fichier touché
