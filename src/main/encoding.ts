import { Buffer } from 'node:buffer'
import type { Encoding } from '../shared/types'

export function detectEncoding(buf: Buffer): Encoding {
  if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) return 'utf8bom'
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) return 'utf16le'
  if (buf.length >= 2 && buf[0] === 0xfe && buf[1] === 0xff) return 'utf16be'
  return 'utf8'
}

function swap16(buf: Buffer): Buffer {
  const out = Buffer.from(buf) // copy
  for (let i = 0; i + 1 < out.length; i += 2) { const t = out[i]; out[i] = out[i + 1]; out[i + 1] = t }
  return out
}

export function decode(buf: Buffer, enc: Encoding): string {
  switch (enc) {
    case 'utf8': return buf.toString('utf8')
    case 'utf8bom': return buf.subarray(3).toString('utf8')
    case 'utf16le': return buf.subarray(2).toString('utf16le') // strip LE BOM
    case 'utf16be': return swap16(buf.subarray(2)).toString('utf16le') // strip BE BOM, swap to LE
  }
}

export function encode(text: string, enc: Encoding): Buffer {
  switch (enc) {
    case 'utf8': return Buffer.from(text, 'utf8')
    case 'utf8bom': return Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(text, 'utf8')])
    case 'utf16le': return Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(text, 'utf16le')])
    case 'utf16be': return Buffer.concat([Buffer.from([0xfe, 0xff]), swap16(Buffer.from(text, 'utf16le'))])
  }
}
