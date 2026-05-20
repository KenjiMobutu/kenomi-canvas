import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('smoke-vision-loop canonical revenue contract', () => {
  it('guards Scout -> public landing -> revenue as the canonical path', () => {
    const source = readFileSync('scripts/smoke-vision-loop.mjs', 'utf8')

    expect(source).toContain('buyer')
    expect(source).toContain('urgent_pain')
    expect(source).toContain('concrete_promise')
    expect(source).toContain('materializeValidatedIdea')
    expect(source).toContain('client_checkout_public_landing_only')
    expect(source).toContain('app/api/public/stripe/checkout/route.ts')
    expect(source).toContain('publicLandingUrl')
  })
})
