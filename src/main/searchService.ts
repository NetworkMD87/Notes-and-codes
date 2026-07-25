import { promises as fs } from 'node:fs'
import { walkFiles } from './fsService'
import { detectEncoding, decode } from './encoding'
import { searchText, MIN_QUERY_LENGTH } from '../shared/searchText'
import type { SearchFileResult, SearchRequest, SearchResponse } from '../shared/types'

const MAX_MATCHES_PER_FILE = 20
const MAX_MATCHES_TOTAL = 1000
const MAX_FILE_BYTES = 1024 * 1024
const BINARY_SNIFF_BYTES = 8192

export function isBinary(buf: Buffer): boolean {
  // Known text-encoding BOMs are never binary, even if they contain NUL bytes (UTF-16, etc.)
  if (buf.length >= 2 && ((buf[0] === 0xff && buf[1] === 0xfe) || (buf[0] === 0xfe && buf[1] === 0xff))) {
    return false
  }
  if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) return false
  const n = Math.min(buf.length, BINARY_SNIFF_BYTES)
  for (let i = 0; i < n; i++) if (buf[i] === 0) return true
  return false
}

/**
 * Search the folder for `req.query`.
 *
 * `superseded` is INJECTED rather than read from module state, so the cancellation branch is
 * unit-testable without driving the IPC layer — the same reason contextMenuAction takes
 * `isPackaged`. The generation counter itself lives in ipc.ts.
 *
 * Files open in a tab arrive in `skipPaths`: the renderer already searched their LIVE content,
 * which for a dirty buffer differs from what is on disk. One rule handles both staleness and
 * duplication.
 */
export async function searchFiles(req: SearchRequest, superseded: () => boolean = () => false): Promise<SearchResponse> {
  const empty: SearchResponse = { files: [], totalMatches: 0, truncated: false, searchId: req.searchId }
  if (!req.root || req.query.length < MIN_QUERY_LENGTH) return empty

  const walk = await walkFiles(req.root, req.showAll)
  const skip = new Set(req.skipPaths)
  const files: SearchFileResult[] = []
  let total = 0
  let truncated = walk.truncated

  for (const path of walk.files) {
    if (superseded()) return empty
    if (total >= MAX_MATCHES_TOTAL) { truncated = true; break }
    if (skip.has(path)) continue

    let buf: Buffer
    try {
      const st = await fs.stat(path)
      if (!st.isFile() || st.size > MAX_FILE_BYTES) continue
      buf = await fs.readFile(path)
    } catch { continue } // locked, denied, deleted mid-walk — one bad file must not fail the search
    if (isBinary(buf)) continue

    const text = decode(buf, detectEncoding(buf))
    // Ask for one over the cap so "was it capped?" needs no second pass.
    const found = searchText(text, req.query, req.opts, MAX_MATCHES_PER_FILE + 1)
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
