export const dynamic = 'force-dynamic'

import { db } from '@/lib/db'
import { DashboardFlow } from '@/components/dashboard/DashboardFlow'
import type { VentureNodeData } from '@/components/dashboard/VentureNode'

async function getDashboardData(): Promise<VentureNodeData[]> {
  try {
    const ventures = await db.venture.findMany({
      orderBy: { created_at: 'asc' },
      include: {
        _count:    { select: { waitlist: true } },
        decisions: { orderBy: { created_at: 'desc' }, take: 1,
                     select: { decision: true, reason: true } },
      },
    })

    return ventures.map(v => ({
      id:            v.id,
      nom:           v.nom,
      slug:          v.slug,
      type_produit:  v.type_produit,
      statut:        v.statut,
      waitlistCount: v._count.waitlist,
      revenus_total: v.revenus_total,
      budget_depense: v.budget_depense,
      lastDecision:  v.decisions[0]
        ? { decision: v.decisions[0].decision ?? '', reason: v.decisions[0].reason ?? null }
        : null,
    }))
  } catch {
    return []
  }
}

export default async function DashboardPage() {
  const ventures = await getDashboardData()

  return (
    <div className="flex flex-col" style={{ height: '100vh', background: '#f8fafc' }}>
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-3 bg-white border-b border-gray-200 shrink-0">
        <div className="flex items-center gap-3">
          <span className="text-xl">🏭</span>
          <span className="font-bold text-gray-900 text-base">Kenomi Business Factory</span>
          <span className="text-gray-300 text-sm">Dashboard</span>
        </div>
        <div className="flex items-center gap-4 text-sm text-gray-500">
          <span>{ventures.length} venture{ventures.length !== 1 ? 's' : ''}</span>
          <span className="text-emerald-600 font-medium">
            {ventures.filter(v => v.statut === 'actif').length} actives
          </span>
          <span className="text-amber-600 font-medium">
            {ventures.filter(v => v.statut === 'watch').length} watch
          </span>
          <span className="text-green-600 font-medium">
            {ventures.filter(v => v.statut === 'scale').length} scale
          </span>
          <form action="/api/dashboard/logout" method="POST">
            <button className="text-gray-400 hover:text-gray-600 transition-colors text-xs">
              Déconnexion
            </button>
          </form>
        </div>
      </header>

      {/* React Flow canvas */}
      <main className="flex-1 overflow-hidden">
        {ventures.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-gray-400">
            <span className="text-5xl">📭</span>
            <p className="text-sm">Aucune venture trouvée — lancez le Scout Agent pour commencer.</p>
          </div>
        ) : (
          <DashboardFlow ventures={ventures} />
        )}
      </main>
    </div>
  )
}
