export const DEFAULT_WORKSPACE_EXCLUDES = [
  '**/.git/**',
  '**/node_modules/**',
  '**/dist/**',
  '**/out/**',
  '**/build/**',
  '**/coverage/**',
] as const

function normalizePath(value: string): string {
  return value.trim()
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .replace(/\/{2,}/g, '/')
    .replace(/\/+$/, '')
}

export function normalizePathGlobs(patterns: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const value of patterns) {
    const pattern = normalizePath(value)
    if (!pattern) continue
    const key = pattern.toLocaleLowerCase('en-US')
    if (seen.has(key)) continue
    seen.add(key)
    out.push(pattern)
  }
  return out
}

function segmentMatcher(segment: string): RegExp {
  let source = '^'
  for (const char of segment) {
    if (char === '*') source += '[^/]*'
    else if (char === '?') source += '[^/]'
    else source += char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  }
  return new RegExp(source + '$', 'i')
}

interface CompiledPattern {
  segments: Array<'**' | RegExp>
  terminalGlobStar: boolean
}

function matchesSegments(pattern: CompiledPattern, path: string): boolean {
  const segments = normalizePath(path).split('/').filter(Boolean)
  const memo = new Map<string, boolean>()
  const visit = (patternIndex: number, pathIndex: number): boolean => {
    const key = `${patternIndex}:${pathIndex}`
    const known = memo.get(key)
    if (known !== undefined) return known
    const part = pattern.segments[patternIndex]
    let result: boolean
    if (part === undefined) result = pathIndex === segments.length
    else if (part === '**') {
      result = visit(patternIndex + 1, pathIndex) ||
        (pathIndex < segments.length && visit(patternIndex, pathIndex + 1))
    } else {
      result = pathIndex < segments.length && part.test(segments[pathIndex]) &&
        visit(patternIndex + 1, pathIndex + 1)
    }
    memo.set(key, result)
    return result
  }
  return visit(0, 0)
}

export function compilePathGlobs(patterns: string[]): {
  matches(relativePath: string): boolean
  prunes(relativeDir: string): boolean
} {
  const compiled: CompiledPattern[] = normalizePathGlobs(patterns).map(pattern => {
    const raw = pattern.split('/')
    return {
      segments: raw.map(segment => segment === '**' ? '**' : segmentMatcher(segment)),
      terminalGlobStar: raw.at(-1) === '**',
    }
  })
  return {
    matches: relativePath => compiled.some(pattern => matchesSegments(pattern, relativePath)),
    prunes: relativeDir => compiled.some(pattern =>
      pattern.terminalGlobStar && matchesSegments(pattern, relativeDir)),
  }
}
