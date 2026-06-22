import { clipboard, dialog, ipcMain, type BrowserWindow } from 'electron'
import { readFileForEditor, writeFile } from './fileService'
import { SessionStore } from './sessionStore'
import { SettingsStore } from './settingsStore'
import type { SessionData, Settings, EolMode, Encoding } from '../shared/types'

export interface IpcDeps {
  baseDir: string
  getWindow: () => BrowserWindow | null
  setContextMenu: (enabled: boolean) => Promise<void>
}

export function registerIpc(deps: IpcDeps): void {
  const session = new SessionStore(deps.baseDir)
  const settings = new SettingsStore(deps.baseDir)

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
}
