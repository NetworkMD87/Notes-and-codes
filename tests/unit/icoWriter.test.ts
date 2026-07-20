import { describe, it, expect } from 'vitest'
// scripts/ is a build script outside tsconfig's "src" include, so this import is untyped.
import { writeIco } from '../../scripts/icoWriter.mjs'

const frame = (size: number, byte: number, len: number) => ({
  size,
  png: Buffer.alloc(len, byte)
})

describe('writeIco', () => {
  it('writes the ICO header: reserved 0, type 1, frame count', () => {
    const ico = writeIco([frame(16, 1, 10), frame(32, 2, 20)])
    expect(ico.readUInt16LE(0)).toBe(0)
    expect(ico.readUInt16LE(2)).toBe(1)
    expect(ico.readUInt16LE(4)).toBe(2)
  })

  it('records each frame size in the directory entry', () => {
    const ico = writeIco([frame(16, 1, 10), frame(48, 2, 20)])
    expect(ico.readUInt8(6)).toBe(16)
    expect(ico.readUInt8(7)).toBe(16)
    expect(ico.readUInt8(22)).toBe(48)
    expect(ico.readUInt8(23)).toBe(48)
  })

  it('encodes 256 as 0, which is how ICO represents it', () => {
    const ico = writeIco([frame(256, 1, 10)])
    expect(ico.readUInt8(6)).toBe(0)
    expect(ico.readUInt8(7)).toBe(0)
  })

  it('declares truecolour: 1 plane, 32bpp, no palette', () => {
    const ico = writeIco([frame(32, 1, 10)])
    expect(ico.readUInt8(8)).toBe(0)      // palette colour count
    expect(ico.readUInt8(9)).toBe(0)      // reserved
    expect(ico.readUInt16LE(10)).toBe(1)  // colour planes
    expect(ico.readUInt16LE(12)).toBe(32) // bits per pixel
  })

  it('gives each frame the right byte length and a non-overlapping offset', () => {
    const ico = writeIco([frame(16, 1, 10), frame(32, 2, 20), frame(48, 3, 30)])
    const dirEnd = 6 + 3 * 16
    expect(ico.readUInt32LE(14)).toBe(10)
    expect(ico.readUInt32LE(18)).toBe(dirEnd)
    expect(ico.readUInt32LE(30)).toBe(20)
    expect(ico.readUInt32LE(34)).toBe(dirEnd + 10)
    expect(ico.readUInt32LE(46)).toBe(30)
    expect(ico.readUInt32LE(50)).toBe(dirEnd + 30)
  })

  it('stores each payload verbatim at its declared offset', () => {
    const ico = writeIco([frame(16, 0xaa, 4), frame(32, 0xbb, 4)])
    const off1 = ico.readUInt32LE(18)
    const off2 = ico.readUInt32LE(34)
    expect(ico.subarray(off1, off1 + 4)).toEqual(Buffer.alloc(4, 0xaa))
    expect(ico.subarray(off2, off2 + 4)).toEqual(Buffer.alloc(4, 0xbb))
  })

  it('produces a file exactly as long as its parts', () => {
    const ico = writeIco([frame(16, 1, 10), frame(32, 2, 20)])
    expect(ico.length).toBe(6 + 2 * 16 + 10 + 20)
  })
})
