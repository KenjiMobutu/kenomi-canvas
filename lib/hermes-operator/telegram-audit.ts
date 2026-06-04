export function buildTelegramAuditInsert(input: {
  userId: string
  remoteActor: string
  rawText: string
  intentKind: string
  executed: boolean
  blockedReason?: string | null
  responseSummary?: string
  metadata?: Record<string, unknown>
}) {
  return {
    user_id: input.userId,
    channel: 'telegram' as const,
    remote_actor: input.remoteActor,
    raw_text: input.rawText,
    intent_kind: input.intentKind,
    executed: input.executed,
    blocked_reason: input.blockedReason ?? null,
    response_summary: input.responseSummary ?? '',
    metadata: input.metadata ?? {},
  }
}
