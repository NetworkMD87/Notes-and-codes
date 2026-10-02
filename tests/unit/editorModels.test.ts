import { describe, expect, it, vi } from 'vitest'
import type { BufferState } from '../../src/shared/types'

vi.mock('monaco-editor', () => ({
  editor: {
    createModel: (content: string, language: string) => {
      let disposed = false
      return {
        getValue: () => content,
        getLanguageId: () => language,
        isDisposed: () => disposed,
        dispose: () => { disposed = true },
      }
    },
  },
}))

import { EditorModels } from '../../src/renderer/editorModels'

const buffer: BufferState = {
  id: 'a', content: 'initial', language: 'plaintext', title: 'A', filePath: null,
  eol: 'LF', encoding: 'utf8', dirty: false,
}

describe('shared editor model ownership', () => {
  it('reuses a document for a second view and keeps different buffers independent', () => {
    const models = new EditorModels()
    const first = models.get(buffer)
    expect(models.get({ ...buffer, content: 'stale view snapshot' })).toBe(first)
    expect(first.getValue()).toBe('initial')
    expect(models.get({ ...buffer, id: 'b', content: 'other' }).getValue()).toBe('other')
    models.dispose()
  })

  it('rebinds every peer before disposing an externally replaced document', () => {
    const models = new EditorModels()
    const old = models.get(buffer)
    const observations: string[] = []
    for (const pane of ['A', 'B']) {
      models.onReplace((id, model) => {
        expect(id).toBe('a')
        expect(old.isDisposed()).toBe(false)
        expect(model).toBe(models.get(buffer))
        observations.push(`${pane}:${model?.getValue()}`)
      })
    }
    models.refresh({ ...buffer, content: 'reloaded' })
    expect(observations).toEqual(['A:reloaded', 'B:reloaded'])
    expect(old.isDisposed()).toBe(true)
  })

  it('detaches views before forgetting a closed buffer without disposing another buffer', () => {
    const models = new EditorModels()
    const old = models.get(buffer)
    const other = models.get({ ...buffer, id: 'b' })
    const calls: string[] = []
    models.onReplace((id, model) => {
      expect(old.isDisposed()).toBe(false)
      expect(model).toBeNull()
      calls.push(id)
    })
    models.forget('a')
    expect(calls).toEqual(['a'])
    expect(old.isDisposed()).toBe(true)
    expect(other.isDisposed()).toBe(false)
    expect(models.get({ ...buffer, content: 'reopened' }).getValue()).toBe('reopened')
  })
})
