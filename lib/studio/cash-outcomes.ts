export type CashOutcomeWindow = {
  replies: number
  deals: number
  cashEur: number
}

export type CashOutcomeSnapshot = {
  last7d: CashOutcomeWindow
  previous7d: CashOutcomeWindow
  last30d: CashOutcomeWindow
  previous30d: CashOutcomeWindow
  delta7d: CashOutcomeWindow
  delta30d: CashOutcomeWindow
}

type ProspectActivityRow = {
  type?: string | null
  created_at?: string | null
}

type PaymentRow = {
  status?: string | null
  created_at?: string | null
  amount_eur?: number | string | null
  collected_amount_eur?: number | string | null
}

function toNumber(value: unknown) {
  const number = Number(value)
  return Number.isFinite(number) ? number : 0
}

function paymentValue(payment: PaymentRow) {
  if (payment.collected_amount_eur !== null && payment.collected_amount_eur !== undefined) {
    return Math.max(0, toNumber(payment.collected_amount_eur))
  }
  return Math.max(0, toNumber(payment.amount_eur))
}

function zeroWindow(): CashOutcomeWindow {
  return { replies: 0, deals: 0, cashEur: 0 }
}

function diffWindow(current: CashOutcomeWindow, previous: CashOutcomeWindow): CashOutcomeWindow {
  return {
    replies: current.replies - previous.replies,
    deals: current.deals - previous.deals,
    cashEur: Number((current.cashEur - previous.cashEur).toFixed(2)),
  }
}

export function buildCashOutcomeSnapshot(input: {
  activities: ProspectActivityRow[]
  payments: PaymentRow[]
  nowIso?: string
}): CashOutcomeSnapshot {
  const nowMs = new Date(input.nowIso ?? new Date().toISOString()).getTime()
  const dayMs = 24 * 60 * 60 * 1000
  const last7dStart = nowMs - 7 * dayMs
  const previous7dStart = nowMs - 14 * dayMs
  const last30dStart = nowMs - 30 * dayMs
  const previous30dStart = nowMs - 60 * dayMs

  const last7d = zeroWindow()
  const previous7d = zeroWindow()
  const last30d = zeroWindow()
  const previous30d = zeroWindow()

  for (const activity of input.activities) {
    const createdAtMs = activity.created_at ? new Date(activity.created_at).getTime() : Number.NaN
    if (!Number.isFinite(createdAtMs)) continue

    const isReply = activity.type === 'marked_replied'
    const isDeal = activity.type === 'marked_won'
    if (!isReply && !isDeal) continue

    if (createdAtMs >= last7dStart && createdAtMs <= nowMs) {
      if (isReply) last7d.replies += 1
      if (isDeal) last7d.deals += 1
    } else if (createdAtMs >= previous7dStart && createdAtMs < last7dStart) {
      if (isReply) previous7d.replies += 1
      if (isDeal) previous7d.deals += 1
    }

    if (createdAtMs >= last30dStart && createdAtMs <= nowMs) {
      if (isReply) last30d.replies += 1
      if (isDeal) last30d.deals += 1
    } else if (createdAtMs >= previous30dStart && createdAtMs < last30dStart) {
      if (isReply) previous30d.replies += 1
      if (isDeal) previous30d.deals += 1
    }
  }

  for (const payment of input.payments) {
    if (payment.status !== 'completed') continue
    const createdAtMs = payment.created_at ? new Date(payment.created_at).getTime() : Number.NaN
    if (!Number.isFinite(createdAtMs)) continue
    const value = paymentValue(payment)

    if (createdAtMs >= last7dStart && createdAtMs <= nowMs) {
      last7d.cashEur = Number((last7d.cashEur + value).toFixed(2))
    } else if (createdAtMs >= previous7dStart && createdAtMs < last7dStart) {
      previous7d.cashEur = Number((previous7d.cashEur + value).toFixed(2))
    }

    if (createdAtMs >= last30dStart && createdAtMs <= nowMs) {
      last30d.cashEur = Number((last30d.cashEur + value).toFixed(2))
    } else if (createdAtMs >= previous30dStart && createdAtMs < last30dStart) {
      previous30d.cashEur = Number((previous30d.cashEur + value).toFixed(2))
    }
  }

  return {
    last7d,
    previous7d,
    last30d,
    previous30d,
    delta7d: diffWindow(last7d, previous7d),
    delta30d: diffWindow(last30d, previous30d),
  }
}
