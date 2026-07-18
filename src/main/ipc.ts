import { app, clipboard, dialog, ipcMain, shell, type BrowserWindow, type IpcMainInvokeEvent, type IpcMainEvent } from 'electron'
import { isTrustedSender } from './senderGuard'
import { readFileForEditor, writeFile } from './fileService'
import { readDir, walkFiles, createFile, createFolder, renamePath, dirExists } from './fsService'
import { DirWatcher } from './dirWatcher'
import { SessionStore } from './sessionStore'
import { SettingsStore } from './settingsStore'
import { ClipboardHistoryStore } from './clipboardHistoryStore'
import { SnippetStore } from './snippetStore'
import { RecentFilesStore } from './recentFilesStore'
import { FileWatcher } from './fileWatcher'
import { FileHistoryStore } from './fileHistoryStore'
import { HighlightStore } from './highlightStore'
import { saveHtml, savePdf } from './exportService'
import type { SessionData, Settings, EolMode, Encoding } from '../shared/types'

export interface IpcDeps {
  baseDir: string
  // Constructed once in index.ts and shared, so the menu (Clear Recent, hotkey read) and
  // the renderer IPC hit the *same* store instance — one serialized write chain, no races.
  settings: SettingsStore
  recent: RecentFilesStore
  getWindow: () => BrowserWindow | null
  setContextMenu: (enabled: boolean) => Promise<void>
  onDirtyCount: (n: number) => void
  onQuitNow: () => void
  onRecentChanged?: () => void
}

export function registerIpc(deps: IpcDeps): void {
  const session = new SessionStore(deps.baseDir)
  const settings = deps.settings
  const clip = new ClipboardHistoryStore(deps.baseDir)
  const snippets = new SnippetStore(deps.baseDir)
  const recent = deps.recent
  const history = new FileHistoryStore(deps.baseDir)
  const highlights = new HighlightStore(deps.baseDir)
  // One-shot startup GC: drop history/highlight entries whose source file is gone, so
  // these stores can't grow without bound or orphan entries. Fire-and-forget (best-effort).
  void history.sweep()
  void highlights.sweep()
  const watcher = new FileWatcher((path) => deps.getWindow()?.webContents.send('file:changed', path))
  const dirWatcher = new DirWatcher(() => deps.getWindow()?.webContents.send('dir:changed'))

  // Every handler is registered through `handle`/`on`, which reject any sender that is not
  // the app window's own main frame (L2 hardening). fs-capable channels (file:read/write,
  // fs:rename, dir:walk, …) take arbitrary paths, so the standard guard is one identity
  // check per handler — done once here rather than sprinkled across ~40 registrations.
  const senderOk = (e: IpcMainInvokeEvent | IpcMainEvent): boolean => {
    const win = deps.getWindow()
    if (!win || win.isDestroyed()) return false
    return isTrustedSender(e.senderFrame, win.webContents.mainFrame)
  }
  const handle = (channel: string, listener: Parameters<typeof ipcMain.handle>[1]): void => {
    ipcMain.handle(channel, (e, ...args) => {
      if (!senderOk(e)) { console.warn('[ipc] rejected', channel, 'from an untrusted sender'); return undefined }
      return listener(e, ...args)
    })
  }
  const on = (channel: string, listener: Parameters<typeof ipcMain.on>[1]): void => {
    ipcMain.on(channel, (e, ...args) => {
      if (!senderOk(e)) { console.warn('[ipc] rejected', channel, 'from an untrusted sender'); return }
      listener(e, ...args)
    })
  }

  handle('watch:setPaths', (_e, paths: string[]) => watcher.setPaths(paths))

  handle('file:read', (_e, path: string) => readFileForEditor(path))
  handle('file:write', (_e, path: string, content: string, eol: EolMode, encoding: Encoding, expectedMtime?: number) =>
    writeFile(path, content, eol, encoding, expectedMtime))
  handle('session:load', () => session.load())
  handle('session:save', (_e, data: SessionData) => session.save(data))
  handle('settings:load', () => settings.load())
  handle('settings:save', (_e, s: Settings) => settings.save(s))
  handle('settings:update', (_e, partial: Partial<Settings>) => settings.update(partial))
  handle('contextmenu:set', (_e, enabled: boolean) => deps.setContextMenu(enabled))
  handle('dialog:saveAs', async () => {
    const r = await dialog.showSaveDialog({ title: 'Save As' })
    return r.canceled ? null : r.filePath ?? null
  })
  handle('dialog:open', async () => {
    const r = await dialog.showOpenDialog({ properties: ['openFile'] })
    return r.canceled || r.filePaths.length === 0 ? null : r.filePaths[0]
  })
  handle('clipboard:read', () => clipboard.readText())
  handle('clipboard-history:load', () => clip.load())
  handle('clipboard-history:save', (_e, entries: string[]) => clip.save(entries))
  handle('snippets:load', () => snippets.load())
  handle('snippets:save', (_e, list) => snippets.save(list))
  handle('window:setAlwaysOnTop', (_e, enabled: boolean) => { deps.getWindow()?.setAlwaysOnTop(enabled) })
  handle('recent:load', () => recent.load())
  handle('recent:add', async (_e, path: string) => { const result = await recent.add(path); deps.onRecentChanged?.(); return result })
  handle('recent:clear', () => recent.clear())
  handle('history:snapshot', (_e, path: string, content: string, eol: EolMode, encoding: Encoding) =>
    history.snapshot(path, content, eol, encoding))
  handle('history:list', (_e, path: string) => history.list(path))
  handle('history:get', (_e, path: string, ts: number) => history.get(path, ts))
  handle('highlights:load', (_e, path: string) => highlights.load(path))
  handle('highlights:save', (_e, path: string, hs: import('../shared/types').Highlight[]) =>
    highlights.save(path, hs))
  handle('dialog:openFolder', async () => {
    const r = await dialog.showOpenDialog({ properties: ['openDirectory'] })
    return r.canceled || r.filePaths.length === 0 ? null : r.filePaths[0]
  })
  handle('dir:read', (_e, path: string, showAll: boolean) => readDir(path, showAll))
  handle('dir:walk', (_e, path: string, showAll: boolean) => walkFiles(path, showAll))
  handle('fs:createFile', (_e, path: string) => createFile(path))
  handle('fs:createFolder', (_e, path: string) => createFolder(path))
  handle('fs:rename', (_e, from: string, to: string) => renamePath(from, to))
  handle('fs:trash', async (_e, path: string) => {
    try { await shell.trashItem(path); return true } catch { return false }
  })
  handle('dir:watch', (_e, path: string | null) => dirWatcher.watch(path))
  handle('dir:exists', (_e, path: string) => dirExists(path))
  handle('export:html', (_e, html: string, suggestedName: string, sourcePath: string | null) =>
    saveHtml(deps.getWindow(), html, suggestedName, sourcePath))
  handle('export:pdf', (_e, html: string, suggestedName: string, sourcePath: string | null) =>
    savePdf(deps.getWindow(), html, suggestedName, sourcePath))
  on('app:dirtyCount', (_e, n: number) => deps.onDirtyCount(n))
  on('window:hide', () => deps.getWindow()?.hide())
  on('app:quitNow', () => deps.onQuitNow())
  handle('app:getVersion', () => app.getVersion())
  handle('app:openExternal', (_e, url: string) => {
    try { if (new URL(url).protocol === 'https:') return shell.openExternal(url) } catch { /* ignore */ }
  })
}
