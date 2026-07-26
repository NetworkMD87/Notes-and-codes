import { describe, it, expect } from 'vitest'
import { splitPath, menuEntries } from '../../src/renderer/recentFolders'

describe('splitPath', () => {
  it('splits a Windows path into basename + parent', () => {
    expect(splitPath('C:\\Projects\\App')).toEqual({ name: 'App', parent: 'C:\\Projects' })
  })
  it('ignores a trailing separator', () => {
    expect(splitPath('C:\\Projects\\App\\')).toEqual({ name: 'App', parent: 'C:\\Projects' })
  })
  it('handles a bare drive root (no parent to show)', () => {
    expect(splitPath('C:\\')).toEqual({ name: 'C:', parent: '' })
  })
  it('keeps the separator style of the input', () => {
    expect(splitPath('/home/me/code')).toEqual({ name: 'code', parent: 'home/me' })
  })
})

describe('menuEntries', () => {
  it('excludes the open folder, case-folded', () => {
    expect(menuEntries(['C:\\a', 'C:\\B', 'C:\\c'], 'c:\\b')).toEqual(['C:\\a', 'C:\\c'])
  })
  it('returns everything when no folder is open', () => {
    expect(menuEntries(['C:\\a', 'C:\\b'], null)).toEqual(['C:\\a', 'C:\\b'])
  })
})
