// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'

const monaco = vi.hoisted(() => {
  const editors: unknown[] = []
  const models: unknown[] = []
  return {
    editors,
    models,
    create: vi.fn(() => editors.shift()),
    createModel: vi.fn(() => models.shift()),
    setModelLanguage: vi.fn(),
  }
})

function editorDouble() {
  return {
    getModel: vi.fn(() => ({ dispose: vi.fn() })),
    setModel: vi.fn(),
    onMouseUp: vi.fn(),
    onDidChangeModelContent: vi.fn(),
    onKeyDown: vi.fn(),
    createDecorationsCollection: () => ({ clear: vi.fn(), set: vi.fn(), length: 0, getRange: vi.fn() }),
  }
}

function modelDouble() {
  return {
    isDisposed: vi.fn(() => false),
    getValue: vi.fn(() => 'alpha'),
    dispose: vi.fn(),
  }
}

vi.mock('monaco-editor', () => ({
  editor: {
    create: monaco.create,
    createModel: monaco.createModel,
    setModelLanguage: monaco.setModelLanguage,
  },
  Range: { fromPositions: (start: unknown, end: unknown = start) => ({ start, end }) },
  KeyCode: { Enter: 3, Tab: 2 },
}))

import { EditorPane } from '../../src/renderer/editorPane'

describe('EditorPane buffer language', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    monaco.editors.length = 0
    monaco.models.length = 0
  })

  it('changes both existing pane models without replacing either model', () => {
    const editorA = editorDouble()
    const editorB = editorDouble()
    const modelA = modelDouble()
    const modelB = modelDouble()
    monaco.editors.push(editorA, editorB)
    monaco.models.push(modelA, modelB)
    const buffer = {
      id: 'untitled', title: 'Untitled-1', filePath: null, content: 'alpha', language: 'plaintext',
      eol: 'LF' as const, encoding: 'utf8' as const, dirty: true,
    }
    const paneA = new EditorPane(document.createElement('div'))
    const paneB = new EditorPane(document.createElement('div'))
    paneA.setBuffer(buffer)
    paneB.setBuffer(buffer)
    vi.clearAllMocks()

    paneA.setBufferLanguage(buffer.id, 'markdown')
    paneB.setBufferLanguage(buffer.id, 'markdown')

    expect(monaco.setModelLanguage).toHaveBeenNthCalledWith(1, modelA, 'markdown')
    expect(monaco.setModelLanguage).toHaveBeenNthCalledWith(2, modelB, 'markdown')
    expect(monaco.createModel).not.toHaveBeenCalled()
    expect(editorA.setModel).not.toHaveBeenCalled()
    expect(editorB.setModel).not.toHaveBeenCalled()
  })
})
