import { describe, it, expect } from 'vitest'
import { validateChatInput } from './chat-validation'

describe('validateChatInput', () => {
  it('accepte un input valide', () => {
    const result = validateChatInput({ conversationId: 'conv-1', message: 'Bonjour' })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.conversationId).toBe('conv-1')
      expect(result.message).toBe('Bonjour')
    }
  })

  it('rejette si conversationId absent', () => {
    const result = validateChatInput({ message: 'Bonjour' })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.status).toBe(400)
      expect(result.error).toMatch(/required/)
    }
  })

  it('rejette si message absent', () => {
    const result = validateChatInput({ conversationId: 'conv-1' })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.status).toBe(400)
  })

  it('rejette si message vide (espaces)', () => {
    const result = validateChatInput({ conversationId: 'conv-1', message: '   ' })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.status).toBe(400)
  })

  it('rejette si message trop long (>8000 chars)', () => {
    const result = validateChatInput({ conversationId: 'conv-1', message: 'a'.repeat(8001) })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.status).toBe(400)
      expect(result.error).toMatch(/8000/)
    }
  })

  it('accepte un message de 8000 chars exactement', () => {
    const result = validateChatInput({ conversationId: 'conv-1', message: 'a'.repeat(8000) })
    expect(result.ok).toBe(true)
  })

  it('préserve agentId si fourni', () => {
    const result = validateChatInput({ conversationId: 'c', message: 'hi', agentId: 'agent-1' })
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.agentId).toBe('agent-1')
  })

  it('trim le message avant validation de longueur', () => {
    const result = validateChatInput({ conversationId: 'c', message: '  hello  ' })
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.message).toBe('hello')
  })
})
