import { describe, expect, it } from 'vitest'
import {
  DEFAULT_WORKSPACE_EXCLUDES,
  compilePathGlobs,
  normalizePathGlobs,
} from '../../src/shared/pathGlob'

describe('normalizePathGlobs', () => {
  it('removes blanks/leading slashes, normalizes separators, and folds duplicates', () => {
    expect(normalizePathGlobs([
      '', ' /src\\**\\*.ts ', 'SRC/**/*.TS', '/dist/**', 'dist/**',
    ])).toEqual(['src/**/*.ts', 'dist/**'])
  })

  it('exposes the exact product defaults', () => {
    expect(DEFAULT_WORKSPACE_EXCLUDES).toEqual([
      '**/.git/**', '**/node_modules/**', '**/dist/**',
      '**/out/**', '**/build/**', '**/coverage/**',
    ])
  })
})

describe('compilePathGlobs', () => {
  it('keeps star and question mark inside one path segment', () => {
    const glob = compilePathGlobs(['src/*.ts', 'notes/file?.md'])
    expect(glob.matches('src/a.ts')).toBe(true)
    expect(glob.matches('src/.ts')).toBe(true)
    expect(glob.matches('src/deep/a.ts')).toBe(false)
    expect(glob.matches('notes/file1.md')).toBe(true)
    expect(glob.matches('notes/file10.md')).toBe(false)
  })

  it('gives globstar zero-segment and deep-segment semantics', () => {
    const glob = compilePathGlobs(['src/**/*.ts'])
    expect(glob.matches('src/a.ts')).toBe(true)
    expect(glob.matches('src/lib/a.ts')).toBe(true)
    expect(glob.matches('src/lib/deep/a.ts')).toBe(true)
    expect(glob.matches('other/a.ts')).toBe(false)
  })

  it('matches terminal globstar at the directory node and prunes its subtree', () => {
    const glob = compilePathGlobs(['**/node_modules/**'])
    expect(glob.matches('node_modules')).toBe(true)
    expect(glob.prunes('node_modules')).toBe(true)
    expect(glob.prunes('packages/app/node_modules')).toBe(true)
    expect(glob.matches('packages/app/node_modules/pkg/index.js')).toBe(true)
    expect(glob.prunes('packages/app/src')).toBe(false)
  })

  it('treats braces, classes, negation, and backslash escape syntax literally', () => {
    const glob = compilePathGlobs(['{src,test}/**', '[ab].ts', '!secret/**', 'literal\\*.ts'])
    expect(glob.matches('src/a.ts')).toBe(false)
    expect(glob.matches('a.ts')).toBe(false)
    expect(glob.matches('{src,test}/a.ts')).toBe(true)
    expect(glob.matches('[ab].ts')).toBe(true)
    expect(glob.matches('secret/a.ts')).toBe(false)
    expect(glob.matches('!secret/a.ts')).toBe(true)
    expect(glob.matches('literal/name.ts')).toBe(true) // backslash normalized as a separator
  })

  it('matches Windows paths and casing consistently', () => {
    const glob = compilePathGlobs(['SRC/**/GENERATED?.TS'])
    expect(glob.matches('src\\generated1.ts')).toBe(true)
    expect(glob.matches('Src\\deep\\GeneratedA.ts')).toBe(true)
  })
})
