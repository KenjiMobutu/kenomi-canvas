import type { RevenueLoopItem } from '@/lib/revenue-loop'
import type { RevenueFocus } from './revenue-links'

export function sortRevenueLoopsByFocus(
  loops: RevenueLoopItem[],
  focus: RevenueFocus | null
): RevenueLoopItem[] {
  if (!focus) return loops

  const ranked = [...loops]
  ranked.sort((left, right) => {
    if (focus === 'blocked') {
      return (
        right.blockedRevenueEur - left.blockedRevenueEur ||
        right.priorityScore - left.priorityScore ||
        right.revenueEur - left.revenueEur
      )
    }

    if (focus === 'ready_checkouts') {
      const leftReady = left.nextAction.type === 'create_checkout' ? 1 : 0
      const rightReady = right.nextAction.type === 'create_checkout' ? 1 : 0
      return (
        rightReady - leftReady ||
        right.priorityScore - left.priorityScore ||
        right.blockedRevenueEur - left.blockedRevenueEur
      )
    }

    return (
      right.revenueEur - left.revenueEur ||
      right.paidPayments - left.paidPayments ||
      right.priorityScore - left.priorityScore
    )
  })

  return ranked
}
