import { describe, expect, it } from 'vitest'
import { formatActionLabel, isKnownActionType } from './action-labels'

describe('formatActionLabel', () => {
  it('formats the known approval action types explicitly', () => {
    expect(formatActionLabel('send_outreach')).toBe('Send outreach')
    expect(formatActionLabel('send_follow_up')).toBe('Send follow-up')
    expect(formatActionLabel('record_tracking')).toBe('Record tracking')
  })

  it('falls back to a readable label for unknown action types', () => {
    expect(formatActionLabel('custom_operator_action')).toBe('custom operator action')
  })

  it('returns the explicit unknown label when actionType is missing', () => {
    expect(formatActionLabel(undefined)).toBe('Action inconnue')
    expect(formatActionLabel(null)).toBe('Action inconnue')
  })
})

describe('isKnownActionType', () => {
  it('detects known action types', () => {
    expect(isKnownActionType('send_outreach')).toBe(true)
    expect(isKnownActionType('custom_operator_action')).toBe(false)
  })
})
