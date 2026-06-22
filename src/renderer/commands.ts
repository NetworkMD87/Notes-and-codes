import type { CommandPalette } from './commandPalette'
import type { BufferManager } from './bufferManager'
import type { SplitView } from './splitView'
import type { ThemeController } from './theme'
import type { DiffView } from './diffView'
import { toast } from './notify'

export interface CommandDeps {
  palette: CommandPalette
  manager: BufferManager
  view: SplitView
  theme: ThemeController
  diff: DiffView
  paneFor: (which: 'A' | 'B') => import('./editorPane').EditorPane
  showActive: () => void
  scheduleSessionSave: () => void
  saveActive: () => Promise<void>
  openFromDisk: () => Promise<void>
  startDiff: () => void
  getAutoSave: () => boolean
  setAutoSave: (v: boolean) => void
  diffClipboard: () => Promise<void>
  diffFiles: () => Promise<void>
  togglePreview: () => void
}

export function registerCommands(d: CommandDeps): void {
  const p = d.palette
  p.register({ id: 'new', label: 'New Tab', run: () => { d.manager.create(); d.showActive(); d.scheduleSessionSave() } })
  p.register({ id: 'close', label: 'Close Tab', run: () => { d.manager.close(d.manager.activeId!); if (!d.manager.list().length) d.manager.create(); d.showActive(); d.scheduleSessionSave() } })
  p.register({ id: 'split', label: 'Toggle Split', hint: 'Ctrl+\\', run: () => { d.view.setSplit(!d.view.isSplit()); d.showActive() } })
  p.register({ id: 'lines', label: 'Toggle Line Numbers', run: () => { d.paneFor(d.view.focusedPane()).toggleLineNumbers() } })
  p.register({ id: 'theme', label: 'Cycle Theme', run: () => d.theme.cycle() })
  p.register({ id: 'save', label: 'Save', hint: 'Ctrl+S', run: () => d.saveActive() })
  p.register({ id: 'open', label: 'Open File', hint: 'Ctrl+O', run: () => d.openFromDisk() })
  p.register({ id: 'diff', label: 'Start Diff (tab vs tab)', run: () => d.startDiff() })
  p.register({ id: 'diff-close', label: 'Close Diff', run: () => d.diff.hide() })
  p.register({ id: 'diff-clip', label: 'Diff: current vs clipboard', run: () => d.diffClipboard() })
  p.register({ id: 'diff-files', label: 'Diff: two files on disk', run: () => d.diffFiles() })
  p.register({ id: 'autosave', label: 'Toggle Auto-Save Session', run: async () => {
    const next = !d.getAutoSave(); d.setAutoSave(next)
    const s = await window.api.loadSettings(); await window.api.saveSettings({ ...s, autoSaveSession: next })
  } })
  p.register({ id: 'mdpreview', label: 'Toggle Markdown Preview', run: () => d.togglePreview() })
  p.register({ id: 'ctxmenu', label: 'Toggle "Open with Notes & Codes" right-click menu', run: async () => {
    const s = await window.api.loadSettings(); const next = !s.contextMenuEnabled
    await window.api.setContextMenu(next); await window.api.saveSettings({ ...s, contextMenuEnabled: next })
    toast(`Right-click menu ${next ? 'enabled' : 'disabled'}.`)
  } })
}
