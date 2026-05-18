import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { isRateLimited } from './rate-limit'

describe('isRateLimited', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('accepte les premières requêtes dans la limite', () => {
    const opts = { limit: 3, windowMs: 60_000 }
    expect(isRateLimited('test-key-1', opts)).toBe(false)
    expect(isRateLimited('test-key-1', opts)).toBe(false)
    expect(isRateLimited('test-key-1', opts)).toBe(false)
  })

  it('bloque la requête qui dépasse la limite', () => {
    const opts = { limit: 3, windowMs: 60_000 }
    isRateLimited('test-key-2', opts)
    isRateLimited('test-key-2', opts)
    isRateLimited('test-key-2', opts)
    expect(isRateLimited('test-key-2', opts)).toBe(true)
  })

  it('réinitialise le compteur après la fenêtre', () => {
    const opts = { limit: 2, windowMs: 60_000 }
    isRateLimited('test-key-3', opts)
    isRateLimited('test-key-3', opts)
    expect(isRateLimited('test-key-3', opts)).toBe(true) // bloqué

    vi.advanceTimersByTime(61_000)

    expect(isRateLimited('test-key-3', opts)).toBe(false) // fenêtre réinitialisée
  })

  it('des clés différentes ont des compteurs indépendants', () => {
    const opts = { limit: 1, windowMs: 60_000 }
    expect(isRateLimited('key-a', opts)).toBe(false)
    expect(isRateLimited('key-b', opts)).toBe(false)
    expect(isRateLimited('key-a', opts)).toBe(true) // key-a bloquée
    expect(isRateLimited('key-b', opts)).toBe(true) // key-b bloquée indépendamment
  })
})
