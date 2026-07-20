import { describe, it, expect } from 'vitest'
import { penCursor } from '../../src/renderer/penCursor'
import { HIGHLIGHT_COLOURS, HL_HEX } from '../../src/shared/types'

describe('penCursor', () => {
  it('returns a data-URI cursor with the tip hotspot and a crosshair fallback', () => {
    const v = penCursor('yellow')
    expect(v.startsWith('url("data:image/svg+xml,')).toBe(true)
    expect(v.endsWith('") 3 20, crosshair')).toBe(true)
  })

  it('percent-encodes the SVG so the hex # cannot truncate the URI', () => {
    const v = penCursor('yellow')
    expect(v).toContain('%23') // the encoded '#'
    expect(v.slice(v.indexOf(',') + 1)).not.toContain('#')
  })

  it("embeds the colour's own hex, so different colours differ", () => {
    expect(penCursor('yellow')).toContain(encodeURIComponent(HL_HEX.yellow))
    expect(penCursor('blue')).toContain(encodeURIComponent(HL_HEX.blue))
    expect(penCursor('yellow')).not.toBe(penCursor('blue'))
  })

  it('layers the artwork halo -> filled head -> outline', () => {
    const v = penCursor('yellow')
    const hex = encodeURIComponent(HL_HEX.yellow)
    expect(v.indexOf('%23ffffff')).toBeGreaterThanOrEqual(0)
    expect(v.indexOf(hex)).toBeGreaterThanOrEqual(0)
    expect(v.indexOf('%231f2937')).toBeGreaterThanOrEqual(0)
    expect(v.indexOf('%23ffffff')).toBeLessThan(v.indexOf(hex))
    expect(v.indexOf(hex)).toBeLessThan(v.indexOf('%231f2937'))
  })

  it('produces a value for every highlight colour', () => {
    for (const c of HIGHLIGHT_COLOURS) {
      expect(penCursor(c)).toContain(encodeURIComponent(HL_HEX[c]))
    }
  })

  it('declares the SVG namespace and a fixed 24x24 size', () => {
    const svg = decodeURIComponent(penCursor('red'))
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"')
    expect(svg).toContain('width="24" height="24"')
  })
})
