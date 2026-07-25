import { describe, it, expect } from 'vitest'
import { escapeRegex, searchText, MIN_QUERY_LENGTH } from '../../src/shared/searchText'
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
