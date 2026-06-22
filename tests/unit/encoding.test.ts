import { describe, it, expect } from 'vitest'
import { Buffer } from 'node:buffer'
import { detectEncoding, decode, encode } from '../../src/main/encoding'

describe('encoding', () => {
  it('detects BOMs and defaults to utf8', () => {
    expect(detectEncoding(Buffer.from('hello'))).toBe('utf8')
    expect(detectEncoding(Buffer.from([0xef, 0xbb, 0xbf, 0x61]))).toBe('utf8bom')
    expect(detectEncoding(Buffer.from([0xff, 0xfe, 0x61, 0x00]))).toBe('utf16le')
    expect(detectEncoding(Buffer.from([0xfe, 0xff, 0x00, 0x61]))).toBe('utf16be')
  })
  it('round-trips each encoding', () => {
    for (const enc of ['utf8', 'utf8bom', 'utf16le', 'utf16be'] as const) {
      const text = 'héllo • world\n2nd line'
      expect(decode(encode(text, enc), enc)).toBe(text)
    }
  })
  it('writes and strips the UTF-8 BOM', () => {
    const buf = encode('x', 'utf8bom')
    expect([buf[0], buf[1], buf[2]]).toEqual([0xef, 0xbb, 0xbf])
    expect(decode(buf, 'utf8bom')).toBe('x')
  })
  it('utf16be round-trips via byte-swap', () => {
    const buf = encode('AB', 'utf16be')
    expect([buf[0], buf[1]]).toEqual([0xfe, 0xff]) // BOM
    expect(decode(buf, 'utf16be')).toBe('AB')
  })
})
