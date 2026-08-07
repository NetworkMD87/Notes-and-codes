import type { ContextMenuEntry } from './contextMenu'

export interface EditorContextMenuTarget {
  clientX: number
  clientY: number
  modelUri: string
  modelVersion: number
  startOffset: number
  endOffset: number
}

export interface EditorMenuAction {
  isSupported(): boolean
  run(): Promise<void>
}

export type EditorActionLookup = (id: string) => EditorMenuAction | null

const GROUPS: ReadonlyArray<ReadonlyArray<{ label: string; id: string }>> = [
  [{ label: 'Undo', id: 'undo' }, { label: 'Redo', id: 'redo' }],
  [
    { label: 'Cut', id: 'editor.action.clipboardCutAction' },
    { label: 'Copy', id: 'editor.action.clipboardCopyAction' },
    { label: 'Paste', id: 'editor.action.clipboardPasteAction' },
    { label: 'Select All', id: 'editor.action.selectAll' },
  ],
]

export function buildEditorContextEntries(
  getAction: EditorActionLookup,
  openCommandPalette: () => void,
): ContextMenuEntry[] {
  const groups: ContextMenuEntry[][] = GROUPS.map(group => group.flatMap(({ label, id }) => {
    const action = getAction(id)
    return action?.isSupported() ? [{ label, run: () => { void action.run() } }] : []
  }))
  groups.push([{ label: 'Command Palette', run: openCommandPalette }])
  const entries: ContextMenuEntry[] = []
  for (const group of groups.filter(group => group.length)) {
    if (entries.length) entries.push({ separator: true })
    entries.push(...group)
  }
  return entries
}
