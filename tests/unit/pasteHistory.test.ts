import { describe, it, expect } from 'vitest'
import { PasteHistoryList } from '../../src/renderer/pasteHistory'

describe('PasteHistoryList', () => {
  it('adds most-recent-first and dedupes', () => {
    const h = new PasteHistoryList()
    h.add('a'); h.add('b'); h.add('a')
    expect(h.entries()).toEqual(['a', 'b'])
  })
  it('caps entries', () => {
    const h = new PasteHistoryList(2)
    h.add('a'); h.add('b'); h.add('c')
    expect(h.entries()).toEqual(['c', 'b'])
  })
  it('ignores empty/whitespace', () => {
    const h = new PasteHistoryList()
    h.add(''); h.add('   ')
    expect(h.entries()).toEqual([])
  })
  it('truncates oversized entries', () => {
    const h = new PasteHistoryList(50, 5)
    h.add('abcdefgh')
    expect(h.entries()[0]).toBe('abcde …[truncated]')
  })
  it('load replaces entries', () => {
    const h = new PasteHistoryList()
    h.add('x'); h.load(['p', 'q'])
    expect(h.entries()).toEqual(['p', 'q'])
  })
})
