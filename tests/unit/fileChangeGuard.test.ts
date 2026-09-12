import { describe, expect, it } from 'vitest'
import type { BufferState } from '../../src/shared/types'
import { isCurrentFileChange } from '../../src/renderer/fileChangeGuard'

const buffer: BufferState = {
  id: 'note', title: 'note.txt', filePath: 'C:/notes/note.txt', content: 'dirty',
  language: 'plaintext', eol: 'LF', encoding: 'utf8', dirty: true,
}

describe('isCurrentFileChange', () => {
  it('rejects an old-path watcher completion after its buffer was retargeted', () => {
    const renamed = { ...buffer, filePath: 'C:/notes/renamed.txt', title: 'renamed.txt' }
    const generations = new Map([[buffer.id, 4]])

    expect(isCurrentFileChange(renamed, buffer, 'C:/notes/note.txt', 4, generations)).toBe(false)
  })

  it('accepts the latest watcher completion for the same current path and buffer', () => {
    const generations = new Map([[buffer.id, 4]])

    expect(isCurrentFileChange(buffer, buffer, 'C:/notes/note.txt', 4, generations)).toBe(true)
  })
})
