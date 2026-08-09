import { expect, it } from 'vitest'
import { snapshotSession } from '../../src/renderer/sessionSnapshot'
import type { SessionData } from '../../src/shared/types'

it('deep-copies session buffers and nested highlights', () => {
  const source: SessionData = {
    buffers: [{
      id: 'a', title: 'A', filePath: 'C:/a.txt', content: 'alpha', language: 'plaintext',
      eol: 'CRLF', encoding: 'utf8bom', dirty: true, diskMtime: 123,
      highlights: [{ start: 0, end: 5, colour: 'blue' }],
    }],
    activeId: 'a',
  }

  const copy = snapshotSession(source)
  source.buffers[0].content = 'changed'
  source.buffers[0].highlights![0].end = 99

  expect(copy).toEqual({
    buffers: [{
      id: 'a', title: 'A', filePath: 'C:/a.txt', content: 'alpha', language: 'plaintext',
      eol: 'CRLF', encoding: 'utf8bom', dirty: true, diskMtime: 123,
      highlights: [{ start: 0, end: 5, colour: 'blue' }],
    }],
    activeId: 'a',
  })
  expect(copy.buffers).not.toBe(source.buffers)
  expect(copy.buffers[0]).not.toBe(source.buffers[0])
  expect(copy.buffers[0].highlights![0]).not.toBe(source.buffers[0].highlights![0])
})
