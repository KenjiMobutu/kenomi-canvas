export interface ChatInput {
  conversationId?: string
  message?: string
  agentId?: string
}

export interface ChatValidationResult {
  ok: true
  conversationId: string
  message: string
  agentId?: string
}

export interface ChatValidationError {
  ok: false
  error: string
  status: number
}

export function validateChatInput(input: ChatInput): ChatValidationResult | ChatValidationError {
  const { conversationId, message, agentId } = input

  if (!conversationId || !message?.trim()) {
    return { ok: false, error: 'conversationId and message are required', status: 400 }
  }

  if (message.length > 8000) {
    return { ok: false, error: 'Message trop long (max 8000 caractères)', status: 400 }
  }

  return { ok: true, conversationId, message: message.trim(), agentId }
}
