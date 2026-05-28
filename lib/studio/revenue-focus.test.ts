import { describe, expect, it } from 'vitest'
import { shouldEmphasizeRevenueLoopAction, sortRevenueLoopsByFocus } from './revenue-focus'
import type { RevenueLoopItem } from '@/lib/revenue-loop'

function makeLoop(input: Partial<RevenueLoopItem> & Pick<RevenueLoopItem, 'id' | 'ventureName'>): RevenueLoopItem {
  return {
    id: input.id,
    ventureName: input.ventureName,
    status: input.status ?? 'active',
    revenueEur: input.revenueEur ?? 0,
    paidPayments: input.paidPayments ?? 0,
    stages: input.stages ?? [],
    nextAction:
      input.nextAction ??
      ({
        type: 'monitor',
        label: 'Monitor',
      } as RevenueLoopItem['nextAction']),
    priorityScore: input.priorityScore ?? 0,
    priorityReason: input.priorityReason ?? 'n/a',
    blockedRevenueEur: input.blockedRevenueEur ?? 0,
    pipelineId: input.pipelineId ?? null,
    ventureId: input.ventureId ?? null,
    ventureSlug: input.ventureSlug ?? null,
    publicLandingUrl: input.publicLandingUrl ?? null,
    checkoutUrl: input.checkoutUrl ?? null,
    pendingApproval: input.pendingApproval ?? null,
    blockedAction: input.blockedAction ?? null,
    updatedAt: input.updatedAt ?? null,
  }
}

describe('sortRevenueLoopsByFocus', () => {
  const loops = [
    makeLoop({
      id: 'loop-a',
      ventureName: 'A',
      blockedRevenueEur: 200,
      revenueEur: 20,
      paidPayments: 1,
      priorityScore: 70,
    }),
    makeLoop({
      id: 'loop-b',
      ventureName: 'B',
      blockedRevenueEur: 900,
      revenueEur: 10,
      paidPayments: 0,
      priorityScore: 95,
      nextAction: { type: 'create_checkout', label: 'Create checkout', ventureId: 'v2', pipelineId: 'p2' },
    }),
    makeLoop({
      id: 'loop-c',
      ventureName: 'C',
      blockedRevenueEur: 100,
      revenueEur: 300,
      paidPayments: 4,
      priorityScore: 40,
    }),
  ]

  it('prioritizes blocked revenue for blocked focus', () => {
    expect(sortRevenueLoopsByFocus(loops, 'blocked').map((loop) => loop.id)).toEqual([
      'loop-b',
      'loop-a',
      'loop-c',
    ])
  })

  it('prioritizes checkout-ready loops for ready_checkouts focus', () => {
    expect(sortRevenueLoopsByFocus(loops, 'ready_checkouts').map((loop) => loop.id)).toEqual([
      'loop-b',
      'loop-a',
      'loop-c',
    ])
  })

  it('prioritizes realized revenue for cash focuses', () => {
    expect(sortRevenueLoopsByFocus(loops, 'cash_7d').map((loop) => loop.id)).toEqual([
      'loop-c',
      'loop-a',
      'loop-b',
    ])
    expect(sortRevenueLoopsByFocus(loops, 'cash_30d').map((loop) => loop.id)).toEqual([
      'loop-c',
      'loop-a',
      'loop-b',
    ])
  })

  it('marks the right loops as CTA priorities for each focus', () => {
    expect(shouldEmphasizeRevenueLoopAction(loops[1], 'ready_checkouts')).toBe(true)
    expect(shouldEmphasizeRevenueLoopAction(loops[0], 'ready_checkouts')).toBe(false)
    expect(shouldEmphasizeRevenueLoopAction(loops[0], 'blocked')).toBe(true)
    expect(shouldEmphasizeRevenueLoopAction(loops[2], 'cash_7d')).toBe(true)
    expect(shouldEmphasizeRevenueLoopAction(loops[1], 'cash_7d')).toBe(true)
  })
})
