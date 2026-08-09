import { compilePathGlobs, normalizePathGlobs } from './pathGlob'
import type { SearchScope } from './types'

export const EMPTY_SEARCH_SCOPE: SearchScope = {
  includePatterns: [],
  excludePatterns: [],
}

export function parseScopeField(value: string): string[] {
  return normalizePathGlobs(value.split(','))
}

export function scopePath(root: string | null, filePath: string | null): string | null {
  if (!filePath) return null

  const file = filePath.replaceAll('\\', '/')
  const basename = file.slice(file.lastIndexOf('/') + 1)
  if (!root) return basename

  const normalizedRoot = root.replaceAll('\\', '/').replace(/\/+$/, '')
  const foldedFile = file.toLocaleLowerCase('en-US')
  const foldedRoot = normalizedRoot.toLocaleLowerCase('en-US')
  return foldedFile.startsWith(`${foldedRoot}/`)
    ? file.slice(normalizedRoot.length + 1)
    : basename
}

export function compileSearchScope(
  scope: SearchScope,
  workspaceExcludes: string[],
  showAll: boolean,
): { includes(path: string | null): boolean; traversalExcludes: string[] } {
  const includePatterns = normalizePathGlobs(scope.includePatterns)
  const excludePatterns = normalizePathGlobs(scope.excludePatterns)
  const effectiveWorkspaceExcludes = showAll ? [] : normalizePathGlobs(workspaceExcludes)
  const includeMatcher = compilePathGlobs(includePatterns)
  const explicitExcludeMatcher = compilePathGlobs(excludePatterns)
  const workspaceExcludeMatcher = compilePathGlobs(effectiveWorkspaceExcludes)

  return {
    traversalExcludes: normalizePathGlobs([
      ...effectiveWorkspaceExcludes,
      ...excludePatterns,
    ]),
    includes: path => {
      if (path === null) return includePatterns.length === 0
      if (includePatterns.length > 0 && !includeMatcher.matches(path)) return false
      return !explicitExcludeMatcher.matches(path) && !workspaceExcludeMatcher.matches(path)
    },
  }
}

function countLabel(count: number, kind: 'include' | 'workspace' | 'search'): string {
  return `${count} ${kind} pattern${count === 1 ? '' : 's'}`
}

export function describeSearchScope(
  scope: SearchScope,
  workspaceExcludeCount: number,
  showAll: boolean,
): string {
  const includePatterns = normalizePathGlobs(scope.includePatterns)
  const excludePatterns = normalizePathGlobs(scope.excludePatterns)
  const included = includePatterns.length === 0
    ? 'All files'
    : includePatterns.length === 1
      ? includePatterns[0]
      : countLabel(includePatterns.length, 'include')
  const excluded: string[] = []

  if (!showAll && workspaceExcludeCount > 0) {
    excluded.push(countLabel(workspaceExcludeCount, 'workspace'))
  }
  if (excludePatterns.length > 0) {
    excluded.push(countLabel(excludePatterns.length, 'search'))
  }

  return excluded.length > 0 ? `${included} · excluding ${excluded.join(' + ')}` : included
}
