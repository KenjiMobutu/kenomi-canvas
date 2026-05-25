import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('smoke-hermes-public-deploy public Hermes contract', () => {
  it('guards the public Hermes reverse proxy and private Ollama backend', () => {
    expect(existsSync('scripts/smoke-hermes-public-deploy.mjs')).toBe(true)
    const source = readFileSync('scripts/smoke-hermes-public-deploy.mjs', 'utf8')

    expect(source).toContain('HERMES_PUBLIC_URL')
    expect(source).toContain('OLLAMA_BASE_URL')
    expect(source).toContain('/healthz')
    expect(source).toContain('/api/tags')
    expect(source).toContain('public ollama exposure')
    expect(source).toContain('private ollama endpoint')
  })
})
