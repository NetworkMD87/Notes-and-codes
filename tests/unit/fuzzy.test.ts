import { describe, it, expect } from 'vitest'
import { fuzzyMatch, rankFiles } from '../../src/renderer/fuzzy'

describe('fuzzyMatch', () => {
  it('matches a subsequence, case-insensitive', () => {
    expect(fuzzyMatch('min', 'main.ts')).not.toBeNull()
    expect(fuzzyMatch('MAIN', 'main.ts')).not.toBeNull()
  })
  it('returns null when not a subsequence', () => {
    expect(fuzzyMatch('xyz', 'main.ts')).toBeNull()
  })
  it('empty query scores 0 (matches anything)', () => {
    expect(fuzzyMatch('', 'whatever')).toBe(0)
  })
  it('scores consecutive matches higher than scattered', () => {
    expect(fuzzyMatch('main', 'main.ts')!).toBeGreaterThan(fuzzyMatch('main', 'm_a_i_n.ts')!)
  })
})

describe('rankFiles', () => {
  const files = ['/p/src/main.ts', '/p/src/manager.ts', '/p/readme.md']
  it('keeps only matches, ranked best-first', () => {
    const r = rankFiles('main', files)
    expect(r[0].name).toBe('main.ts')
    expect(r.find(x => x.name === 'readme.md')).toBeUndefined()
  })
  it('matches against the filename, not the directory', () => {
    expect(rankFiles('src', files)).toHaveLength(0)
  })
  it('respects the limit', () => {
    expect(rankFiles('', files, 2)).toHaveLength(2)
  })
})
