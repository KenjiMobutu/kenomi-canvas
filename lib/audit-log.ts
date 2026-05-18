const SENSITIVE_KEY = /(secret|password|token|api[_-]?key|authorization)/i

export function sanitizeAuditMetadata(input: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(input).map(([key, value]) => [
      key,
      SENSITIVE_KEY.test(key) ? '[redacted]' : value,
    ])
  )
}

export async function insertAuditEvent(
  supabase: {
    from: (table: string) => {
      insert: (row: Record<string, unknown>) => PromiseLike<{ error: { message: string } | null }>
    }
  },
  event: {
    user_id: string
    agent_id?: string | null
    event_type: string
    severity?: 'debug' | 'info' | 'warn' | 'error'
    metadata?: Record<string, unknown>
  }
): Promise<void> {
  const { error } = await supabase.from('agent_events').insert({
    user_id: event.user_id,
    agent_id: event.agent_id ?? null,
    event_type: event.event_type,
    severity: event.severity ?? 'info',
    metadata: sanitizeAuditMetadata(event.metadata ?? {}),
  })

  if (error) console.error('[audit-log]', error.message)
}
