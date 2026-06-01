import { describe, expect, it } from 'vitest'
import { filterRowsByVentureIds } from './ownership'

describe('filterRowsByVentureIds', () => {
  it('keeps only rows attached to the allowed venture ids', () => {
    const rows = [
      { id: 'a', venture_id: 'venture-1', value: 1 },
      { id: 'b', venture_id: 'venture-2', value: 2 },
      { id: 'c', venture_id: null, value: 3 },
    ]

    expect(filterRowsByVentureIds(rows, ['venture-1'])).toEqual([
      { id: 'a', venture_id: 'venture-1', value: 1 },
    ])
  })

  it('returns an empty array when the user has no ventures', () => {
    const rows = [{ id: 'a', venture_id: 'venture-1' }]
    expect(filterRowsByVentureIds(rows, [])).toEqual([])
  })
})
