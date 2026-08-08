import { describe, it, expect } from 'vitest'
import {
  buildQuickOpenCandidates,
  fuzzyMatch,
  rankFileCandidates,
  rankFileCandidatesReference,
} from '../../src/renderer/fuzzy'

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

describe('Quick Open candidates', () => {
  const files = ['C:\\p\\src\\main.ts', 'C:\\p\\src\\manager.ts', 'C:\\p\\readme.md']
  const candidates = buildQuickOpenCandidates('C:\\p', files)

  it('caches display and normalized name/path once per index generation', () => {
    expect(candidates[0]).toEqual({
      path: 'C:\\p\\src\\main.ts',
      name: 'main.ts',
      lowerName: 'main.ts',
      lowerRelativePath: 'src/main.ts',
    })
  })

  it('prefers filename matches but can find a relative-path match', () => {
    expect(rankFileCandidates('main', candidates)[0].name).toBe('main.ts')
    expect(rankFileCandidates('src', candidates).map(item => item.name))
      .toEqual(['main.ts', 'manager.ts'])
  })

  it('is deterministic when enumeration order changes', () => {
    const forward = rankFileCandidates('m', candidates).map(item => item.path)
    const reverse = rankFileCandidates('m', [...candidates].reverse()).map(item => item.path)
    expect(reverse).toEqual(forward)
  })

  it('does not mutate caller-owned candidate records or enumeration order', () => {
    const callerCandidates = candidates.map(candidate => ({ ...candidate }))
    const before = structuredClone(callerCandidates)
    rankFileCandidates('src', callerCandidates, 2)
    expect(callerCandidates).toEqual(before)
  })

  it('bounded top 50 equals the first 50 of a full reference ordering', () => {
    const many = buildQuickOpenCandidates('C:\\p', Array.from({ length: 20_000 }, (_, index) =>
      `C:\\p\\pkg-${String(index % 200).padStart(3, '0')}\\file-${String(index).padStart(5, '0')}.ts`))
    const bounded = rankFileCandidates('f19', many, 50).map(item => item.path)
    const reference = rankFileCandidatesReference('f19', many, 50).map(item => item.path)
    expect(bounded).toEqual(reference)
  })
})
