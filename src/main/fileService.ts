import { promises as fs, type Stats } from 'node:fs'
import type { EolMode, ReadResult, Encoding, WriteResult } from '../shared/types'
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
  let st: Stats
  try { st = await fs.stat(path) } catch { return { ok: false, reason: 'Could not open the file.' } }
  if (st.size > maxBytes) {
    const mb = (n: number) => Math.max(1, Math.round(n / (1024 * 1024)))
    return { ok: false, reason: `This file is too large to open (${mb(st.size)} MB; the limit is ${mb(maxBytes)} MB).` }
  }
  const buf = await fs.readFile(path)
  const encoding = detectEncoding(buf)
  // No recognized BOM + NUL bytes ⇒ a binary file (or BOM-less UTF-16), which would
  // render as garbage and be corrupted by a save's decode→encode round-trip.
  if (encoding === 'utf8' && hasNulByte(buf)) {
    return { ok: false, reason: 'This looks like a binary file — Notes & Codes edits text only.' }
  }
  const content = decode(buf, encoding)
  return { ok: true, file: { filePath: path, content, eol: detectEol(content), encoding, mtimeMs: st.mtimeMs } }
}

/** Writes `content` to `path`. When `expectedMtime` is given and the file's live mtime differs,
 *  refuses instead — the caller last saw a different file, so writing would silently destroy
 *  whatever changed it. Omit `expectedMtime` to write unconditionally. */
export async function writeFile(path: string, content: string, eol: EolMode, encoding: Encoding,
                                expectedMtime?: number): Promise<WriteResult> {
  if (expectedMtime !== undefined) {
    // A vanished file is not a conflict — fall through and recreate it rather than trapping the save.
    let current: number | undefined
    try { current = (await fs.stat(path)).mtimeMs } catch { current = undefined }
    if (current !== undefined && current !== expectedMtime) return { ok: false, reason: 'stale' }
  }
  const normalized = content.replace(/\r\n/g, '\n')
  const withEol = eol === 'CRLF' ? normalized.replace(/\n/g, '\r\n') : normalized
  await atomicWrite(path, encode(withEol, encoding))
  // atomicWrite renames a temp file into place, so the live mtime has to be read back. If that
  // stat fails, the bytes still landed — report the write as the success it was, with no mtime.
  try { return { ok: true, mtimeMs: (await fs.stat(path)).mtimeMs } }
  catch { return { ok: true, mtimeMs: undefined } }
}
