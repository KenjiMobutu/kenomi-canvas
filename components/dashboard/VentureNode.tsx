'use client'
import { Handle, Position, type NodeProps } from '@xyflow/react'

export type VentureNodeData = {
  id: string
  nom: string
  slug: string
  type_produit: string | null
  statut: string
  waitlistCount: number
  revenus_total: number
  budget_depense: number
  lastDecision: { decision: string; reason: string | null } | null
}

const STATUS_STYLE: Record<string, { bg: string; text: string; border: string }> = {
  scout: { bg: 'bg-gray-100', text: 'text-gray-700', border: 'border-gray-300' },
  validation: { bg: 'bg-purple-100', text: 'text-purple-700', border: 'border-purple-300' },
  builder: { bg: 'bg-blue-100', text: 'text-blue-700', border: 'border-blue-300' },
  actif: { bg: 'bg-emerald-100', text: 'text-emerald-700', border: 'border-emerald-300' },
  watch: { bg: 'bg-amber-100', text: 'text-amber-700', border: 'border-amber-300' },
  scale: { bg: 'bg-green-100', text: 'text-green-700', border: 'border-green-300' },
  pivot: { bg: 'bg-orange-100', text: 'text-orange-700', border: 'border-orange-300' },
  kill: { bg: 'bg-red-100', text: 'text-red-700', border: 'border-red-300' },
  archive: { bg: 'bg-gray-100', text: 'text-gray-400', border: 'border-gray-200' },
}

const DECISION_EMOJI: Record<string, string> = {
  scale: '🚀',
  pivot: '🔄',
  kill: '💀',
  watch: '👁',
}

export function VentureNode({ data }: NodeProps) {
  const d = data as VentureNodeData
  const s = STATUS_STYLE[d.statut] ?? STATUS_STYLE.watch

  return (
    <div
      className={`bg-white border-2 ${s.border} rounded-xl shadow-md p-3 w-52 text-sm select-none`}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!w-2 !h-2 !bg-gray-300 !border-gray-400"
      />

      <div className="flex items-center justify-between mb-1.5">
        <span className={`${s.bg} ${s.text} text-xs px-2 py-0.5 rounded-full font-semibold`}>
          {d.statut}
        </span>
        <span className="text-gray-300 text-xs">{d.type_produit ?? 'micro-saas'}</span>
      </div>

      <div className="font-bold text-gray-900 truncate text-sm leading-tight">{d.nom}</div>
      <div className="text-gray-400 text-xs mb-2 truncate">{d.slug}</div>

      <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-xs text-gray-600 mb-2">
        <span>👥 {d.waitlistCount} inscrits</span>
        <span>💶 {d.revenus_total.toFixed(0)}€</span>
        <span className="col-span-2">💸 budget {d.budget_depense.toFixed(0)}€ / 50€</span>
      </div>

      {d.lastDecision && (
        <div className="text-xs bg-gray-50 rounded-lg px-2 py-1 text-gray-500 truncate">
          {DECISION_EMOJI[d.lastDecision.decision] ?? '🧠'}{' '}
          <span className="font-semibold">{d.lastDecision.decision.toUpperCase()}</span>
        </div>
      )}

      <Handle
        type="source"
        position={Position.Right}
        className="!w-2 !h-2 !bg-gray-300 !border-gray-400"
      />
    </div>
  )
}
