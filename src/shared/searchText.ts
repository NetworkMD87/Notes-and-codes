// Pure content matcher. Shared because BOTH processes search: main over files on disk,
// the renderer over open buffers. One implementation is what makes disk results and
// buffer results incapable of disagreeing.
import type { SearchMatch, SearchOptions } from './types'

export const MIN_QUERY_LENGTH = 2
// Cross-process invariant: main (searchService.ts) and the renderer (findInFilesModel.ts) must
// cap at the same number or their results silently disagree — the exact class of bug the shared
// matcher exists to prevent. One declaration, imported by both.
export const MAX_MATCHES_PER_FILE = 20
const PREVIEW_RADIUS = 100

/**
 * Case-fold a path for identity comparisons (skip sets, de-dupe merges). Windows filesystem
 * paths are case-insensitive (`C:\proj\a.txt` and `c:\proj\A.txt` name the same file), and this
 * is a Windows-only app, so folding is unconditional — no platform branch needed. Shared here
 * (rather than duplicated in main and renderer) so both processes agree on file identity the
 * same way they agree on match content.
 */
export function pathKey(path: string): string {
  return path.toLowerCase()
}

export function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Build the matcher, or null when the query is too short to be worth a walk.
 *
 * The query is ESCAPED first, so the pattern is always a literal — no alternation, no nested
 * quantifiers, therefore no catastrophic backtracking. The rule is "no user-supplied PATTERN",
 * not "no RegExp"; a regex built from an escaped literal is safe to run over 20k files.
 */
export function buildMatcher(query: string, opts: SearchOptions): RegExp | null {
  if (query.length < MIN_QUERY_LENGTH) return null
  const body = escapeRegex(query)
  const pattern = opts.wholeWord ? `(?<![A-Za-z0-9_])${body}(?![A-Za-z0-9_])` : body
  return new RegExp(pattern, opts.caseSensitive ? 'g' : 'gi')
}

function preview(line: string, index: number, length: number): string {
  if (line.length <= PREVIEW_RADIUS * 2) return line
  const start = Math.max(0, index - PREVIEW_RADIUS)
  const end = Math.min(line.length, index + length + PREVIEW_RADIUS)
  return (start > 0 ? '…' : '') + line.slice(start, end) + (end < line.length ? '…' : '')
}

export type SearchMatchVisitor = (match: SearchMatch) => boolean | void

export function visitSearchMatches(
  content: string,
  query: string,
  opts: SearchOptions,
  maxMatches: number,
  visit: SearchMatchVisitor,
): number {
  const re = buildMatcher(query, opts)
  if (!re || maxMatches <= 0) return 0
  let count = 0
  let lineNumber = 1
  let start = 0

  while (start <= content.length && count < maxMatches) {
    let end = start
    while (end < content.length && content.charCodeAt(end) !== 10 && content.charCodeAt(end) !== 13) end++
    const line = content.slice(start, end)
    re.lastIndex = 0
    let match: RegExpExecArray | null
    while ((match = re.exec(line)) !== null && count < maxMatches) {
      count++
      const keepGoing = visit({
        line: lineNumber,
        column: match.index + 1,
        length: match[0].length,
        preview: preview(line, match.index, match[0].length),
      })
      if (keepGoing === false) return count
    }
    if (end >= content.length) break
    start = end + (content.charCodeAt(end) === 13 && content.charCodeAt(end + 1) === 10 ? 2 : 1)
    lineNumber++
  }
  return count
}

export function searchText(content: string, query: string, opts: SearchOptions, maxMatches: number): SearchMatch[] {
  const matches: SearchMatch[] = []
  visitSearchMatches(content, query, opts, maxMatches, match => { matches.push(match) })
  return matches
}
