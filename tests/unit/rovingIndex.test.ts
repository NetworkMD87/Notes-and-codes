import { describe, expect, it } from 'vitest'
import { moveRovingIndex } from '../../src/renderer/rovingIndex'

describe('moveRovingIndex', () => {
  const enabled = [true, false, true, true]
  it('moves and wraps vertically while skipping disabled entries', () => {
    expect(moveRovingIndex(0, enabled, 'ArrowDown', 'vertical')).toBe(2)
    expect(moveRovingIndex(3, enabled, 'ArrowDown', 'vertical')).toBe(0)
    expect(moveRovingIndex(0, enabled, 'ArrowUp', 'vertical')).toBe(3)
  })
  it('maps horizontal arrows and Home/End deterministically', () => {
    expect(moveRovingIndex(0, enabled, 'ArrowRight', 'horizontal')).toBe(2)
    expect(moveRovingIndex(2, enabled, 'ArrowLeft', 'horizontal')).toBe(0)
    expect(moveRovingIndex(2, enabled, 'Home', 'horizontal')).toBe(0)
    expect(moveRovingIndex(0, enabled, 'End', 'horizontal')).toBe(3)
  })
  it('ignores keys for the other orientation and returns null with no enabled item', () => {
    expect(moveRovingIndex(0, enabled, 'ArrowRight', 'vertical')).toBeNull()
    expect(moveRovingIndex(0, [false, false], 'End', 'vertical')).toBeNull()
  })
})
