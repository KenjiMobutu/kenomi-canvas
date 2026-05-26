import { describe, expect, it } from 'vitest'
import { derivePipelineStatus, normalizeProspectTags } from './crm-fields'

describe('normalizeProspectTags', () => {
  it('trims, lowercases, and deduplicates tags', () => {
    expect(normalizeProspectTags([' SaaS ', 'saas', 'Urgent'])).toEqual(['saas', 'urgent'])
  })
})

describe('derivePipelineStatus', () => {
  it('maps open prospects with overdue followup to follow_up_due', () => {
    expect(
      derivePipelineStatus({
        pipelineStatus: 'sent',
        nextFollowupAt: '2026-05-25T10:00:00.000Z',
        nowIso: '2026-05-26T10:00:00.000Z',
      })
    ).toBe('follow_up_due')
  })

  it('preserves explicit pipeline stages that should not be overwritten by due logic', () => {
    expect(
      derivePipelineStatus({
        pipelineStatus: 'draft_created',
        nextFollowupAt: '2026-05-25T10:00:00.000Z',
        nowIso: '2026-05-26T10:00:00.000Z',
      })
    ).toBe('draft_created')
  })
})
