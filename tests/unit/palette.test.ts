import { describe, it, expect } from 'vitest'
import { ACCENT_PALETTE, HIGHLIGHT_COLOURS, HL_HEX } from '../../src/shared/types'

describe('shared colour palette', () => {
  it('has 18 valid-hex accents', () => {
    expect(ACCENT_PALETTE).toHaveLength(18)
    for (const c of ACCENT_PALETTE) expect(c.value).toMatch(/^#[0-9a-f]{6}$/i)
  })
  it('highlight colours mirror the accent palette names', () => {
    expect(ACCENT_PALETTE.map(c => c.name.toLowerCase())).toEqual([...HIGHLIGHT_COLOURS])
  })
  it('HL_HEX maps every highlight colour to its palette hex', () => {
    expect(Object.keys(HL_HEX).sort()).toEqual([...HIGHLIGHT_COLOURS].sort())
    for (const c of ACCENT_PALETTE) expect(HL_HEX[c.name.toLowerCase() as keyof typeof HL_HEX]).toBe(c.value)
  })
})
