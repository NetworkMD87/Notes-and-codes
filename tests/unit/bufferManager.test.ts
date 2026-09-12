import { describe, it, expect, beforeEach } from 'vitest'
import { BufferManager } from '../../src/renderer/bufferManager'
import { eligibleForAutosave } from '../../src/renderer/autoSaveController'

let n: number
const ids = () => `id-${++n}`
const externalFile = {
  filePath: 'C:/notes/opened.txt',
  content: 'opened from Explorer',
  eol: 'CRLF' as const,
  encoding: 'utf16le' as const,
  mtimeMs: 1234,
}

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

  it('retargets an exact open file and preserves its save state', () => {
    const buffer = m.open({
      filePath: 'C:\\notes\\draft.txt', content: 'unsaved text', eol: 'CRLF', encoding: 'utf16le', mtimeMs: 456,
    })
    m.update(buffer.id, 'changed after opening')

    expect(m.renamePath('C:/notes/draft.txt', 'C:/notes/final.md', false)).toEqual([buffer.id])
    expect(m.get(buffer.id)).toMatchObject({
      id: buffer.id,
      filePath: 'C:/notes/final.md',
      title: 'final.md',
      language: 'markdown',
      content: 'changed after opening',
      dirty: true,
      eol: 'CRLF',
      encoding: 'utf16le',
      diskMtime: 456,
    })
  })

  it('retargets every open descendant when a folder is renamed', () => {
    const direct = m.open({ filePath: 'C:/notes/old/todo.txt', content: 'todo', eol: 'LF', encoding: 'utf8' })
    const nested = m.open({ filePath: 'C:/notes/old/archive/plan.ts', content: 'plan', eol: 'LF', encoding: 'utf8' })
    const outside = m.open({ filePath: 'C:/notes/other.txt', content: 'other', eol: 'LF', encoding: 'utf8' })

    expect(m.renamePath('C:/notes/old', 'C:/notes/new', true)).toEqual([direct.id, nested.id])
    expect(m.get(direct.id)?.filePath).toBe('C:/notes/new/todo.txt')
    expect(m.get(nested.id)).toMatchObject({ filePath: 'C:/notes/new/archive/plan.ts', language: 'typescript' })
    expect(m.get(outside.id)?.filePath).toBe('C:/notes/other.txt')
  })

  it('matches renames case-insensitively across slash styles', () => {
    const buffer = m.open({ filePath: 'C:\\Notes\\Old\\Readme.TXT', content: 'readme', eol: 'LF', encoding: 'utf8' })

    expect(m.renamePath('c:/notes/old', 'D:/Moved', true)).toEqual([buffer.id])
    expect(m.get(buffer.id)?.filePath).toBe('D:/Moved/Readme.TXT')
  })

  it('preserves a UNC target prefix while retargeting an open file', () => {
    const buffer = m.open({ filePath: '\\\\server\\share\\old.txt', content: 'UNC', eol: 'LF', encoding: 'utf8' })

    expect(m.renamePath('\\\\SERVER/share/old.txt', '\\\\server\\share\\new.txt', false)).toEqual([buffer.id])
    expect(m.get(buffer.id)?.filePath).toBe('\\\\server\\share\\new.txt')
  })

  it('does not treat a shared prefix as a renamed folder descendant', () => {
    const buffer = m.open({ filePath: 'C:/notes/foobar/keep.txt', content: 'keep', eol: 'LF', encoding: 'utf8' })

    expect(m.renamePath('C:/notes/foo', 'C:/notes/new', true)).toEqual([])
    expect(m.get(buffer.id)?.filePath).toBe('C:/notes/foobar/keep.txt')
  })

  it('keeps newer edits dirty when an older save completes', () => {
    const b = m.create()
    m.update(b.id, 'content being saved')
    const savedRevision = m.captureRevision(b.id)
    expect(savedRevision).toBe(1)

    m.update(b.id, 'newer content')
    m.markSaved(b.id, 'C:/x/note.md', 4321, savedRevision)

    expect(b).toMatchObject({
      content: 'newer content',
      dirty: true,
      filePath: 'C:/x/note.md',
      title: 'note.md',
      language: 'markdown',
      diskMtime: 4321,
    })
    expect(eligibleForAutosave([b], new Set())).toEqual([b.id])
  })

  it('tracks edit revisions at runtime without adding them to session data', () => {
    const b = m.create()

    expect(m.captureRevision(b.id)).toBe(0)
    m.update(b.id, 'first edit')
    expect(m.captureRevision(b.id)).toBe(1)
    expect(m.toSession().buffers[0]).not.toHaveProperty('editRevision')
  })

  it('advances the save revision for EOL and encoding changes', () => {
    const b = m.create()
    const before = m.captureRevision(b.id)

    m.setEol(b.id, 'CRLF')
    const eolRevision = m.captureRevision(b.id)
    m.setEncoding(b.id, 'utf16le')
    m.markSaved(b.id, 'C:/x/note.txt', 1234, before)

    expect(b).toMatchObject({ eol: 'CRLF', encoding: 'utf16le', dirty: true })
    expect(eolRevision).toBe((before ?? 0) + 1)
    expect(m.captureRevision(b.id)).toBe((eolRevision ?? 0) + 1)
  })

  it('open activates an existing buffer with the same path instead of duplicating', () => {
    const first = m.open({ filePath: 'C:/a.ts', content: 'a', eol: 'LF' })
    const again = m.open({ filePath: 'C:/a.ts', content: 'a', eol: 'LF' })
    expect(m.list()).toHaveLength(1)
    expect(again.id).toBe(first.id)
  })

  it('external open replaces the sole clean empty unsaved placeholder', () => {
    const placeholder = m.create()
    const opened = m.openExternal(externalFile)

    expect(m.list()).toEqual([opened])
    expect(opened.id).not.toBe(placeholder.id)
    expect(opened).toMatchObject({
      title: 'opened.txt',
      filePath: externalFile.filePath,
      content: externalFile.content,
      language: 'plaintext',
      eol: 'CRLF',
      encoding: 'utf16le',
      dirty: false,
      diskMtime: 1234,
    })
    expect(m.activeId).toBe(opened.id)
  })

  it.each([
    { name: 'contains text', content: 'keep me', dirty: false },
    { name: 'is dirty', content: '', dirty: true },
  ])('external open preserves a sole Untitled buffer that $name', ({ content, dirty }) => {
    const kept = m.create({ content, dirty })
    m.openExternal(externalFile)

    expect(m.list()).toHaveLength(2)
    expect(m.get(kept.id)).toMatchObject({ content, dirty, filePath: null })
  })

  it('external open preserves a restored real file buffer', () => {
    const kept = m.open({ filePath: 'C:/notes/restored.txt', content: 'restored', eol: 'LF', encoding: 'utf8' })
    m.openExternal(externalFile)

    expect(m.list()).toHaveLength(2)
    expect(m.get(kept.id)?.content).toBe('restored')
  })

  it('external open preserves every buffer whenever more than one exists', () => {
    const restored = m.open({ filePath: 'C:/notes/restored.txt', content: 'restored', eol: 'LF', encoding: 'utf8' })
    const deliberateBlank = m.create()
    m.openExternal(externalFile)

    expect(m.list()).toHaveLength(3)
    expect(m.get(restored.id)?.filePath).toBe('C:/notes/restored.txt')
    expect(m.get(deliberateBlank.id)).toMatchObject({ filePath: null, content: '', dirty: false })
  })

  it('external open activates an existing path without removing another buffer', () => {
    const existing = m.open(externalFile)
    const deliberateBlank = m.create()
    const reopened = m.openExternal(externalFile)

    expect(reopened.id).toBe(existing.id)
    expect(m.activeId).toBe(existing.id)
    expect(m.list()).toHaveLength(2)
    expect(m.get(deliberateBlank.id)).toBeDefined()
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

  it('markSaved records the on-disk mtime for the overwrite guard', () => {
    const b = m.create()
    m.update(b.id, 'hello')
    m.markSaved(b.id, 'C:/x/note.txt', 1234)
    expect(m.get(b.id)!.diskMtime).toBe(1234)
  })

  it('open carries the read mtime onto the buffer', () => {
    const b = m.open({ filePath: 'C:/a.ts', content: 'a', eol: 'LF', encoding: 'utf8', mtimeMs: 999 })
    expect(b.diskMtime).toBe(999)
  })

  it('restore leaves diskMtime undefined for a session written before the guard existed', () => {
    m.restore({
      buffers: [{
        id: 'x', title: 'a.txt', filePath: 'C:/a.txt', content: 'a',
        language: 'plaintext', eol: 'LF', encoding: 'utf8', dirty: true
      }],
      activeId: 'x'
    })
    expect(m.get('x')!.diskMtime).toBeUndefined()
  })
})
