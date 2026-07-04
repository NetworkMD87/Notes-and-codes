import { describe, it, expect } from 'vitest'
import { ACCENT_PALETTE, HIGHLIGHT_COLOURS } from '../../src/shared/types'

describe('shared colour palette', () => {
  it('has 18 valid-hex accents', () => {
    expect(ACCENT_PALETTE).toHaveLength(18)
    for (const c of ACCENT_PALETTE) expect(c.value).toMatch(/^#[0-9a-f]{6}$/i)
  })
  it('highlight colours mirror the accent palette names', () => {
    expect(ACCENT_PALETTE.map(c => c.name.toLowerCase())).toEqual([...HIGHLIGHT_COLOURS])
  })
})
