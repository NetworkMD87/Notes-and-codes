import { describe, it, expect } from 'vitest'
// scripts/ is a build script outside tsconfig's "src" include, so this import is untyped.
import { TILE_BG, TILE_RADIUS, ICON_LADDER, tileSvg } from '../../scripts/iconLadder.mjs'

describe('ICON_LADDER', () => {
  it('covers exactly the five .ico frame sizes, ascending', () => {
    expect(ICON_LADDER.map((e: { size: number }) => e.size)).toEqual([16, 24, 32, 48, 256])
  })

  it('drops the braces at 16px, keeps them at 24/32', () => {
    const art = Object.fromEntries(ICON_LADDER.map((e: { size: number; art: string }) => [e.size, e.art]))
    expect(art[16]).toBe('amp')
    expect(art[24]).toBe('glyph')
    expect(art[32]).toBe('glyph')
  })

  it('reuses the committed {N&C} tile at 48 and 256', () => {
    const art = Object.fromEntries(ICON_LADDER.map((e: { size: number; art: string }) => [e.size, e.art]))
    expect(art[48]).toBe('tile')
    expect(art[256]).toBe('tile')
  })

  it('gives every composited size a scale, and the passthrough sizes none', () => {
    for (const e of ICON_LADDER as Array<{ art: string; scale?: number }>) {
      if (e.art === 'tile') expect(e.scale).toBeUndefined()
      else expect(typeof e.scale).toBe('number')
    }
  })

  it('uses the measured tile colour and radius', () => {
    expect(TILE_BG).toBe('#1B1D21')
    expect(TILE_RADIUS).toBe(0.2)
  })
})

describe('tileSvg', () => {
  it('is a square SVG of the requested size', () => {
    expect(tileSvg(32)).toContain('width="32" height="32"')
    expect(tileSvg(32)).toContain('xmlns="http://www.w3.org/2000/svg"')
  })

  it('fills with the tile colour and rounds corners at 20% of size', () => {
    const svg = tileSvg(32)
    expect(svg).toContain('fill="#1B1D21"')
    expect(svg).toContain('rx="6.4"')
    expect(svg).toContain('ry="6.4"')
  })

  it('scales the radius with the size', () => {
    expect(tileSvg(16)).toContain('rx="3.2"')
    expect(tileSvg(256)).toContain('rx="51.2"')
  })
})
