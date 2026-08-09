import { describe, expect, it } from 'vitest'
import {
  EMPTY_SEARCH_SCOPE,
  compileSearchScope,
  describeSearchScope,
  parseScopeField,
  scopePath,
} from '../../src/shared/searchScope'

describe('search scope', () => {
  it('normalizes comma-separated patterns and removes blanks and duplicates', () => {
    expect(parseScopeField(' src/**/*.ts, , SRC\\**\\*.TS, **/*.md '))
      .toEqual(['src/**/*.ts', '**/*.md'])
  })

  it('uses a relative path in-root, basename outside-root, and null for untitled', () => {
    expect(scopePath('C:/work', 'c:\\work\\src\\a.ts')).toBe('src/a.ts')
    expect(scopePath('C:/work/', 'C:/workspace/a.ts')).toBe('a.ts')
    expect(scopePath('C:/work', 'D:/loose/note.md')).toBe('note.md')
    expect(scopePath(null, 'D:/loose/note.md')).toBe('note.md')
    expect(scopePath('C:/work', null)).toBeNull()
  })

  it('includes untitled buffers only when normalized include patterns are empty', () => {
    expect(compileSearchScope(EMPTY_SEARCH_SCOPE, [], false).includes(null)).toBe(true)
    expect(compileSearchScope({ includePatterns: [' ', '\\'], excludePatterns: [] }, [], false).includes(null)).toBe(true)
    expect(compileSearchScope({ includePatterns: ['**/*.md'], excludePatterns: [] }, [], false).includes(null)).toBe(false)
  })

  it('applies includes before excludes', () => {
    const compiled = compileSearchScope({
      includePatterns: ['src/**/*.ts'],
      excludePatterns: ['**/*.test.ts'],
    }, [], false)

    expect(compiled.includes('src/a.ts')).toBe(true)
    expect(compiled.includes('src/a.test.ts')).toBe(false)
    expect(compiled.includes('docs/a.ts')).toBe(false)
  })

  it('adds explicit excludes and lets show-all bypass workspace excludes only', () => {
    const scope = { includePatterns: [], excludePatterns: ['**/*.test.ts'] }
    expect(compileSearchScope(scope, ['**/dist/**'], false).includes('dist/a.ts')).toBe(false)
    expect(compileSearchScope(scope, ['**/dist/**'], true).includes('dist/a.ts')).toBe(true)
    expect(compileSearchScope(scope, ['**/dist/**'], true).includes('src/a.test.ts')).toBe(false)
    expect(compileSearchScope(scope, ['**/dist/**'], false).traversalExcludes)
      .toEqual(['**/dist/**', '**/*.test.ts'])
    expect(compileSearchScope(scope, ['**/dist/**'], true).traversalExcludes)
      .toEqual(['**/*.test.ts'])
  })

  it('describes the effective scope without hiding workspace exclusions', () => {
    expect(describeSearchScope(EMPTY_SEARCH_SCOPE, 6, false))
      .toBe('All files · excluding 6 workspace patterns')
    expect(describeSearchScope({
      includePatterns: ['src/**/*.ts'],
      excludePatterns: ['**/*.test.ts'],
    }, 6, false)).toBe('src/**/*.ts · excluding 6 workspace patterns + 1 search pattern')
    expect(describeSearchScope({
      includePatterns: ['src/**', 'docs/**'],
      excludePatterns: ['tmp/**', '**/*.log'],
    }, 1, false)).toBe('2 include patterns · excluding 1 workspace pattern + 2 search patterns')
    expect(describeSearchScope({
      includePatterns: [],
      excludePatterns: ['tmp/**'],
    }, 6, true)).toBe('All files · excluding 1 search pattern')
    expect(describeSearchScope(EMPTY_SEARCH_SCOPE, 6, true)).toBe('All files')
  })
})
