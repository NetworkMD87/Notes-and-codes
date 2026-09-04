// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'

const editor = {
  onMouseUp: vi.fn(),
  onDidChangeModelContent: vi.fn(),
  onKeyDown: vi.fn(),
  createDecorationsCollection: () => ({ clear: vi.fn(), set: vi.fn(), length: 0, getRange: vi.fn() }),
  getModel: vi.fn(),
  getSelection: vi.fn(),
  executeEdits: vi.fn(),
  pushUndoStop: vi.fn(),
  setSelection: vi.fn(),
  focus: vi.fn(),
}

vi.mock('monaco-editor', () => ({
  editor: { create: () => editor },
  Range: { fromPositions: (start: unknown, end: unknown = start) => ({ start, end }) },
  KeyCode: { Enter: 3, Tab: 2 },
}))

import { EditorPane } from '../../src/renderer/editorPane'

describe('EditorPane Markdown tools', () => {
  beforeEach(() => vi.clearAllMocks())

  it('applies a Markdown transform as one Monaco edit and retains the inner selection', () => {
    const source = 'word'
    const positionAt = (offset: number) => ({ lineNumber: 1, column: offset + 1 })
    const model = {
      getLanguageId: () => 'markdown',
      getValue: () => source,
      getOffsetAt: (position: { column: number }) => position.column - 1,
      getPositionAt: positionAt,
    }
    editor.getModel.mockReturnValue(model)
    editor.getSelection.mockReturnValue({
      getStartPosition: () => positionAt(0),
      getEndPosition: () => positionAt(4),
    })
    const pane = new EditorPane(document.createElement('div'))

    pane.applyMarkdown('bold')

    expect(editor.executeEdits).toHaveBeenCalledOnce()
    expect(editor.executeEdits.mock.calls[0][1]).toEqual([{
      range: { start: positionAt(0), end: positionAt(4) },
      text: '**word**',
      forceMoveMarkers: true,
    }])
    expect(editor.pushUndoStop).toHaveBeenCalledTimes(2)
    expect(editor.setSelection).toHaveBeenCalledWith({ start: positionAt(2), end: positionAt(6) })
  })

  it('intercepts Enter on a Markdown list item as one undoable continuation edit', () => {
    let source = '- one'
    const positionAt = (offset: number) => ({ lineNumber: 1, column: offset + 1 })
    const model = {
      getLanguageId: () => 'markdown',
      getValue: () => source,
      getOffsetAt: (position: { column: number }) => position.column - 1,
      getPositionAt: positionAt,
    }
    editor.getModel.mockReturnValue(model)
    editor.getSelection.mockReturnValue({
      getStartPosition: () => positionAt(5),
      getEndPosition: () => positionAt(5),
    })
    new EditorPane(document.createElement('div'))
    expect(editor.onKeyDown).toHaveBeenCalledOnce()
    const preventDefault = vi.fn()
    const stopPropagation = vi.fn()

    editor.onKeyDown.mock.calls[0][0]({ keyCode: 3, shiftKey: false, preventDefault, stopPropagation })

    expect(preventDefault).toHaveBeenCalledOnce()
    expect(stopPropagation).toHaveBeenCalledOnce()
    expect(editor.executeEdits).toHaveBeenCalledWith('markdown-list-enter', [{
      range: { start: positionAt(5), end: positionAt(5) },
      text: '\n- ',
      forceMoveMarkers: true,
    }])
    expect(editor.pushUndoStop).toHaveBeenCalledTimes(2)
    expect(editor.setSelection).toHaveBeenCalledWith({ start: positionAt(8), end: positionAt(8) })
  })
})
