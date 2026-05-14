'use client'
import { useMemo } from 'react'
import {
  ReactFlow, Background, Controls, MiniMap,
  BackgroundVariant,
  type Node, type Edge,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { VentureNode, type VentureNodeData } from './VentureNode'

const NODE_W = 208
const NODE_H = 160
const COL_GAP = 320
const ROW_GAP = 200

const STAGES = [
  { id: 'stage-scout',      label: '🔍 Scout',        statuts: ['scout'] },
  { id: 'stage-validation', label: '✅ Validation',    statuts: ['validation'] },
  { id: 'stage-builder',    label: '🔨 Builder',       statuts: ['builder'] },
  { id: 'stage-active',     label: '👁 Actif / Watch', statuts: ['actif', 'watch'] },
  { id: 'stage-outcome',    label: '🎯 Résultat',      statuts: ['scale', 'pivot', 'kill', 'archive'] },
]

const STATUT_TO_STAGE: Record<string, string> = {}
STAGES.forEach(s => s.statuts.forEach(v => { STATUT_TO_STAGE[v] = s.id }))

const STAGE_X: Record<string, number> = {}
STAGES.forEach((s, i) => { STAGE_X[s.id] = 60 + i * (NODE_W + COL_GAP) })

const PIPELINE_EDGES: Edge[] = [
  { id: 'pe-1', source: 'stage-scout',      target: 'stage-validation', type: 'smoothstep', style: { stroke: '#cbd5e1', strokeDasharray: '5 4' }, animated: false, selectable: false },
  { id: 'pe-2', source: 'stage-validation', target: 'stage-builder',    type: 'smoothstep', style: { stroke: '#cbd5e1', strokeDasharray: '5 4' }, animated: false, selectable: false },
  { id: 'pe-3', source: 'stage-builder',    target: 'stage-active',     type: 'smoothstep', style: { stroke: '#cbd5e1', strokeDasharray: '5 4' }, animated: false, selectable: false },
  { id: 'pe-4', source: 'stage-active',     target: 'stage-outcome',    type: 'smoothstep', style: { stroke: '#cbd5e1', strokeDasharray: '5 4' }, animated: false, selectable: false },
]

const nodeTypes = { venture: VentureNode }

export function DashboardFlow({ ventures }: { ventures: VentureNodeData[] }) {
  const { nodes, edges } = useMemo(() => {
    const counters: Record<string, number> = {}

    const stageNodes: Node[] = STAGES.map(s => ({
      id:   s.id,
      type: 'default',
      position: { x: STAGE_X[s.id], y: -60 },
      data: { label: s.label },
      style: {
        background:   '#f8fafc',
        border:       '1px solid #e2e8f0',
        borderRadius: 10,
        fontWeight:   600,
        fontSize:     13,
        padding:      '6px 14px',
        width:        NODE_W,
        color:        '#475569',
      },
      draggable:   false,
      selectable:  false,
      connectable: false,
    }))

    const ventureNodes: Node[] = ventures.map(v => {
      const stageId = STATUT_TO_STAGE[v.statut] ?? 'stage-active'
      const idx     = counters[stageId] ?? 0
      counters[stageId] = idx + 1
      return {
        id:       v.id,
        type:     'venture',
        position: { x: STAGE_X[stageId], y: 20 + idx * (NODE_H + ROW_GAP) },
        data:     v,
      }
    })

    return { nodes: [...stageNodes, ...ventureNodes], edges: PIPELINE_EDGES }
  }, [ventures])

  return (
    <div style={{ width: '100%', height: '100%' }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.15 }}
        proOptions={{ hideAttribution: true }}
        minZoom={0.3}
        maxZoom={1.5}
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#e2e8f0" />
        <Controls showInteractive={false} />
        <MiniMap
          nodeColor={node => {
            if (node.type !== 'venture') return '#f1f5f9'
            const statut = (node.data as VentureNodeData).statut
            const map: Record<string, string> = {
              actif: '#10b981', watch: '#f59e0b', scale: '#22c55e',
              kill:  '#ef4444', pivot: '#f97316', archive: '#94a3b8',
            }
            return map[statut] ?? '#94a3b8'
          }}
          style={{ background: '#f8fafc', border: '1px solid #e2e8f0' }}
        />
      </ReactFlow>
    </div>
  )
}
