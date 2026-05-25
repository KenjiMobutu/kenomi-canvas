import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('smoke-prospect-agent prospect surface', () => {
  it('guards the Prospect Studio surface and run contract', () => {
    expect(existsSync('scripts/smoke-prospect-agent.mjs')).toBe(true)
    const source = readFileSync('scripts/smoke-prospect-agent.mjs', 'utf8')

    expect(source).toContain('PROSPECT_STUDIO_URL')
    expect(source).toContain('/studio/prospects')
    expect(source).toContain('/api/studio/prospects')
    expect(source).toContain('/api/studio/prospects/run')
    expect(source).toContain('prospect run surface')
  })
})
