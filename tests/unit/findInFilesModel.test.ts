import { describe, it, expect } from 'vitest'
import { searchBuffers, mergeResults } from '../../src/renderer/findInFilesModel'
import type { SearchFileResult, SearchOptions } from '../../src/shared/types'

const PLAIN: SearchOptions = { caseSensitive: false, wholeWord: false }

describe('searchBuffers', () => {
  it('searches a named buffer and reports its path', () => {
    const r = searchBuffers([{ filePath: 'C:\\p\\a.ts', title: 'a.ts', content: 'a needle' }], 'needle', PLAIN)
    expect(r).toHaveLength(1)
    expect(r[0]).toMatchObject({ path: 'C:\\p\\a.ts', truncated: false })
    expect(r[0].matches).toHaveLength(1)
  })

  it('reports an untitled buffer by title with an empty path', () => {
    const r = searchBuffers([{ filePath: null, title: 'Untitled-1', content: 'needle' }], 'needle', PLAIN)
    expect(r[0]).toMatchObject({ path: '', title: 'Untitled-1' })
  })

  it('omits buffers with no match', () => {
    expect(searchBuffers([{ filePath: null, title: 'x', content: 'nothing' }], 'needle', PLAIN)).toHaveLength(0)
  })

  it('caps a buffer at 20 matches and flags it', () => {
    const content = Array(50).fill('needle').join('\n')
    const r = searchBuffers([{ filePath: null, title: 'x', content }], 'needle', PLAIN)
    expect(r[0].matches).toHaveLength(20)
    expect(r[0].truncated).toBe(true)
  })
})

describe('mergeResults', () => {
  const f = (path: string): SearchFileResult => ({ path, matches: [{ line: 1, column: 1, length: 1, preview: 'x' }], truncated: false })

  it('puts open-buffer results first, then disk results in walk order', () => {
    const merged = mergeResults([f('C:\\p\\open.ts')], [f('C:\\p\\d1.ts'), f('C:\\p\\d2.ts')])
    expect(merged.map(r => r.path)).toEqual(['C:\\p\\open.ts', 'C:\\p\\d1.ts', 'C:\\p\\d2.ts'])
  })

  it('never emits the same path twice', () => {
    const merged = mergeResults([f('C:\\p\\a.ts')], [f('C:\\p\\a.ts')])
    expect(merged).toHaveLength(1)
  })
})
