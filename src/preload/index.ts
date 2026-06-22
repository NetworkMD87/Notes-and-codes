import { contextBridge, ipcRenderer } from 'electron'
import type { Api } from '../shared/types'

const api: Api = {
  readFile: (path) => ipcRenderer.invoke('file:read', path),
  writeFile: (path, content, eol) => ipcRenderer.invoke('file:write', path, content, eol),
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
}

contextBridge.exposeInMainWorld('api', api)
