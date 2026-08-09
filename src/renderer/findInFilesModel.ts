// Pure half of Find in Files: searching OPEN buffers and merging with the disk results.
// No DOM, no node — unit-tested. The DOM half is findInFiles.ts.
import { visitSearchMatches, MAX_MATCHES_PER_FILE, pathKey } from '../shared/searchText'
import { compileSearchScope, EMPTY_SEARCH_SCOPE, scopePath } from '../shared/searchScope'
import type { SearchFileResult, SearchMatch, SearchOptions, SearchScope, WorkspaceFilter } from '../shared/types'

export interface SearchableBuffer { filePath: string | null; title: string; content: string }

export function searchBuffers(
  buffers: SearchableBuffer[],
  query: string,
  opts: SearchOptions,
  root: string | null = null,
  searchScope: SearchScope = EMPTY_SEARCH_SCOPE,
  filter: WorkspaceFilter = { showAll: false, excludePatterns: [] },
): SearchFileResult[] {
  const scope = compileSearchScope(searchScope, filter.excludePatterns, filter.showAll)
  const out: SearchFileResult[] = []
  for (const b of buffers) {
    if (!scope.includes(scopePath(root, b.filePath))) continue
    const matches: SearchMatch[] = []
    let truncated = false
    visitSearchMatches(b.content, query, opts, MAX_MATCHES_PER_FILE + 1, match => {
      if (matches.length === MAX_MATCHES_PER_FILE) {
        truncated = true
        return false
      }
      matches.push(match)
    })
    if (!matches.length) continue
    out.push({
      path: b.filePath ?? '',
      ...(b.filePath ? {} : { title: b.title }),
      matches,
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
