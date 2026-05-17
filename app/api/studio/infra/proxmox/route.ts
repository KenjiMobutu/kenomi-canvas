import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { requireAllowedUser } from "@/lib/auth-server";
import {
  getProxmoxMetrics,
  formatBytes,
  formatUptime,
} from "@/lib/proxmox-client";

export async function GET() {
  const cookieStore = await cookies();
  const { response } = await requireAllowedUser(cookieStore);
  if (response) return response;

  try {
    const metrics = await getProxmoxMetrics();

    const result = {
      ...metrics,
      nodes: metrics.nodes.map((n) => ({
        ...n,
        mem_used_fmt: formatBytes(n.mem_used),
        mem_total_fmt: formatBytes(n.mem_total),
        disk_used_fmt: formatBytes(n.disk_used),
        disk_total_fmt: formatBytes(n.disk_total),
        uptime_fmt: formatUptime(n.uptime),
      })),
      vms: metrics.vms.map((vm) => ({
        ...vm,
        mem_fmt: formatBytes(vm.mem),
        maxmem_fmt: formatBytes(vm.maxmem),
        disk_used_fmt: formatBytes(vm.disk),
        maxdisk_fmt: formatBytes(vm.maxdisk),
        uptime_fmt: formatUptime(vm.uptime),
        cpu_pct: Math.round(vm.cpu * 100),
        mem_pct: vm.maxmem > 0 ? Math.round((vm.mem / vm.maxmem) * 100) : 0,
        disk_pct: vm.maxdisk > 0 ? Math.round((vm.disk / vm.maxdisk) * 100) : 0,
        netin: vm.netin ?? 0,
        netout: vm.netout ?? 0,
      })),
    };

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur inconnue";
    console.error("Proxmox metrics error:", message);
    return NextResponse.json(
      { error: `Proxmox indisponible: ${message}` },
      { status: 503 }
    );
  }
}
