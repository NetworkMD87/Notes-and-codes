import { promises as fs } from 'node:fs'
import type { EolMode, ReadResult, Encoding } from '../shared/types'
import { detectEncoding, decode, encode } from './encoding'
import { atomicWrite } from './atomicWrite'

/** Above this, refuse to open — Monaco freezes/OOMs on very large files. */
export const MAX_OPEN_BYTES = 50 * 1024 * 1024

export function detectEol(content: string): EolMode {
  return content.includes('\r\n') ? 'CRLF' : 'LF'
}

/** True if the buffer has a NUL byte in its first chunk. Only meaningful once a BOM has
 *  been ruled out — UTF-16 text is full of NULs but is identified by its BOM. */
function hasNulByte(buf: Buffer): boolean {
  const n = Math.min(buf.length, 8192)
  for (let i = 0; i < n; i++) if (buf[i] === 0) return true
  return false
}

export async function readFileForEditor(path: string, maxBytes = MAX_OPEN_BYTES): Promise<ReadResult> {
  let size: number
  try { size = (await fs.stat(path)).size } catch { return { ok: false, reason: 'Could not open the file.' } }
  if (size > maxBytes) {
    const mb = (n: number) => Math.max(1, Math.round(n / (1024 * 1024)))
    return { ok: false, reason: `This file is too large to open (${mb(size)} MB; the limit is ${mb(maxBytes)} MB).` }
  }
  const buf = await fs.readFile(path)
  const encoding = detectEncoding(buf)
  // No recognized BOM + NUL bytes ⇒ a binary file (or BOM-less UTF-16), which would
  // render as garbage and be corrupted by a save's decode→encode round-trip.
  if (encoding === 'utf8' && hasNulByte(buf)) {
    return { ok: false, reason: 'This looks like a binary file — Notes & Codes edits text only.' }
  }
  const content = decode(buf, encoding)
  return { ok: true, file: { filePath: path, content, eol: detectEol(content), encoding } }
}

export async function writeFile(path: string, content: string, eol: EolMode, encoding: Encoding): Promise<void> {
  const normalized = content.replace(/\r\n/g, '\n')
  const withEol = eol === 'CRLF' ? normalized.replace(/\n/g, '\r\n') : normalized
  await atomicWrite(path, encode(withEol, encoding))
}
