import { describe, expect, it } from 'vitest'
import { tabFolderLabels, tabFolderPrefix } from '../../src/renderer/tabLabels'
import type { BufferState } from '../../src/shared/types'

const file = (id: string, filePath: string | null, title = filePath?.split(/[\\/]/).pop() ?? 'Untitled-1'): BufferState => ({
  id, title, filePath, content: '', language: 'plaintext', eol: 'LF', encoding: 'utf8', dirty: false,
})

describe('tabFolderLabels', () => {
  it('ignores malformed saved paths admitted by a corrupted session', () => {
    const valid = [file('a', 'C:\\client\\note.txt'), file('b', 'C:\\server\\note.txt')]
    const malformed = [42, true, {}, []].map((path, index) =>
      ({ ...file(`bad-${index}`, null, 'note.txt'), filePath: path }) as unknown as BufferState)
    expect([...tabFolderLabels([...valid, ...malformed])]).toEqual([['a', 'client'], ['b', 'server']])
  })
  it('lets shared folder prefixes truncate before the distinguishing characters', () => {
    const labels = ['project-a\\src', 'project-b\\src', 'docs']
    expect(tabFolderPrefix(labels[0], labels)).toBe('project-')
    expect(tabFolderPrefix(labels[1], labels)).toBe('project-')
    expect(tabFolderPrefix(labels[2], labels)).toBe('')
    expect(tabFolderPrefix('Project-A\\src', ['project-b\\src'])).toBe('Project-')
    expect(tabFolderPrefix('src', ['src', 'src\\other'])).toBe('sr')
    expect(tabFolderPrefix('😀-folder', ['😁-folder'])).toBe('')
    expect(tabFolderPrefix('İfooA', ['İfooB'])).toBe('İfoo')
    expect(tabFolderPrefix('project', ['project-a'])).toBe('projec')
  })
  it('adds folders only to saved files with colliding names, without changing buffers', () => {
    const files = [file('a', 'C:\\work\\client\\README.md'), file('b', 'C:\\work\\server\\README.md'),
      file('c', 'C:\\work\\other.txt'), file('scratch', null, 'README.md')]
    const before = structuredClone(files)
    expect([...tabFolderLabels(files)]).toEqual([['a', 'client'], ['b', 'server']])
    expect(files).toEqual(before)
  })

  it('extends through repeated parents and compares filenames and folders without case sensitivity', () => {
    const labels = tabFolderLabels([
      file('a', 'C:/work/project-a/SRC/index.ts'), file('b', 'C:\\work\\project-b\\src\\INDEX.TS'),
      file('c', 'C:\\work\\docs\\index.ts'),
    ])
    expect([...labels]).toEqual([['a', 'project-a\\SRC'], ['b', 'project-b\\src'], ['c', 'docs']])
  })

  it('includes drive roots and UNC hosts when needed to distinguish locations', () => {
    expect([...tabFolderLabels([file('a', 'C:\\src\\index.ts'), file('b', 'D:\\src\\index.ts')])])
      .toEqual([['a', 'C:\\src'], ['b', 'D:\\src']])
    expect([...tabFolderLabels([file('a', 'C:\\note.txt'), file('b', 'D:\\note.txt')])])
      .toEqual([['a', 'C:\\'], ['b', 'D:\\']])
    expect([...tabFolderLabels([file('a', '\\\\nas-a\\share\\note.txt'), file('b', '\\\\nas-b\\share\\note.txt')])])
      .toEqual([['a', '\\\\nas-a\\share'], ['b', '\\\\nas-b\\share']])
  })

  it('handles relative paths and removes labels when a collision disappears', () => {
    const a = file('a', 'note.txt'), b = file('b', 'folder/note.txt')
    expect([...tabFolderLabels([a, b])]).toEqual([['a', '.'], ['b', 'folder']])
    expect(tabFolderLabels([a]).size).toBe(0)
    expect(tabFolderLabels([a, file('b', 'folder/renamed.txt')]).size).toBe(0)
  })
})
