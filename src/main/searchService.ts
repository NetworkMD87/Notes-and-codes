import { promises as fs } from 'node:fs'
import { walkFiles } from './fsService'
import { detectEncoding, decode } from './encoding'
import { searchText, MIN_QUERY_LENGTH, MAX_MATCHES_PER_FILE, pathKey } from '../shared/searchText'
import type { SearchFileResult, SearchRequest, SearchResponse } from '../shared/types'

const MAX_MATCHES_TOTAL = 1000
const MAX_FILE_BYTES = 1024 * 1024
const BINARY_SNIFF_BYTES = 8192

export interface SearchIo {
  stat(path: string): Promise<{ isFile(): boolean; size: number }>
  readFile(path: string): Promise<Buffer>
}

const DEFAULT_IO: SearchIo = {
  stat: path => fs.stat(path),
  readFile: path => fs.readFile(path),
}

function hasNulByte(buf: Buffer): boolean {
  const n = Math.min(buf.length, BINARY_SNIFF_BYTES)
  for (let i = 0; i < n; i++) if (buf[i] === 0) return true
  return false
}

export function isBinary(buf: Buffer): boolean {
  // Recognized text encodings (UTF-16, UTF-8 BOM) are never binary, even if they contain NUL bytes.
  // No recognized BOM + NUL bytes ⇒ a binary file (or BOM-less UTF-16).
  const encoding = detectEncoding(buf)
  if (encoding === 'utf8' && hasNulByte(buf)) return true
  return false
}

/**
 * Search the folder for `req.query`.
 *
 * `shouldCancel` is INJECTED rather than read from module state, so the cancellation branch is
 * unit-testable without driving the IPC layer — the same reason contextMenuAction takes
 * `isPackaged`. The generation counter itself lives in ipc.ts.
 *
 * Files open in a tab arrive in `skipPaths`: the renderer already searched their LIVE content,
 * which for a dirty buffer differs from what is on disk. One rule handles both staleness and
 * duplication.
 */
export async function searchFiles(
  req: SearchRequest,
  shouldCancel: () => boolean = () => false,
  io: SearchIo = DEFAULT_IO,
): Promise<SearchResponse> {
  const empty: SearchResponse = { files: [], totalMatches: 0, truncated: false, searchId: req.searchId }
  if (!req.root || req.query.length < MIN_QUERY_LENGTH || shouldCancel()) return empty

  const walk = await walkFiles(req.root, req.filter, { shouldCancel })
  if (shouldCancel()) return empty // don't spend a single stat/read on a search that's already stale

  const skip = new Set(req.skipPaths.map(pathKey))
  const files: SearchFileResult[] = []
  let total = 0
  let truncated = walk.truncated

  for (const path of walk.files) {
    if (shouldCancel()) return empty
    if (total >= MAX_MATCHES_TOTAL) { truncated = true; break }
    if (skip.has(pathKey(path))) continue

    let buf: Buffer
    try {
      const st = await io.stat(path)
      if (shouldCancel()) return empty
      if (!st.isFile() || st.size > MAX_FILE_BYTES) continue
      buf = await io.readFile(path)
      if (shouldCancel()) return empty
    } catch {
      if (shouldCancel()) return empty
      continue // locked, denied, deleted mid-walk — one bad file must not fail the search
    }
    if (isBinary(buf)) continue

    const text = decode(buf, detectEncoding(buf))
    if (shouldCancel()) return empty
    // Ask for one over the cap so "was it capped?" needs no second pass.
    const found = searchText(text, req.query, req.opts, MAX_MATCHES_PER_FILE + 1)
    if (shouldCancel()) return empty
    if (!found.length) continue

    const fileTruncated = found.length > MAX_MATCHES_PER_FILE
    let matches = fileTruncated ? found.slice(0, MAX_MATCHES_PER_FILE) : found
    if (total + matches.length > MAX_MATCHES_TOTAL) {
      matches = matches.slice(0, MAX_MATCHES_TOTAL - total)
      truncated = true
    }
    files.push({ path, matches, truncated: fileTruncated })
    total += matches.length
  }

  return { files, totalMatches: total, truncated, searchId: req.searchId }
}
