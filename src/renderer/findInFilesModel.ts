// Pure half of Find in Files: searching OPEN buffers and merging with the disk results.
// No DOM, no node — unit-tested. The DOM half is findInFiles.ts.
import { searchText } from '../shared/searchText'
import type { SearchFileResult, SearchOptions } from '../shared/types'

const MAX_MATCHES_PER_FILE = 20

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
 */
export function mergeResults(bufferResults: SearchFileResult[], disk: SearchFileResult[]): SearchFileResult[] {
  const seen = new Set(bufferResults.map(r => r.path).filter(Boolean))
  return [...bufferResults, ...disk.filter(r => !seen.has(r.path))]
}
