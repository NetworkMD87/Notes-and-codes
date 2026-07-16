import { describe, it, expect } from 'vitest'
import { THEME_LIST } from '../../src/shared/themes'
import { THEMES } from '../../src/renderer/themes'

describe('shared THEME_LIST', () => {
  it('mirrors every renderer THEME (id + label, in order) plus follow-os — no drift', () => {
    const fromThemes = Object.values(THEMES).map(t => ({ id: t.id, label: t.label }))
    expect(THEME_LIST).toEqual([...fromThemes, { id: 'follow-os', label: 'Follow OS' }])
  })
  it('is pure id/label data (boundary-safe for the main process)', () => {
    for (const t of THEME_LIST) {
      expect(typeof t.id).toBe('string')
      expect(typeof t.label).toBe('string')
      expect(Object.keys(t).sort()).toEqual(['id', 'label'])
    }
  })
})
