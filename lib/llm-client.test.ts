import { describe, it, expect } from 'vitest'
import { computeCostUsd } from './llm-client'

describe('computeCostUsd', () => {
  it('calcule le coût Claude Sonnet (1000 input + 500 output)', () => {
    expect(
      computeCostUsd('claude-sonnet-4-6', {
        prompt_tokens: 1000,
        completion_tokens: 500,
        total_tokens: 1500,
      })
    ).toBeCloseTo(0.0105, 6)
  })

  it('calcule le coût Haiku', () => {
    expect(
      computeCostUsd('claude-haiku-4-5-20251001', {
        prompt_tokens: 2000,
        completion_tokens: 1000,
        total_tokens: 3000,
      })
    ).toBeCloseTo(0.0056, 6)
  })

  it('retourne 0 pour Ollama local', () => {
    expect(
      computeCostUsd('qwen3:8b', {
        prompt_tokens: 1000,
        completion_tokens: 500,
        total_tokens: 1500,
      })
    ).toBe(0)
  })

  it('retourne 0 pour un modèle inconnu (fail-safe)', () => {
    expect(
      computeCostUsd('gpt-99', {
        prompt_tokens: 100,
        completion_tokens: 100,
        total_tokens: 200,
      })
    ).toBe(0)
  })

  it('accepte zéro tokens sans diviser par zéro', () => {
    expect(
      computeCostUsd('claude-sonnet-4-6', {
        prompt_tokens: 0,
        completion_tokens: 0,
        total_tokens: 0,
      })
    ).toBe(0)
  })
})
