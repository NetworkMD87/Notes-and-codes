import { describe, it, expect, beforeEach } from 'vitest'
import { SnippetList } from '../../src/renderer/snippets'

let n: number
const ids = () => `id-${++n}`

describe('SnippetList', () => {
  let s: SnippetList
  beforeEach(() => { n = 0; s = new SnippetList(ids) })

  it('adds and lists', () => {
    const a = s.add('Sig', 'bye')
    expect(a).toEqual({ id: 'id-1', name: 'Sig', body: 'bye' })
    expect(s.list()).toHaveLength(1)
  })
  it('renames and updates body', () => {
    const a = s.add('x', 'y')
    s.rename(a.id, 'New'); s.updateBody(a.id, 'Z')
    expect(s.get(a.id)).toEqual({ id: a.id, name: 'New', body: 'Z' })
  })
  it('removes', () => {
    const a = s.add('x', 'y'); s.remove(a.id)
    expect(s.list()).toEqual([])
  })
  it('load replaces and resets numbering base', () => {
    s.add('x', 'y')
    s.load([{ id: 'p', name: 'P', body: 'b' }])
    expect(s.list()).toEqual([{ id: 'p', name: 'P', body: 'b' }])
  })
})
