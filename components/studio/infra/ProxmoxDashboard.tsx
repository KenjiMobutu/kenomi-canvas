"use client";

/**
 * components/studio/infra/ProxmoxDashboard.tsx
 * Dashboard métriques Proxmox — CPU / RAM / Disk / VMs
 * Rafraîchissement automatique toutes les 30s.
 */

import { useEffect, useState, useCallback } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

type NodeStatus = {
  node: string;
  cpu_pct: number;
  mem_pct: number;
  mem_used_fmt: string;
  mem_total_fmt: string;
  disk_pct: number;
  disk_used_fmt: string;
  disk_total_fmt: string;
  uptime_fmt: string;
  status: string;
};

type VM = {
  vmid: number;
  name: string;
  status: "running" | "stopped" | "paused";
  type: "qemu" | "lxc";
  cpu_pct: number;
  mem_pct: number;
  mem_fmt: string;
  maxmem_fmt: string;
  disk_pct: number;
  uptime_fmt: string;
};

type ProxmoxData = {
  nodes: NodeStatus[];
  vms: VM[];
  fetched_at: string;
};

// ─── Gauge bar ────────────────────────────────────────────────────────────────

function GaugeBar({ pct, warn = 70, danger = 90 }: { pct: number; warn?: number; danger?: number }) {
  const color =
    pct >= danger
      ? "var(--color-background-danger)"
      : pct >= warn
      ? "var(--color-background-warning)"
      : "var(--color-background-success)";

  return (
    <div style={{
      height: 6,
      background: "var(--color-border-tertiary)",
      borderRadius: 3,
      overflow: "hidden",
      marginTop: 4,
    }}>
      <div style={{
        width: `${Math.min(pct, 100)}%`,
        height: "100%",
        background: color,
        borderRadius: 3,
        transition: "width 0.5s ease",
      }} />
    </div>
  );
}

// ─── Metric card ─────────────────────────────────────────────────────────────

