import { describe, it, expect, beforeEach } from 'vitest'
import { BufferManager } from '../../src/renderer/bufferManager'

let n: number
const ids = () => `id-${++n}`

describe('BufferManager', () => {
  let m: BufferManager
  beforeEach(() => { n = 0; m = new BufferManager(ids) })

  it('creates an untitled active buffer', () => {
    const b = m.create()
    expect(b.id).toBe('id-1')
    expect(b.title).toBe('Untitled-1')
    expect(b.dirty).toBe(false)
    expect(m.activeId).toBe('id-1')
  })

  it('marks dirty on update and clean on save', () => {
    const b = m.create()
    m.update(b.id, 'hello')
    expect(m.get(b.id)!.dirty).toBe(true)
    expect(m.get(b.id)!.content).toBe('hello')
    m.markSaved(b.id, 'C:/x/note.txt')
    expect(m.get(b.id)!.dirty).toBe(false)
    expect(m.get(b.id)!.title).toBe('note.txt')
  })

  it('open activates an existing buffer with the same path instead of duplicating', () => {
    const first = m.open({ filePath: 'C:/a.ts', content: 'a', eol: 'LF' })
    const again = m.open({ filePath: 'C:/a.ts', content: 'a', eol: 'LF' })
    expect(m.list()).toHaveLength(1)
    expect(again.id).toBe(first.id)
  })

  it('closing the active buffer activates a neighbor', () => {
    const a = m.create(); const b = m.create(); m.setActive(a.id)
    m.close(a.id)
    expect(m.activeId).toBe(b.id)
    expect(m.list()).toHaveLength(1)
  })

  it('round-trips through session', () => {
    m.create(); m.update('id-1', 'x')
    const data = m.toSession()
    const m2 = new BufferManager(ids)
    m2.restore(data)
    expect(m2.list()).toHaveLength(1)
    expect(m2.get('id-1')!.content).toBe('x')
    expect(m2.activeId).toBe('id-1')
  })

  it('resets untitled counter when all buffers are closed so next buffer is Untitled-1', () => {
    const a = m.create()  // Untitled-1, id-1
    const b = m.create()  // Untitled-2, id-2
    m.close(a.id)
    m.close(b.id)
    const c = m.create()  // should be Untitled-1, not Untitled-3
    expect(c.title).toBe('Untitled-1')
  })

  it('move reorders a buffer forward (drag first tab to the end)', () => {
    const a = m.create(); const b = m.create(); const c = m.create() // [a,b,c]
    m.move(a.id, 2)
    expect(m.list().map(x => x.id)).toEqual([b.id, c.id, a.id])
  })

  it('move reorders a buffer backward (drag last tab to the front)', () => {
    const a = m.create(); const b = m.create(); const c = m.create() // [a,b,c]
    m.move(c.id, 0)
    expect(m.list().map(x => x.id)).toEqual([c.id, a.id, b.id])
  })

  it('move clamps an out-of-range target index instead of dropping the buffer', () => {
    const a = m.create(); const b = m.create() // [a,b]
    m.move(a.id, 99)
    expect(m.list().map(x => x.id)).toEqual([b.id, a.id])
    expect(m.list()).toHaveLength(2)
  })

  it('move is a no-op for an unknown id', () => {
    const a = m.create(); const b = m.create() // [a,b]
    m.move('nope', 0)
    expect(m.list().map(x => x.id)).toEqual([a.id, b.id])
  })

  it('move does not change the active buffer', () => {
    const a = m.create(); const b = m.create(); const c = m.create()
    m.setActive(b.id)
    m.move(a.id, 2)
    expect(m.activeId).toBe(b.id)
  })
})
