import { describe, expect, it } from 'vitest'
import { AGENTS_DATA, agentById } from './studio-utils'

describe('AGENTS_DATA', () => {
  it('accepts prospect as a first-class autonomous agent', () => {
    expect(AGENTS_DATA.some((agent) => agent.id === 'prospect')).toBe(true)
    expect(AGENTS_DATA.find((agent) => agent.id === 'prospect')?.name).toBe('Prospect')
  })
})

describe('agentById', () => {
  it('returns prospect when requested', () => {
    expect(agentById('prospect').id).toBe('prospect')
  })
})