function MetricCard({ label, pct, detail }: { label: string; pct: number; detail: string }) {
  return (
    <div style={{
      background: "var(--color-background-secondary)",
      borderRadius: "var(--border-radius-md)",
      padding: "0.75rem 1rem",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <span style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>{label}</span>
        <span style={{ fontSize: 18, fontWeight: 500, color: "var(--color-text-primary)" }}>
          {pct}%
        </span>
      </div>
      <GaugeBar pct={pct} />
      <div style={{ fontSize: 11, color: "var(--color-text-tertiary)", marginTop: 4 }}>
        {detail}
      </div>
    </div>
  );
}

// ─── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const isRunning = status === "running" || status === "online";
  return (
    <span style={{
      fontSize: 11,
      padding: "2px 8px",
      borderRadius: "var(--border-radius-md)",
      background: isRunning ? "var(--color-background-success)" : "var(--color-background-secondary)",
      color: isRunning ? "var(--color-text-success)" : "var(--color-text-secondary)",
    }}>
      {status}
    </span>
  );
}

// ─── Composant principal ──────────────────────────────────────────────────────

export function ProxmoxDashboard() {
  const [data, setData] = useState<ProxmoxData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<string>("");

  const fetchMetrics = useCallback(async () => {
    try {
      const res = await fetch("/api/studio/infra/proxmox");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json: ProxmoxData = await res.json();
      setData(json);
      setError(null);
      setLastUpdate(new Date().toLocaleTimeString("fr-BE"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMetrics();
    const interval = setInterval(fetchMetrics, 30_000);
    return () => clearInterval(interval);
  }, [fetchMetrics]);

  if (loading) {
    return (
      <div style={{ padding: "2rem", color: "var(--color-text-secondary)", fontSize: 14 }}>
        Connexion à Proxmox...
      </div>
    );
  }

  if (error) {
    return (
      <div style={{
        padding: "1rem",
        background: "var(--color-background-danger)",
        borderRadius: "var(--border-radius-md)",
        color: "var(--color-text-danger)",
        fontSize: 13,
      }}>
        Proxmox indisponible — {error}
      </div>
    );
  }

  if (!data) return null;

  const node = data.nodes[0];
  const runningVMs = data.vms.filter((v) => v.status === "running");
  const stoppedVMs = data.vms.filter((v) => v.status !== "running");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h2 style={{ fontSize: 16, fontWeight: 500, margin: 0 }}>
            Proxmox — {node?.node ?? "pve"}
          </h2>
          <p style={{ fontSize: 12, color: "var(--color-text-tertiary)", margin: "2px 0 0" }}>
            Uptime {node?.uptime_fmt} · Mis à jour à {lastUpdate}
          </p>
        </div>
        <StatusBadge status={node?.status ?? "unknown"} />
      </div>

      {/* Métriques nœud */}
      {node && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
          <MetricCard
            label="CPU"
            pct={node.cpu_pct}
            detail={`${node.cpu_pct}% utilisé`}
          />
          <MetricCard
            label="RAM"
            pct={node.mem_pct}
            detail={`${node.mem_used_fmt} / ${node.mem_total_fmt}`}
          />
          <MetricCard
            label="Disque"
            pct={node.disk_pct}
            detail={`${node.disk_used_fmt} / ${node.disk_total_fmt}`}
          />
        </div>
      )}

      {/* Résumé VMs */}
      <div style={{ display: "flex", gap: 12 }}>
        <div style={{
          background: "var(--color-background-secondary)",
          borderRadius: "var(--border-radius-md)",
          padding: "0.75rem 1.25rem",
          flex: 1,
          textAlign: "center",
        }}>
          <div style={{ fontSize: 22, fontWeight: 500 }}>{data.vms.length}</div>
          <div style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>VMs / LXC total</div>
        </div>
        <div style={{
          background: "var(--color-background-success)",
          borderRadius: "var(--border-radius-md)",
          padding: "0.75rem 1.25rem",
          flex: 1,
          textAlign: "center",
        }}>
          <div style={{ fontSize: 22, fontWeight: 500, color: "var(--color-text-success)" }}>
            {runningVMs.length}
          </div>
          <div style={{ fontSize: 12, color: "var(--color-text-success)" }}>En cours</div>
        </div>
        <div style={{
          background: "var(--color-background-secondary)",
          borderRadius: "var(--border-radius-md)",
          padding: "0.75rem 1.25rem",
          flex: 1,
          textAlign: "center",
        }}>
          <div style={{ fontSize: 22, fontWeight: 500, color: "var(--color-text-tertiary)" }}>
            {stoppedVMs.length}
          </div>
          <div style={{ fontSize: 12, color: "var(--color-text-tertiary)" }}>Arrêtées</div>
        </div>
      </div>

      {/* Liste VMs */}
      <div style={{
        border: "0.5px solid var(--color-border-tertiary)",
        borderRadius: "var(--border-radius-lg)",
        overflow: "hidden",
      }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: "var(--color-background-secondary)" }}>
              {["ID", "Nom", "Type", "Statut", "CPU", "RAM", "Uptime"].map((h) => (
                <th key={h} style={{
                  padding: "8px 12px",
                  textAlign: "left",
                  fontWeight: 500,
                  color: "var(--color-text-secondary)",
                  fontSize: 12,
                  borderBottom: "0.5px solid var(--color-border-tertiary)",
                }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.vms.map((vm, i) => (
              <tr key={vm.vmid} style={{
                borderTop: i === 0 ? "none" : "0.5px solid var(--color-border-tertiary)",
              }}>
                <td style={{ padding: "8px 12px", color: "var(--color-text-tertiary)" }}>
                  {vm.vmid}
                </td>
                <td style={{ padding: "8px 12px", fontWeight: 500 }}>{vm.name}</td>
                <td style={{ padding: "8px 12px" }}>
                  <span style={{
                    fontSize: 11,
                    padding: "2px 6px",
                    borderRadius: "var(--border-radius-md)",
                    background: "var(--color-background-info)",
                    color: "var(--color-text-info)",
                  }}>
                    {vm.type}
                  </span>
                </td>
                <td style={{ padding: "8px 12px" }}>
                  <StatusBadge status={vm.status} />
                </td>
                <td style={{ padding: "8px 12px" }}>
                  <div style={{ minWidth: 60 }}>
                    <span style={{ fontSize: 12 }}>{vm.cpu_pct}%</span>
                    <GaugeBar pct={vm.cpu_pct} />
                  </div>
                </td>
                <td style={{ padding: "8px 12px" }}>
                  <div style={{ minWidth: 80 }}>
                    <span style={{ fontSize: 12 }}>{vm.mem_fmt} / {vm.maxmem_fmt}</span>
                    <GaugeBar pct={vm.mem_pct} />
                  </div>
                </td>
                <td style={{ padding: "8px 12px", color: "var(--color-text-secondary)", fontSize: 12 }}>
                  {vm.status === "running" ? vm.uptime_fmt : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

    </div>
  );
}
