import { clipboard, dialog, ipcMain, shell, type BrowserWindow } from 'electron'
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
import { saveHtml, savePdf } from './exportService'
import type { SessionData, Settings, EolMode, Encoding } from '../shared/types'

export interface IpcDeps {
  baseDir: string
  getWindow: () => BrowserWindow | null
  setContextMenu: (enabled: boolean) => Promise<void>
  onDirtyCount: (n: number) => void
  onQuitNow: () => void
  onRecentChanged?: () => void
}

export function registerIpc(deps: IpcDeps): void {
  const session = new SessionStore(deps.baseDir)
  const settings = new SettingsStore(deps.baseDir)
  const clip = new ClipboardHistoryStore(deps.baseDir)
  const snippets = new SnippetStore(deps.baseDir)
  const recent = new RecentFilesStore(deps.baseDir)
  const history = new FileHistoryStore(deps.baseDir)
  const watcher = new FileWatcher((path) => deps.getWindow()?.webContents.send('file:changed', path))
  const dirWatcher = new DirWatcher(() => deps.getWindow()?.webContents.send('dir:changed'))
  ipcMain.handle('watch:setPaths', (_e, paths: string[]) => watcher.setPaths(paths))

  ipcMain.handle('file:read', (_e, path: string) => readFileForEditor(path))
  ipcMain.handle('file:write', (_e, path: string, content: string, eol: EolMode, encoding: Encoding) =>
    writeFile(path, content, eol, encoding))
  ipcMain.handle('session:load', () => session.load())
  ipcMain.handle('session:save', (_e, data: SessionData) => session.save(data))
  ipcMain.handle('settings:load', () => settings.load())
  ipcMain.handle('settings:save', (_e, s: Settings) => settings.save(s))
  ipcMain.handle('contextmenu:set', (_e, enabled: boolean) => deps.setContextMenu(enabled))
  ipcMain.handle('dialog:saveAs', async () => {
    const r = await dialog.showSaveDialog({ title: 'Save As' })
    return r.canceled ? null : r.filePath ?? null
  })
  ipcMain.handle('dialog:open', async () => {
    const r = await dialog.showOpenDialog({ properties: ['openFile'] })
    return r.canceled || r.filePaths.length === 0 ? null : r.filePaths[0]
  })
  ipcMain.handle('clipboard:read', () => clipboard.readText())
  ipcMain.handle('clipboard-history:load', () => clip.load())
  ipcMain.handle('clipboard-history:save', (_e, entries: string[]) => clip.save(entries))
  ipcMain.handle('snippets:load', () => snippets.load())
  ipcMain.handle('snippets:save', (_e, list) => snippets.save(list))
  ipcMain.handle('window:setAlwaysOnTop', (_e, enabled: boolean) => { deps.getWindow()?.setAlwaysOnTop(enabled) })
  ipcMain.handle('recent:load', () => recent.load())
  ipcMain.handle('recent:add', async (_e, path: string) => { const result = await recent.add(path); deps.onRecentChanged?.(); return result })
  ipcMain.handle('recent:clear', () => recent.clear())
  ipcMain.handle('history:snapshot', (_e, path: string, content: string, eol: EolMode, encoding: Encoding) =>
    history.snapshot(path, content, eol, encoding))
  ipcMain.handle('history:list', (_e, path: string) => history.list(path))
  ipcMain.handle('history:get', (_e, path: string, ts: number) => history.get(path, ts))
  ipcMain.handle('dialog:openFolder', async () => {
    const r = await dialog.showOpenDialog({ properties: ['openDirectory'] })
    return r.canceled || r.filePaths.length === 0 ? null : r.filePaths[0]
  })
  ipcMain.handle('dir:read', (_e, path: string, showAll: boolean) => readDir(path, showAll))
  ipcMain.handle('dir:walk', (_e, path: string, showAll: boolean) => walkFiles(path, showAll))
  ipcMain.handle('fs:createFile', (_e, path: string) => createFile(path))
  ipcMain.handle('fs:createFolder', (_e, path: string) => createFolder(path))
  ipcMain.handle('fs:rename', (_e, from: string, to: string) => renamePath(from, to))
  ipcMain.handle('fs:trash', async (_e, path: string) => {
    try { await shell.trashItem(path); return true } catch { return false }
  })
  ipcMain.handle('dir:watch', (_e, path: string | null) => dirWatcher.watch(path))
  ipcMain.handle('dir:exists', (_e, path: string) => dirExists(path))
  ipcMain.handle('export:html', (_e, html: string, suggestedName: string, sourcePath: string | null) =>
    saveHtml(deps.getWindow(), html, suggestedName, sourcePath))
  ipcMain.handle('export:pdf', (_e, html: string, suggestedName: string, sourcePath: string | null) =>
    savePdf(deps.getWindow(), html, suggestedName, sourcePath))
  ipcMain.on('app:dirtyCount', (_e, n: number) => deps.onDirtyCount(n))
  ipcMain.on('window:hide', () => deps.getWindow()?.hide())
  ipcMain.on('app:quitNow', () => deps.onQuitNow())
}
