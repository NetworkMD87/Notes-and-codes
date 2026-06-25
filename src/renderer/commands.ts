import type { CommandPalette } from './commandPalette'
import type { BufferManager } from './bufferManager'
import type { SplitView } from './splitView'
import type { DiffView } from './diffView'
import { toast } from './notify'

export interface CommandDeps {
  palette: CommandPalette
  manager: BufferManager
  view: SplitView
  diff: DiffView
  paneFor: (which: 'A' | 'B') => import('./editorPane').EditorPane
  showActive: () => void
  scheduleSessionSave: () => void
  saveActive: () => Promise<void>
  saveAll: () => Promise<void>
  openFromDisk: () => Promise<void>
  startDiff: () => void
  getAutoSave: () => boolean
  setAutoSave: (v: boolean) => void
  diffClipboard: () => Promise<void>
  diffFiles: () => Promise<void>
  togglePreview: () => void
  pasteFromHistory: () => void
  clearPasteHistory: () => void
  saveSelectionAsSnippet: () => void
  insertSnippet: () => void
  manageSnippets: () => void
  toggleAlwaysOnTop: () => void
  zoomIn: () => void
  zoomOut: () => void
  zoomReset: () => void
  openAppearance: () => void
  openHistory: () => void
  openFolder: () => Promise<void>
  closeFolder: () => void
  toggleSidebar: () => void
  revealActive: () => void
  quickOpen: () => void
}

export function registerCommands(d: CommandDeps): void {
  const p = d.palette
  p.register({ id: 'new', label: 'New Tab', run: () => { d.manager.create(); d.showActive(); d.scheduleSessionSave() } })
  p.register({ id: 'close', label: 'Close Tab', run: () => { d.manager.close(d.manager.activeId!); if (!d.manager.list().length) d.manager.create(); d.showActive(); d.scheduleSessionSave() } })
  p.register({ id: 'split', label: 'Toggle Split', hint: 'Ctrl+\\', run: () => { d.view.setSplit(!d.view.isSplit()); d.showActive() } })
  p.register({ id: 'lines', label: 'Toggle Line Numbers', run: () => { d.paneFor(d.view.focusedPane()).toggleLineNumbers() } })
  p.register({ id: 'wrap', label: 'Toggle Word Wrap', run: () => { const on = d.paneFor(d.view.focusedPane()).toggleWordWrap(); toast('Word wrap: ' + (on ? 'on' : 'off')) } })
  p.register({ id: 'appearance', label: 'Appearance…', run: () => d.openAppearance() })
  p.register({ id: 'save', label: 'Save', hint: 'Ctrl+S', run: () => d.saveActive() })
  p.register({ id: 'save-all', label: 'Save All', hint: 'Ctrl+Shift+S', run: () => d.saveAll() })
  p.register({ id: 'open', label: 'Open File', hint: 'Ctrl+O', run: () => d.openFromDisk() })
  p.register({ id: 'diff', label: 'Start Diff (tab vs tab)', run: () => d.startDiff() })
  p.register({ id: 'diff-close', label: 'Close Diff', run: () => d.diff.hide() })
  p.register({ id: 'diff-clip', label: 'Diff: current vs clipboard', run: () => d.diffClipboard() })
  p.register({ id: 'diff-files', label: 'Diff: two files on disk', run: () => d.diffFiles() })
  p.register({ id: 'history', label: 'File History', run: () => d.openHistory() })
  p.register({ id: 'folder-open', label: 'Open Folder…', run: () => d.openFolder() })
  p.register({ id: 'folder-close', label: 'Close Folder', run: () => d.closeFolder() })
  p.register({ id: 'sidebar-toggle', label: 'Toggle Sidebar', run: () => d.toggleSidebar() })
  p.register({ id: 'reveal', label: 'Reveal Active File in Sidebar', run: () => d.revealActive() })
  p.register({ id: 'quick-open', label: 'Quick Open File', hint: 'Ctrl+P', run: () => d.quickOpen() })
  p.register({ id: 'autosave', label: 'Toggle Auto-Save Session', run: async () => {
    const next = !d.getAutoSave(); d.setAutoSave(next)
    const s = await window.api.loadSettings(); await window.api.saveSettings({ ...s, autoSaveSession: next })
  } })
  p.register({ id: 'mdpreview', label: 'Toggle Markdown Preview', run: () => d.togglePreview() })
  p.register({ id: 'paste-history', label: 'Paste from History', run: () => d.pasteFromHistory() })
  p.register({ id: 'clear-paste-history', label: 'Clear Paste History', run: () => d.clearPasteHistory() })
  p.register({ id: 'ctxmenu', label: 'Toggle "Open with Notes & Codes" right-click menu', run: async () => {
    const s = await window.api.loadSettings(); const next = !s.contextMenuEnabled
    await window.api.setContextMenu(next); await window.api.saveSettings({ ...s, contextMenuEnabled: next })
    toast(`Right-click menu ${next ? 'enabled' : 'disabled'}.`)
  } })
  p.register({ id: 'snip-save', label: 'Save Selection as Snippet', run: () => d.saveSelectionAsSnippet() })
  p.register({ id: 'snip-insert', label: 'Insert Snippet', run: () => d.insertSnippet() })
  p.register({ id: 'snip-manage', label: 'Manage Snippets', run: () => d.manageSnippets() })
  p.register({ id: 'aot', label: 'Toggle Always on Top', run: () => d.toggleAlwaysOnTop() })
  p.register({ id: 'zoom-in', label: 'Zoom In', hint: 'Ctrl+=', run: () => d.zoomIn() })
  p.register({ id: 'zoom-out', label: 'Zoom Out', hint: 'Ctrl+-', run: () => d.zoomOut() })
  p.register({ id: 'zoom-reset', label: 'Reset Zoom', hint: 'Ctrl+0', run: () => d.zoomReset() })
}
