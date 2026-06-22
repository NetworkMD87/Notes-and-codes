import { app, BrowserWindow } from 'electron'
import { join } from 'node:path'
import { registerIpc } from './ipc'
import { setContextMenu } from './contextMenu'

let mainWindow: BrowserWindow | null = null
let pendingFile: string | null = null

function fileArgFrom(argv: string[]): string | null {
  // last arg that exists as a path and isn't a flag
  const candidate = argv.slice(1).reverse().find(a => !a.startsWith('-') && /[\\/.]/.test(a))
  return candidate ?? null
}

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1100,
    height: 720,
    title: 'Notes & Codes',
    backgroundColor: '#1e1e1e',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })
  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
  return win
}

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', (_e, argv) => {
    const f = fileArgFrom(argv)
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
      if (f) mainWindow.webContents.send('open-file', f)
    }
  })

  app.whenReady().then(() => {
    registerIpc({
      baseDir: app.getPath('userData'),
      getWindow: () => mainWindow,
      setContextMenu: (enabled) => setContextMenu(enabled, app.getPath('exe'))
    })
    pendingFile = fileArgFrom(process.argv)
    mainWindow = createWindow()
    mainWindow.webContents.on('did-finish-load', () => {
      if (pendingFile) mainWindow!.webContents.send('open-file', pendingFile)
    })
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) mainWindow = createWindow()
    })
  })
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
