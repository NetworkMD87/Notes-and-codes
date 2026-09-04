// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'

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
}))

import { EditorPane } from '../../src/renderer/editorPane'

describe('EditorPane Markdown tools', () => {
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
})
