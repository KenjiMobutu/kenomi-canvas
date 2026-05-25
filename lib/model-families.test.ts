import { describe, expect, it } from 'vitest'
import { getModelFamily, isHermesModel } from './model-families'

describe('model families', () => {
  it('recognizes Hermes models', () => {
    expect(isHermesModel('hermes3:8b')).toBe(true)
    expect(getModelFamily('hermes3:latest')).toBe('hermes')
  })

  it('classifies non-Hermes models', () => {
    expect(getModelFamily('qwen3:8b')).toBe('qwen')
    expect(getModelFamily('claude-sonnet-4-6')).toBe('claude')
    expect(getModelFamily('foo')).toBe('other')
  })
})
