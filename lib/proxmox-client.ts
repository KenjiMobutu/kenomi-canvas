/**
 * lib/proxmox-client.ts
 * Client API Proxmox REST — lecture seule (PVEAuditor)
 * Token : monitoring@pve!kenomi-canvas
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type ProxmoxNodeStatus = {
  node: string;
  cpu: number;        // 0.0 → 1.0
  cpu_pct: number;    // 0 → 100
  mem_used: number;   // bytes
  mem_total: number;  // bytes
  mem_pct: number;    // 0 → 100
  disk_used: number;  // bytes
  disk_total: number; // bytes
  disk_pct: number;   // 0 → 100
  uptime: number;     // secondes
  status: "online" | "offline" | "unknown";
};

export type ProxmoxVM = {
  vmid: number;
  name: string;
  status: "running" | "stopped" | "paused";
  type: "qemu" | "lxc";
  cpu: number;
  mem: number;
  maxmem: number;
  disk: number;
  maxdisk: number;
  uptime: number;
  node: string;
  netin: number;
  netout: number;
};

export type ProxmoxMetrics = {
  nodes: ProxmoxNodeStatus[];
  vms: ProxmoxVM[];
  fetched_at: string;
};

// ─── Constantes ───────────────────────────────────────────────────────────────

const PROXMOX_BASE_URL =
  process.env.PROXMOX_BASE_URL ?? "https://192.168.0.10:8006";
const PROXMOX_TOKEN_ID =
  process.env.PROXMOX_TOKEN_ID ?? "monitoring@pve!kenomi-canvas";
const PROXMOX_TOKEN_SECRET =
  process.env.PROXMOX_TOKEN_SECRET ?? "";
const PROXMOX_NODE =
  process.env.PROXMOX_NODE ?? "pve";

// ─── Fetch avec auth token ────────────────────────────────────────────────────

async function proxmoxFetch<T>(path: string): Promise<T> {
  const https = await import("https");
  const url = new URL(`${PROXMOX_BASE_URL}/api2/json${path}`);

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: url.hostname,
        port: url.port || 8006,
        path: url.pathname + url.search,
        method: "GET",
        rejectUnauthorized: false,
        headers: {
          Authorization: `PVEAPIToken=${PROXMOX_TOKEN_ID}=${PROXMOX_TOKEN_SECRET}`,
        },
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => { data += chunk; });
        res.on("end", () => {
          if (res.statusCode && res.statusCode >= 400) {
            reject(new Error(`Proxmox API ${res.statusCode} sur ${path}: ${data}`));
            return;
          }
          try {
            resolve(JSON.parse(data).data as T);
          } catch {
            reject(new Error(`Proxmox JSON invalide sur ${path}`));
          }
        });
      }
    );
    req.on("error", reject);
    req.setTimeout(10_000, () => { req.destroy(new Error("Proxmox timeout")); });
    req.end();
  });
}

// ─── Métriques nœud ──────────────────────────────────────────────────────────

export async function getProxmoxNodeStatus(
  node = PROXMOX_NODE
): Promise<ProxmoxNodeStatus> {
  const data = await proxmoxFetch<{
    cpu: number;
    memory: { used: number; total: number };
    rootfs: { used: number; total: number };
    uptime: number;
  }>(`/nodes/${node}/status`);

  const mem_pct = Math.round((data.memory.used / data.memory.total) * 100);
  const disk_pct = Math.round((data.rootfs.used / data.rootfs.total) * 100);

  return {
    node,
    cpu: data.cpu,
    cpu_pct: Math.round(data.cpu * 100),
    mem_used: data.memory.used,
    mem_total: data.memory.total,
    mem_pct,
    disk_used: data.rootfs.used,
    disk_total: data.rootfs.total,
    disk_pct,
    uptime: data.uptime,
    status: "online",
  };
}

// ─── Liste VMs + LXC ─────────────────────────────────────────────────────────

export async function getProxmoxVMs(
  node = PROXMOX_NODE
): Promise<ProxmoxVM[]> {
  const [qemus, lxcs] = await Promise.all([
    proxmoxFetch<ProxmoxVM[]>(`/nodes/${node}/qemu`).catch(() => []),
    proxmoxFetch<ProxmoxVM[]>(`/nodes/${node}/lxc`).catch(() => []),
  ]);

  return [
    ...qemus.map((v) => ({ ...v, type: "qemu" as const, node })),
    ...lxcs.map((v) => ({ ...v, type: "lxc" as const, node })),
  ].sort((a, b) => a.vmid - b.vmid);
}

// ─── Métriques complètes ──────────────────────────────────────────────────────

export async function getProxmoxMetrics(): Promise<ProxmoxMetrics> {
  const [nodeStatus, vms] = await Promise.all([
    getProxmoxNodeStatus().catch((err) => {
      console.error("Proxmox node status error:", err.message);
      return null;
    }),
    getProxmoxVMs().catch((err) => {
      console.error("Proxmox VMs error:", err.message);
      return [];
    }),
  ]);

  return {
    nodes: nodeStatus ? [nodeStatus] : [],
    vms,
    fetched_at: new Date().toISOString(),
  };
}

// ─── Helpers formatage ────────────────────────────────────────────────────────

export function formatBytes(bytes: number): string {
  if (bytes >= 1_073_741_824)
    return `${(bytes / 1_073_741_824).toFixed(1)} Go`;
  if (bytes >= 1_048_576)
    return `${(bytes / 1_048_576).toFixed(0)} Mo`;
  return `${bytes} o`;
}

export function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}j ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}
