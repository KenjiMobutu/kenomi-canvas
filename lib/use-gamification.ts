'use client'
import { useCallback, useEffect, useState } from 'react'
import { createSupabaseBrowser } from '@/lib/supabase-browser'
import { useAuth } from '@/lib/auth-context'
import {
  computeGamification,
  ACHIEVEMENTS_META,
  type GamificationInput,
  type GamificationResult,
} from '@/lib/gamification'

const LEVELS_SNAP_KEY = 'kenomi-agent-levels'

const INITIAL: GamificationResult = {
  achievements: ACHIEVEMENTS_META.map((a) => ({ ...a, unlocked: false, pct: 0 })),
  userXP: 0,
  userLevel: 0,
  userXpBar: 0,
  userXpToNext: 100,
  agentLevels: [],
  newUnlocks: [],
  lastLevelUp: null,
}

export function useGamification(): GamificationResult & {
  loading: boolean
  claimed: string[]
  refetch: () => void
} {
  const { user } = useAuth()
  const [result, setResult] = useState<GamificationResult>(INITIAL)
  const [loading, setLoading] = useState(true)
  const [claimed, setClaimed] = useState<string[]>([])
  const [tick, setTick] = useState(0)
  const refetch = useCallback(() => setTick((t) => t + 1), [])

  useEffect(() => {
    if (!user) {
      setLoading(false)
      return
    }

    let cancelled = false
    const supabase = createSupabaseBrowser()
    const userId = user.id

    async function load() {
      // Step 1: fetch studio ventures for this user (RLS + explicit filter)
      const { data: ventures } = await supabase
        .from('ventures')
        .select('id, score, mrr, stage, created_at')
        .eq('user_id', userId)

      const ventureIds = (ventures ?? []).map((v: { id: string }) => v.id)

      // Step 2: fetch all other data in parallel
    const [
        { data: snapshots },
        { data: workflows },
        { data: landings },
        { data: payments },
        { data: metrics },
        { data: decisions },
        { data: ventureEvents },
        { data: agentRuns },
        { data: claims },
      ] = await Promise.all([
        supabase
          .from('kpi_snapshots')
          .select('revenue, updated_at')
          .eq('user_id', userId),
        supabase
          .from('automation_workflows')
          .select('id, enabled, created_at')
          .eq('user_id', userId),
        ventureIds.length
          ? supabase
              .from('landing_pages')
              .select('id, statut, created_at')
              .in('venture_id', ventureIds)
          : Promise.resolve({ data: [] }),
        ventureIds.length
          ? supabase
              .from('payments')
              .select('id, amount_eur, status, venture_id, created_at')
              .in('venture_id', ventureIds)
          : Promise.resolve({ data: [] }),
        ventureIds.length
          ? supabase.from('metrics').select('visiteurs').in('venture_id', ventureIds)
          : Promise.resolve({ data: [] }),
        ventureIds.length
          ? supabase
              .from('decisions')
              .select('venture_id, decision, created_at')
              .in('venture_id', ventureIds)
          : Promise.resolve({ data: [] }),
        ventureIds.length
          ? supabase
              .from('venture_events')
              .select('venture_id, event_type, value, metadata, occurred_at')
              .in('venture_id', ventureIds)
          : Promise.resolve({ data: [] }),
        ventureIds.length
          ? supabase
              .from('agent_runs')
              .select('agent_id, duration_ms, created_at, fallback_triggered, total_tokens, cost_usd, provider, model')
              .eq('user_id', userId)
              .order('created_at', { ascending: true })
          : Promise.resolve({ data: [] }),
        supabase.from('achievement_claims').select('achievement_id').eq('user_id', userId),
      ])

      const claimedIds = (claims ?? []).map((c: { achievement_id: string }) => c.achievement_id)

      const input: GamificationInput = {
        ventures: (ventures ?? []) as GamificationInput['ventures'],
        snapshots: (snapshots ?? []) as GamificationInput['snapshots'],
        workflows: (workflows ?? []) as GamificationInput['workflows'],
        landings: (landings ?? []) as GamificationInput['landings'],
        payments: (payments ?? []) as GamificationInput['payments'],
        metrics: (metrics ?? []) as GamificationInput['metrics'],
        decisions: (decisions ?? []) as GamificationInput['decisions'],
        ventureEvents: (ventureEvents ?? []) as GamificationInput['ventureEvents'],
        agentRuns: (agentRuns ?? []) as GamificationInput['agentRuns'],
        claimed: claimedIds,
      }

      const computed = computeGamification(input)

      // Detect level-ups by comparing with localStorage snapshot
      let lastLevelUp: GamificationResult['lastLevelUp'] = null
      try {
        const snap = JSON.parse(localStorage.getItem(LEVELS_SNAP_KEY) || '{}') as Record<
          string,
          number
        >
        for (const al of computed.agentLevels) {
          const prev = snap[al.id] ?? 0
          if (al.level > prev) {
            lastLevelUp = { agentId: al.id, fromLevel: prev, toLevel: al.level }
            break
          }
        }
        if (!cancelled) {
          const newSnap: Record<string, number> = {}
          for (const al of computed.agentLevels) newSnap[al.id] = al.level
          localStorage.setItem(LEVELS_SNAP_KEY, JSON.stringify(newSnap))
        }
      } catch {
        /* localStorage unavailable in SSR */
      }

      if (cancelled) return
      setResult({ ...computed, lastLevelUp })
      setClaimed(claimedIds)
      setLoading(false)
    }

    load()
    return () => {
      cancelled = true
    }
  }, [user, tick])

  return { ...result, loading, claimed, refetch }
}
