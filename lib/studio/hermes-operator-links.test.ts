import { describe, expect, it } from 'vitest'
import {
  buildHermesOperatorEffectHref,
  buildHermesOperatorEffectLabel,
} from '@/lib/studio/hermes-operator-links'

describe('hermes operator links', () => {
  it('maps Hermes side effects to direct operator destinations', () => {
    expect(buildHermesOperatorEffectHref('follow_up_scan')).toBe(
      '/studio/prospects?status=follow_up_due'
    )
    expect(buildHermesOperatorEffectHref('prospect')).toBe('/studio/prospects')
    expect(buildHermesOperatorEffectHref('devops')).toBe('/studio/infrastructure')
  })

  it('maps Hermes side effects to compact labels', () => {
    expect(buildHermesOperatorEffectLabel('follow_up_scan')).toBe('FU')
    expect(buildHermesOperatorEffectLabel('prospect')).toBe('PRO')
    expect(buildHermesOperatorEffectLabel('devops')).toBe('OPS')
  })
})
