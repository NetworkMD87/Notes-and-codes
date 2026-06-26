import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type { Api } from '../shared/types'

const api: Api = {
  readFile: (path) => ipcRenderer.invoke('file:read', path),
  writeFile: (path, content, eol, encoding) => ipcRenderer.invoke('file:write', path, content, eol, encoding),
  loadSession: () => ipcRenderer.invoke('session:load'),
  saveSession: (data) => ipcRenderer.invoke('session:save', data),
  loadSettings: () => ipcRenderer.invoke('settings:load'),
  saveSettings: (s) => ipcRenderer.invoke('settings:save', s),
  setContextMenu: (enabled) => ipcRenderer.invoke('contextmenu:set', enabled),
  onOpenFile: (cb) => {
    ipcRenderer.removeAllListeners('open-file')
    ipcRenderer.on('open-file', (_e, path: string) => cb(path))
  },
  saveAsDialog: () => ipcRenderer.invoke('dialog:saveAs'),
  openDialog: () => ipcRenderer.invoke('dialog:open'),
  clipboardRead: () => ipcRenderer.invoke('clipboard:read'),
  loadClipboardHistory: () => ipcRenderer.invoke('clipboard-history:load'),
  saveClipboardHistory: (entries) => ipcRenderer.invoke('clipboard-history:save', entries),
  loadSnippets: () => ipcRenderer.invoke('snippets:load'),
  saveSnippets: (list) => ipcRenderer.invoke('snippets:save', list),
  setAlwaysOnTop: (enabled) => ipcRenderer.invoke('window:setAlwaysOnTop', enabled),
  loadRecentFiles: () => ipcRenderer.invoke('recent:load'),
  addRecentFile: (path) => ipcRenderer.invoke('recent:add', path),
  clearRecentFiles: () => ipcRenderer.invoke('recent:clear'),
  pathForDroppedFile: (file) => webUtils.getPathForFile(file),
  watchPaths: (paths) => ipcRenderer.invoke('watch:setPaths', paths),
  onFileChanged: (cb) => { ipcRenderer.removeAllListeners('file:changed'); ipcRenderer.on('file:changed', (_e, path: string) => cb(path)) },
  setDirtyCount: (n) => ipcRenderer.send('app:dirtyCount', n),
  hideWindow: () => ipcRenderer.send('window:hide'),
  quitNow: () => ipcRenderer.send('app:quitNow'),
  onSaveAllAndQuit: (cb) => { ipcRenderer.removeAllListeners('app:saveAllAndQuit'); ipcRenderer.on('app:saveAllAndQuit', () => cb()) },
  onMenuCommand: (cb) => { ipcRenderer.removeAllListeners('menu:command'); ipcRenderer.on('menu:command', (_e, id: string) => cb(id)) },
  snapshotHistory: (path, content, eol, encoding) => ipcRenderer.invoke('history:snapshot', path, content, eol, encoding),
  listHistory: (path) => ipcRenderer.invoke('history:list', path),
  getHistory: (path, ts) => ipcRenderer.invoke('history:get', path, ts),
  openFolderDialog: () => ipcRenderer.invoke('dialog:openFolder'),
  readDir: (path, showAll) => ipcRenderer.invoke('dir:read', path, showAll),
  walkFiles: (path, showAll) => ipcRenderer.invoke('dir:walk', path, showAll),
  createFile: (path) => ipcRenderer.invoke('fs:createFile', path),
  createFolder: (path) => ipcRenderer.invoke('fs:createFolder', path),
  renamePath: (from, to) => ipcRenderer.invoke('fs:rename', from, to),
  trashPath: (path) => ipcRenderer.invoke('fs:trash', path),
  watchDir: (path) => ipcRenderer.invoke('dir:watch', path),
  onDirChanged: (cb) => { ipcRenderer.removeAllListeners('dir:changed'); ipcRenderer.on('dir:changed', () => cb()) },
  dirExists: (path) => ipcRenderer.invoke('dir:exists', path),
}

contextBridge.exposeInMainWorld('api', api)
