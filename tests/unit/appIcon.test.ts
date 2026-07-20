import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { TRAY_PNG_DARK_BG_BASE64, TRAY_PNG_LIGHT_BG_BASE64 } from '../../src/main/trayImage'

/** Frame table of an .ico: [{size, bytes, isPng}]. 0 in the size byte means 256. */
function parseIco(buf: Buffer) {
  const n = buf.readUInt16LE(4)
  return Array.from({ length: n }, (_, i) => {
    const o = 6 + i * 16
    const w = buf.readUInt8(o)
    const off = buf.readUInt32LE(o + 12)
    return {
      size: w === 0 ? 256 : w,
      bytes: buf.readUInt32LE(o + 8),
      isPng: buf.subarray(off, off + 4).toString('hex') === '89504e47'
    }
  })
}

/** width/height out of a PNG's IHDR. */
function pngSize(buf: Buffer) {
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) }
}

describe('build/icon.ico', () => {
  const ico = readFileSync('build/icon.ico')

  it('carries exactly the five frames Windows asks for, ascending', () => {
    expect(parseIco(ico).map((f) => f.size)).toEqual([16, 24, 32, 48, 256])
  })

  it('PNG-compresses every frame, so the icon stays small', () => {
    expect(parseIco(ico).every((f) => f.isPng)).toBe(true)
    // An uncompressed-BMP writer produces ~288KB for the same five frames.
    expect(ico.length).toBeLessThan(60_000)
  })

  it('declares every frame inside the file', () => {
    for (const f of parseIco(ico)) expect(f.bytes).toBeGreaterThan(0)
    expect(ico.length).toBeGreaterThan(6 + 5 * 16)
  })
})

describe('trayImage.ts', () => {
  it('embeds square 32x32 glyphs, so setIcon/Tray get a square image', () => {
    for (const b64 of [TRAY_PNG_DARK_BG_BASE64, TRAY_PNG_LIGHT_BG_BASE64]) {
      expect(pngSize(Buffer.from(b64, 'base64'))).toEqual({ width: 32, height: 32 })
    }
  })

  it('keeps the two taskbar-theme variants distinct', () => {
    expect(TRAY_PNG_DARK_BG_BASE64).not.toBe(TRAY_PNG_LIGHT_BG_BASE64)
  })
})
