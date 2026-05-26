import { expect, it } from 'vitest'
import type { ProspectPipelineStatus } from './types'

it('accepts crm-local pipeline statuses', () => {
  const statuses: ProspectPipelineStatus[] = ['follow_up_due', 'sent', 'won']
  expect(statuses).toEqual(['follow_up_due', 'sent', 'won'])
})
