import { describe, expect, it } from 'vitest'
import { STUDIO_HOME_LEFT_SECTIONS, STUDIO_HOME_RIGHT_SECTIONS } from './studio-home-layout'

describe('studio home layout', () => {
  it('keeps the revenue-first stack on the main column', () => {
    expect(STUDIO_HOME_LEFT_SECTIONS).toEqual([
      'revenue_strip_mobile',
      'daily_brief',
      'cash_movement',
      'cash_queue',
      'decision_hero',
      'up_next',
    ])
  })

  it('removes meta ops panels from the desktop support rail', () => {
    expect(STUDIO_HOME_RIGHT_SECTIONS).toEqual(['revenue_strip', 'kpi_grid'])
  })
})
