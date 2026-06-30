import { describe, it, expect } from 'vitest'
import { applyStroke, clampToLength } from '../../src/renderer/highlights'
import type { Highlight } from '../../src/shared/types'

describe('applyStroke', () => {
  it('paints into empty', () => {
    expect(applyStroke([], { start: 0, end: 5 }, 'yellow')).toEqual([{ start: 0, end: 5, colour: 'yellow' }])
  })
  it('merges adjacent same colour', () => {
    const out = applyStroke([{ start: 0, end: 5, colour: 'yellow' }], { start: 5, end: 10 }, 'yellow')
    expect(out).toEqual([{ start: 0, end: 10, colour: 'yellow' }])
  })
  it('paints over a different colour (overwrites, splitting)', () => {
    const out = applyStroke([{ start: 0, end: 10, colour: 'yellow' }], { start: 3, end: 6 }, 'green')
    expect(out).toEqual([
      { start: 0, end: 3, colour: 'yellow' },
      { start: 3, end: 6, colour: 'green' },
      { start: 6, end: 10, colour: 'yellow' },
    ])
  })
  it('erases when the stroke is fully covered by the same colour', () => {
    const out = applyStroke([{ start: 0, end: 10, colour: 'yellow' }], { start: 2, end: 5 }, 'yellow')
    expect(out).toEqual([
      { start: 0, end: 2, colour: 'yellow' },
      { start: 5, end: 10, colour: 'yellow' },
    ])
  })
  it('fills a gap (not fully covered → paint, not erase)', () => {
    const out = applyStroke([{ start: 0, end: 3, colour: 'yellow' }], { start: 0, end: 6 }, 'yellow')
    expect(out).toEqual([{ start: 0, end: 6, colour: 'yellow' }])
  })
  it('ignores an empty/inverted range', () => {
    const existing: Highlight[] = [{ start: 0, end: 5, colour: 'yellow' }]
    expect(applyStroke(existing, { start: 4, end: 4 }, 'green')).toEqual(existing)
  })
})

describe('clampToLength', () => {
  it('trims and drops out-of-bounds ranges', () => {
    const hs: Highlight[] = [
      { start: 0, end: 5, colour: 'yellow' },
      { start: 8, end: 20, colour: 'green' },
      { start: 30, end: 40, colour: 'pink' },
    ]
    expect(clampToLength(hs, 12)).toEqual([
      { start: 0, end: 5, colour: 'yellow' },
      { start: 8, end: 12, colour: 'green' },
    ])
  })
})
