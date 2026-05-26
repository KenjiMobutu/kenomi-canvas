import { expect, it } from 'vitest'
import type { ProspectMemoryKind } from './types'

it('accepts prospect memory kinds', () => {
  const kinds: ProspectMemoryKind[] = [
    'prospect_created',
    'outreach_draft_created',
    'follow_up_generated',
    'reply_recorded',
    'prospect_won',
    'prospect_lost',
    'operator_note',
  ]
  expect(kinds).toHaveLength(7)
})
