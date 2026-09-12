import { describe, expect, it } from 'vitest'
import type { BufferState } from '../../src/shared/types'
import { BufferManager } from '../../src/renderer/bufferManager'
import { isCurrentBufferPath, isCurrentFileChange } from '../../src/renderer/fileChangeGuard'

const buffer: BufferState = {
  id: 'note', title: 'note.txt', filePath: 'C:/notes/note.txt', content: 'dirty',
  language: 'plaintext', eol: 'LF', encoding: 'utf8', dirty: true,
}

describe('isCurrentFileChange', () => {
  it('rejects an old-path watcher completion after its buffer was retargeted', () => {
    const manager = new BufferManager(() => buffer.id)
    const captured = manager.open({ filePath: 'C:/notes/note.txt', content: 'dirty', eol: 'LF', encoding: 'utf8' })
    const generations = new Map([[buffer.id, 4]])
    manager.renamePath('C:/notes/note.txt', 'C:/notes/renamed.txt', false)

    expect(manager.get(captured.id)).toBe(captured)
    expect(isCurrentFileChange(manager.get(captured.id), captured, 'C:/notes/note.txt', 4, generations)).toBe(false)
  })

  it('rejects the second reload completion after an in-place rename', () => {
    const manager = new BufferManager(() => buffer.id)
    const captured = manager.open({ filePath: 'C:/notes/note.txt', content: 'clean', eol: 'LF', encoding: 'utf8' })
    manager.renamePath('C:/notes/note.txt', 'C:/notes/renamed.txt', false)

    expect(isCurrentBufferPath(manager.get(captured.id), captured, 'C:/notes/note.txt')).toBe(false)
  })

  it('accepts the latest watcher completion for the same current path and buffer', () => {
    const generations = new Map([[buffer.id, 4]])

    expect(isCurrentFileChange(buffer, buffer, 'C:/notes/note.txt', 4, generations)).toBe(true)
  })
})
