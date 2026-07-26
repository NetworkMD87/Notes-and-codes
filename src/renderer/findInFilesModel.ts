// Pure half of Find in Files: searching OPEN buffers and merging with the disk results.
// No DOM, no node — unit-tested. The DOM half is findInFiles.ts.
import { searchText, MAX_MATCHES_PER_FILE, pathKey } from '../shared/searchText'
import type { SearchFileResult, SearchOptions } from '../shared/types'

export interface SearchableBuffer { filePath: string | null; title: string; content: string }

export function searchBuffers(buffers: SearchableBuffer[], query: string, opts: SearchOptions): SearchFileResult[] {
  const out: SearchFileResult[] = []
  for (const b of buffers) {
    const found = searchText(b.content, query, opts, MAX_MATCHES_PER_FILE + 1)
    if (!found.length) continue
    const truncated = found.length > MAX_MATCHES_PER_FILE
    out.push({
      path: b.filePath ?? '',
      ...(b.filePath ? {} : { title: b.title }),
      matches: truncated ? found.slice(0, MAX_MATCHES_PER_FILE) : found,
      truncated,
    })
  }
  return out
}

/**
 * Open buffers first — you are likelier to want the file you already have open — then disk
 * results in walk order. Main is already told to skip open paths, so a duplicate should be
 * impossible; the guard is here because "should be impossible" is not a rendering strategy.
 *
 * De-dupe key is case-folded (`pathKey`) — Windows paths are case-insensitive, so
 * `C:\proj\a.txt` and `c:\proj\A.txt` must collide here even though they differ as strings.
 * `.filter(Boolean)` on the buffer side stays load-bearing: every untitled buffer has
 * `path: ''`, and without this filter `pathKey('')` would fold every one of them into a single
 * "seen" entry, silently merging distinct untitled results into one.
 */
export function mergeResults(bufferResults: SearchFileResult[], disk: SearchFileResult[]): SearchFileResult[] {
  const seen = new Set(bufferResults.map(r => r.path).map(pathKey))
  return [...bufferResults, ...disk.filter(r => !seen.has(pathKey(r.path)))]
}
