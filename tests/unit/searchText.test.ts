import { describe, it, expect, vi } from 'vitest'
import { escapeRegex, searchText, visitSearchMatches, MIN_QUERY_LENGTH } from '../../src/shared/searchText'
import type { SearchOptions } from '../../src/shared/types'

const PLAIN: SearchOptions = { caseSensitive: false, wholeWord: false }
const CASE: SearchOptions = { caseSensitive: true, wholeWord: false }
const WORD: SearchOptions = { caseSensitive: false, wholeWord: true }

describe('escapeRegex', () => {
  it('escapes every regex metacharacter', () => {
    expect(escapeRegex('a.b')).toBe('a\\.b')
    expect(escapeRegex('a+b*c?')).toBe('a\\+b\\*c\\?')
    expect(escapeRegex('(x)[y]{z}')).toBe('\\(x\\)\\[y\\]\\{z\\}')
  })
})

describe('searchText', () => {
  it('visits the same LF, CRLF, CR, UTF-16-column and preview results as the collector', () => {
    const content = `alpha needle\r\nbeta 😀 needle\rneedle gamma\n${'z'.repeat(240)}needle${'z'.repeat(240)}`
    const collected = searchText(content, 'needle', PLAIN, 20)
    const visited: typeof collected = []
    const count = visitSearchMatches(content, 'needle', PLAIN, 20, match => {
      visited.push(match)
    })
    expect(count).toBe(collected.length)
    expect(visited).toEqual(collected)
    expect(visited.map(match => [match.line, match.column])).toEqual([
      [1, 7], [2, 9], [3, 1], [4, 241],
    ])
    expect(visited[3].preview).toContain('needle')
  })

  it('does not split the complete document into a line array', () => {
    const split = vi.spyOn(String.prototype, 'split')
    try {
      visitSearchMatches('first needle\nsecond needle', 'needle', PLAIN, 20, () => undefined)
      expect(split).not.toHaveBeenCalled()
    } finally {
      split.mockRestore()
    }
  })

  it('stops immediately when the visitor returns false', () => {
    const visited: number[] = []
    const count = visitSearchMatches('needle needle\nneedle', 'needle', PLAIN, 20, match => {
      visited.push(match.line)
      return false
    })
    expect(count).toBe(1)
    expect(visited).toEqual([1])
  })

  it('keeps whole-word and literal metacharacter semantics in the incremental path', () => {
    const literal: number[] = []
    visitSearchMatches('a.b axb a.b', 'a.b', PLAIN, 10, match => { literal.push(match.column) })
    expect(literal).toEqual([1, 9])
    const words: number[] = []
    visitSearchMatches('cat category cat', 'cat', WORD, 10, match => { words.push(match.column) })
    expect(words).toEqual([1, 14])
  })

  it('matches case-insensitively by default', () => {
    const m = searchText('Hello world', 'HELLO', PLAIN, 10)
    expect(m).toHaveLength(1)
    expect(m[0]).toMatchObject({ line: 1, column: 1, length: 5 })
  })

  it('respects caseSensitive', () => {
    expect(searchText('Hello world', 'hello', CASE, 10)).toHaveLength(0)
    expect(searchText('Hello world', 'Hello', CASE, 10)).toHaveLength(1)
  })

  it('wholeWord does not match inside a longer word', () => {
    expect(searchText('category', 'cat', WORD, 10)).toHaveLength(0)
    expect(searchText('a cat sat', 'cat', WORD, 10)).toHaveLength(1)
    expect(searchText('category', 'cat', PLAIN, 10)).toHaveLength(1)
  })

  it('treats regex metacharacters as literals', () => {
    expect(searchText('axb', 'a.b', PLAIN, 10)).toHaveLength(0)
    expect(searchText('a.b', 'a.b', PLAIN, 10)).toHaveLength(1)
  })

  it('reports 1-based line numbers across LF and CRLF', () => {
    expect(searchText('one\ntwo\nthree', 'three', PLAIN, 10)[0].line).toBe(3)
    expect(searchText('one\r\ntwo\r\nthree', 'three', PLAIN, 10)[0].line).toBe(3)
  })

  it('finds two matches on one line with distinct columns', () => {
    const m = searchText('foo and foo', 'foo', PLAIN, 10)
    expect(m.map(x => x.column)).toEqual([1, 9])
  })

  it('stops at maxMatches', () => {
    expect(searchText('xx xx xx xx', 'xx', PLAIN, 2)).toHaveLength(2)
  })

  it('returns nothing below the minimum query length', () => {
    expect(MIN_QUERY_LENGTH).toBe(2)
    expect(searchText('aaa', 'a', PLAIN, 10)).toHaveLength(0)
  })

  it('trims the preview of a very long line but keeps the true column', () => {
    const line = 'z'.repeat(500) + 'needle' + 'z'.repeat(500)
    const m = searchText(line, 'needle', PLAIN, 10)[0]
    expect(m.column).toBe(501)
    expect(m.preview.length).toBeLessThan(300)
    expect(m.preview).toContain('needle')
    expect(m.preview.startsWith('…')).toBe(true)
    expect(m.preview.endsWith('…')).toBe(true)
  })
})
