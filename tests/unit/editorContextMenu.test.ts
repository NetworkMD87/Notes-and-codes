import { describe, expect, it, vi } from 'vitest'
import { buildEditorContextEntries, type EditorMenuAction } from '../../src/renderer/editorContextMenu'

const fake = (supported = true, run = vi.fn(async () => undefined)): EditorMenuAction => ({
  isSupported: () => supported,
  run,
})

describe('buildEditorContextEntries', () => {
  it('orders supported actions in stable groups', () => {
    const actions = new Map<string, EditorMenuAction>([
      ['undo', fake()], ['redo', fake()],
      ['editor.action.clipboardCutAction', fake()],
      ['editor.action.clipboardCopyAction', fake()],
      ['editor.action.clipboardPasteAction', fake()],
      ['editor.action.selectAll', fake()],
    ])
    const entries = buildEditorContextEntries(id => actions.get(id) ?? null, vi.fn())
    expect(entries.map(entry => 'separator' in entry ? '---' : entry.label)).toEqual([
      'Undo', 'Redo', '---', 'Cut', 'Copy', 'Paste', 'Select All', '---', 'Command Palette',
    ])
  })

  it('omits unsupported actions without edge or doubled separators', () => {
    const entries = buildEditorContextEntries(
      id => id === 'editor.action.clipboardCopyAction' ? fake() : null,
      vi.fn(),
    )
    expect(entries.map(entry => 'separator' in entry ? '---' : entry.label)).toEqual([
      'Copy', '---', 'Command Palette',
    ])
  })

  it('runs Monaco and app callbacks', async () => {
    const copy = vi.fn(async () => undefined)
    const palette = vi.fn()
    const entries = buildEditorContextEntries(
      id => id === 'editor.action.clipboardCopyAction' ? fake(true, copy) : null,
      palette,
    )
    const rows = entries.filter(entry => !('separator' in entry))
    rows.find(row => row.label === 'Copy')!.run()
    rows.find(row => row.label === 'Command Palette')!.run()
    await Promise.resolve()
    expect(copy).toHaveBeenCalledOnce()
    expect(palette).toHaveBeenCalledOnce()
  })
})
