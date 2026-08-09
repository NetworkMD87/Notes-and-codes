// Pure quick-open matching. No DOM, no node — unit-tested.

function fuzzyMatchNormalized(query: string, text: string): number | null {
  if (!query) return 0
  let queryIndex = 0
  let score = 0
  let previous = -1
  for (let textIndex = 0; textIndex < text.length && queryIndex < query.length; textIndex++) {
    if (text[textIndex] === query[queryIndex]) {
      score += textIndex === previous + 1 ? 2 : 1 // consecutive-match bonus
      if (textIndex < 10) score += 1 // early-match bonus
      previous = textIndex
      queryIndex++
    }
  }
  return queryIndex === query.length ? score : null
}

export function fuzzyMatch(query: string, text: string): number | null {
  return fuzzyMatchNormalized(
    query.toLocaleLowerCase('en-US'),
    text.toLocaleLowerCase('en-US'),
  )
}

export interface QuickOpenCandidate {
  readonly path: string
  readonly name: string
  readonly lowerName: string
  readonly lowerRelativePath: string
}

export interface RankedFile extends QuickOpenCandidate { score: number }

function normalizedPath(path: string): string {
  return path.replace(/\\/g, '/')
}

export function buildQuickOpenCandidates(
  root: string,
  files: readonly string[],
): QuickOpenCandidate[] {
  const normalizedRoot = normalizedPath(root).replace(/\/+$/, '')
  const rootKey = normalizedRoot.toLocaleLowerCase('en-US') + '/'
  return files.map(path => {
    const absolute = normalizedPath(path)
    const absoluteKey = absolute.toLocaleLowerCase('en-US')
    const relativePath = absoluteKey.startsWith(rootKey)
      ? absolute.slice(normalizedRoot.length + 1)
      : absolute.split('/').at(-1) ?? absolute
    const name = relativePath.split('/').at(-1) ?? relativePath
    return {
      path,
      name,
      lowerName: name.toLocaleLowerCase('en-US'),
      lowerRelativePath: relativePath.toLocaleLowerCase('en-US'),
    }
  })
}

interface ScoredCandidate extends RankedFile {
  filenameMatch: boolean
  relativeScore: number
}

function compareCodeUnits(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

function compareRank(a: ScoredCandidate, b: ScoredCandidate): number {
  return Number(b.filenameMatch) - Number(a.filenameMatch) ||
    b.score - a.score || b.relativeScore - a.relativeScore ||
    a.name.length - b.name.length || a.lowerName.localeCompare(b.lowerName) ||
    a.lowerRelativePath.localeCompare(b.lowerRelativePath) || a.path.localeCompare(b.path) ||
    compareCodeUnits(a.path, b.path)
}

function scoreCandidate(
  normalizedQuery: string,
  candidate: QuickOpenCandidate,
): ScoredCandidate | null {
  const nameScore = fuzzyMatchNormalized(normalizedQuery, candidate.lowerName)
  const pathScore = fuzzyMatchNormalized(normalizedQuery, candidate.lowerRelativePath)
  if (nameScore === null && pathScore === null) return null
  return {
    ...candidate,
    filenameMatch: nameScore !== null,
    score: nameScore ?? pathScore!,
    relativeScore: pathScore ?? -1,
  }
}

function publicRanked(candidate: ScoredCandidate): RankedFile {
  const { filenameMatch: _filenameMatch, relativeScore: _relativeScore, ...item } = candidate
  return item
}

export function rankFileCandidates(
  query: string,
  candidates: readonly QuickOpenCandidate[],
  limit = 50,
): RankedFile[] {
  if (limit <= 0) return []
  const normalizedQuery = query.toLocaleLowerCase('en-US')
  const best: ScoredCandidate[] = []
  for (const candidate of candidates) {
    const ranked = scoreCandidate(normalizedQuery, candidate)
    if (!ranked) continue
    let index = 0
    while (index < best.length && compareRank(best[index], ranked) <= 0) index++
    if (index < limit) best.splice(index, 0, ranked)
    if (best.length > limit) best.pop()
  }
  return best.map(publicRanked)
}

/** Full-sort oracle used only by correctness tests and the local benchmark. */
export function rankFileCandidatesReference(
  query: string,
  candidates: readonly QuickOpenCandidate[],
  limit = 50,
): RankedFile[] {
  if (limit <= 0) return []
  const normalizedQuery = query.toLocaleLowerCase('en-US')
  const scored: ScoredCandidate[] = []
  for (const candidate of candidates) {
    const ranked = scoreCandidate(normalizedQuery, candidate)
    if (ranked) scored.push(ranked)
  }
  scored.sort(compareRank)
  return scored.slice(0, limit).map(publicRanked)
}
