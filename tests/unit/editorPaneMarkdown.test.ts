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
import { KeyCode } from 'monaco-editor'

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

  it('keeps carets after heading markers for empty and non-empty lines', () => {
    let source = 'note'
    let cursor = 0
    const positionAt = (offset: number) => ({ lineNumber: 1, column: offset + 1 })
    const model = {
      getLanguageId: () => 'markdown',
      getValue: () => source,
      getOffsetAt: (position: { column: number }) => position.column - 1,
      getPositionAt: positionAt,
    }
    editor.getModel.mockReturnValue(model)
    editor.getSelection.mockImplementation(() => ({
      getStartPosition: () => positionAt(cursor),
      getEndPosition: () => positionAt(cursor),
    }))
    editor.executeEdits.mockImplementation((_origin, edits) => {
      const edit = edits[0]
      const start = edit.range.start.column - 1
      const end = edit.range.end.column - 1
      source = source.slice(0, start) + edit.text + source.slice(end)
    })
    const pane = new EditorPane(document.createElement('div'))

    pane.applyMarkdown('heading')
    expect(source).toBe('# note')
    expect(editor.setSelection).toHaveBeenLastCalledWith({ start: positionAt(2), end: positionAt(2) })

    source = ''
    cursor = 0
    pane.applyMarkdown('heading')
    expect(source).toBe('# ')
    expect(editor.setSelection).toHaveBeenLastCalledWith({ start: positionAt(2), end: positionAt(2) })
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

    editor.onKeyDown.mock.calls[0][0]({ keyCode: KeyCode.Enter, shiftKey: false, preventDefault, stopPropagation })

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

  it('intercepts Tab and Shift+Tab on Markdown list items as undoable indent edits', () => {
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
      getStartPosition: () => positionAt(0),
      getEndPosition: () => positionAt(5),
    })
    new EditorPane(document.createElement('div'))
    const onKeyDown = editor.onKeyDown.mock.calls[0][0]
    editor.executeEdits.mockImplementation((_origin, edits) => {
      const edit = edits[0]
      const start = edit.range.start.column - 1
      const end = edit.range.end.column - 1
      source = source.slice(0, start) + edit.text + source.slice(end)
    })
    const tabPreventDefault = vi.fn()
    const tabStopPropagation = vi.fn()

    onKeyDown({ keyCode: KeyCode.Tab, shiftKey: false, preventDefault: tabPreventDefault, stopPropagation: tabStopPropagation })

    expect(source).toBe('  - one')
    expect(tabPreventDefault).toHaveBeenCalledOnce()
    expect(tabStopPropagation).toHaveBeenCalledOnce()
    expect(editor.executeEdits).toHaveBeenCalledOnce()
    expect(editor.executeEdits).toHaveBeenCalledWith('markdown-list-indent', [{
      range: { start: positionAt(0), end: positionAt(5) },
      text: '  - one',
      forceMoveMarkers: true,
    }])
    expect(editor.pushUndoStop).toHaveBeenCalledTimes(2)

    editor.getSelection.mockReturnValue({
      getStartPosition: () => positionAt(0),
      getEndPosition: () => positionAt(7),
    })
    const outdentPreventDefault = vi.fn()
    const outdentStopPropagation = vi.fn()
    onKeyDown({ keyCode: KeyCode.Tab, shiftKey: true, preventDefault: outdentPreventDefault, stopPropagation: outdentStopPropagation })

    expect(source).toBe('- one')
    expect(outdentPreventDefault).toHaveBeenCalledOnce()
    expect(outdentStopPropagation).toHaveBeenCalledOnce()
    expect(editor.executeEdits).toHaveBeenCalledTimes(2)
    expect(editor.pushUndoStop).toHaveBeenCalledTimes(4)
  })

  it('leaves modified Enter and Tab chords to Monaco', () => {
    const source = '- one'
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
    const onKeyDown = editor.onKeyDown.mock.calls[0][0]

    for (const event of [
      { keyCode: KeyCode.Enter, shiftKey: true },
      { keyCode: KeyCode.Enter, ctrlKey: true },
      { keyCode: KeyCode.Enter, altKey: true },
      { keyCode: KeyCode.Enter, metaKey: true },
      { keyCode: KeyCode.Tab, ctrlKey: true },
      { keyCode: KeyCode.Tab, altKey: true },
      { keyCode: KeyCode.Tab, metaKey: true },
    ]) {
      const preventDefault = vi.fn()
      const stopPropagation = vi.fn()
      onKeyDown({ ...event, preventDefault, stopPropagation })
      expect(preventDefault).not.toHaveBeenCalled()
      expect(stopPropagation).not.toHaveBeenCalled()
    }
    expect(editor.executeEdits).not.toHaveBeenCalled()
    expect(editor.pushUndoStop).not.toHaveBeenCalled()
  })
})
