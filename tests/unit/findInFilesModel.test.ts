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

  it('stops the open-buffer visitor on the 21st match and retains only 20', () => {
    const content = Array(21).fill('needle').join('\n') + '\nnot visited'
    const result = searchBuffers([{ filePath: null, title: 'x', content }], 'needle', PLAIN)[0]
    expect(result.matches).toHaveLength(20)
    expect(result.matches.at(-1)?.line).toBe(20)
    expect(result.truncated).toBe(true)
  })

  it('uses relative, basename, and untitled scope paths consistently', () => {
    const buffers = [
      { filePath: 'C:/work/src/a.ts', title: 'a.ts', content: 'needle' },
      { filePath: 'D:/loose/note.md', title: 'note.md', content: 'needle' },
      { filePath: null, title: 'Untitled-1', content: 'needle' },
    ]
    const result = searchBuffers(
      buffers,
      'needle',
      PLAIN,
      'C:/work',
      { includePatterns: ['**/*.md'], excludePatterns: [] },
      { showAll: false, excludePatterns: [] },
    )

    expect(result.map(item => item.title ?? item.path)).toEqual(['D:/loose/note.md'])
  })

  it('keeps untitled buffers eligible when includes are empty', () => {
    const result = searchBuffers(
      [{ filePath: null, title: 'Untitled-1', content: 'needle' }],
      'needle',
      PLAIN,
      'C:/work',
      { includePatterns: [], excludePatterns: ['**/*.test.ts'] },
      { showAll: false, excludePatterns: [] },
    )

    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({ path: '', title: 'Untitled-1' })
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

  // Windows paths are case-insensitive: C:\proj\a.txt and c:\proj\A.txt name the same file.
  // Without case-folding the de-dupe, this pair would sail past `seen.has(...)` and the file
  // would appear twice — once from the live buffer, once from its stale on-disk copy.
  it('treats paths differing only by case as the same file', () => {
    const merged = mergeResults([f('C:\\proj\\a.txt')], [f('c:\\proj\\A.txt')])
    expect(merged).toHaveLength(1)
  })

  // Every untitled buffer has path:''. mergeResults keeps bufferResults unconditionally (only
  // `disk` is ever filtered against the seen-set), so two untitled results can't collide today —
  // but that safety is a property of the asymmetric merge shape, not of any one line, and a
  // plausible future "simplify this" refactor (fold both lists into one seen-set-deduped pass)
  // would silently collapse them. Pin it so that regression breaks loudly.
  // Falsified 2026-07-25: rewriting mergeResults as a single seen-set pass over
  // `[...bufferResults, ...disk]` (the natural "simplify" refactor) collapsed this to 1; the
  // real fix (`.filter(Boolean)` before the case-fold, i.e. never seeding `seen` with '') was
  // checked separately and does not by itself move this specific test, since disk is empty here
  // and only bufferResults' own (unconditional) inclusion is what this test actually exercises.
  it('keeps two untitled-buffer results distinct (empty path must not collide)', () => {
    const untitled = (title: string): SearchFileResult =>
      ({ path: '', title, matches: [{ line: 1, column: 1, length: 1, preview: 'x' }], truncated: false })
    const merged = mergeResults([untitled('Untitled-1'), untitled('Untitled-2')], [])
    expect(merged).toHaveLength(2)
  })
})
