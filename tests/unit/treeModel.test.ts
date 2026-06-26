import { describe, it, expect } from 'vitest'
import { TreeModel } from '../../src/renderer/treeModel'
import type { DirEntry } from '../../src/shared/types'

const ents = (...names: string[]): DirEntry[] => names.map(n => ({ name: n, path: '/r/' + n, isDir: false }))

describe('TreeModel', () => {
  it('setRoot stores root and clears caches', () => {
    const m = new TreeModel()
    m.setRoot('/r'); m.setChildren('/r', ents('a')); m.setExpanded('/r', true)
    m.setRoot('/r2')
    expect(m.root).toBe('/r2')
    expect(m.hasChildren('/r')).toBe(false)
    expect(m.isExpanded('/r')).toBe(false)
  })
  it('caches and returns children', () => {
    const m = new TreeModel()
    m.setChildren('/r', ents('a', 'b'))
    expect(m.getChildren('/r')!.map(e => e.name)).toEqual(['a', 'b'])
    expect(m.hasChildren('/r')).toBe(true)
  })
  it('tracks expanded state', () => {
    const m = new TreeModel()
    m.setExpanded('/r/sub', true)
    expect(m.isExpanded('/r/sub')).toBe(true)
    expect(m.expandedPaths()).toEqual(['/r/sub'])
    m.setExpanded('/r/sub', false)
    expect(m.isExpanded('/r/sub')).toBe(false)
  })
  it('invalidate drops a cached dir so it reloads', () => {
    const m = new TreeModel()
    m.setChildren('/r', ents('a'))
    m.invalidate('/r')
    expect(m.hasChildren('/r')).toBe(false)
  })
})
