import { expect, it } from 'vitest'
import type { ProspectActivityType, ProspectOutreachKind, ProspectPipelineStatus } from './types'

it('accepts crm-local pipeline statuses', () => {
  const statuses: ProspectPipelineStatus[] = ['follow_up_due', 'sent', 'won']
  expect(statuses).toEqual(['follow_up_due', 'sent', 'won'])
})

it('accepts follow-up kinds and activity types', () => {
  const kinds: ProspectOutreachKind[] = ['initial', 'follow_up_1', 'follow_up_2', 'follow_up_3']
  const activities: ProspectActivityType[] = ['follow_up_generated', 'follow_up_marked_sent']

  expect(kinds).toEqual(['initial', 'follow_up_1', 'follow_up_2', 'follow_up_3'])
  expect(activities).toEqual(['follow_up_generated', 'follow_up_marked_sent'])
})
