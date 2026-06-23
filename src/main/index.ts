import { app, BrowserWindow, dialog, globalShortcut, Tray } from 'electron'
import { join } from 'node:path'
import { registerIpc } from './ipc'
import { setContextMenu } from './contextMenu'
import { createTray } from './tray'
import { buildMenu } from './menu'
import { RecentFilesStore } from './recentFilesStore'

let mainWindow: BrowserWindow | null = null
let pendingFile: string | null = null
let tray: Tray | null = null
let isQuitting = false
let dirtyNamedCount = 0
let recentStore: RecentFilesStore | null = null

async function rebuildMenu(): Promise<void> {
  if (!recentStore) return
  buildMenu({
    send: (id) => mainWindow?.webContents.send('menu:command', id),
    requestQuit,
    recent: await recentStore.load(),
    openRecent: (p) => mainWindow?.webContents.send('open-file', p),
    clearRecent: async () => { await recentStore!.clear(); void rebuildMenu() }
  })
}

function fileArgFrom(argv: string[]): string | null {
  // Packaged: argv = [exe, ...args]. Unpackaged (dev/electron <script>): argv = [electronExe, entryScript, ...args].
  const args = app.isPackaged ? argv.slice(1) : argv.slice(2)
  const candidate = args.reverse().find(a => !a.startsWith('-') && /[\\/.]/.test(a))
  return candidate ?? null
}

function requestQuit(): void {
  if (dirtyNamedCount === 0 || !mainWindow) { isQuitting = true; app.quit(); return }
  const choice = dialog.showMessageBoxSync(mainWindow, {
    type: 'warning', buttons: ['Save', "Don't Save", 'Cancel'], defaultId: 0, cancelId: 2,
    message: `You have unsaved changes in ${dirtyNamedCount} file${dirtyNamedCount === 1 ? '' : 's'}.`,
    detail: 'Save before quitting?'
  })
  if (choice === 2) return                                    // Cancel
  if (choice === 1) { isQuitting = true; app.quit(); return } // Don't Save
  mainWindow.webContents.send('app:saveAllAndQuit')           // Save → renderer saves then app:quitNow
  setTimeout(() => { if (!isQuitting) { isQuitting = true; app.quit() } }, 4000)
}

function showWindow(): void {
  if (!mainWindow) { mainWindow = createWindow() }
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show(); mainWindow.focus()
}

function toggleWindow(): void {
  if (mainWindow && mainWindow.isVisible() && mainWindow.isFocused()) mainWindow.hide()
  else showWindow()
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
  win.on('close', (e) => { if (!isQuitting) { e.preventDefault(); win.hide() } })
  win.webContents.on('before-input-event', (_e, input) => {
    if (input.control && input.key.toLowerCase() === 'q') { requestQuit() }
  })
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

  app.whenReady().then(async () => {
    recentStore = new RecentFilesStore(app.getPath('userData'))
    registerIpc({
      baseDir: app.getPath('userData'),
      getWindow: () => mainWindow,
      setContextMenu: (enabled) => setContextMenu(enabled, app.getPath('exe')),
      onDirtyCount: (n) => { dirtyNamedCount = n },
      onQuitNow: () => { isQuitting = true; app.quit() },
      onRecentChanged: () => { void rebuildMenu() }
    })
    pendingFile = fileArgFrom(process.argv)
    mainWindow = createWindow()
    void rebuildMenu()
    mainWindow.webContents.on('did-finish-load', () => {
      if (pendingFile) mainWindow!.webContents.send('open-file', pendingFile)
    })

    tray = createTray({ onShow: showWindow, onQuit: () => { requestQuit() } })
    const settings = await new (await import('./settingsStore')).SettingsStore(app.getPath('userData')).load()
    const ok = globalShortcut.register(settings.globalHotkey || 'CommandOrControl+Shift+Space', toggleWindow)
    if (!ok) console.error('global hotkey registration failed:', settings.globalHotkey)

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) mainWindow = createWindow()
    })
  })

  app.on('before-quit', () => { isQuitting = true })
  app.on('will-quit', () => { globalShortcut.unregisterAll() })
}

app.on('window-all-closed', () => {
  // Intentionally do nothing on Windows: the app lives in the tray after the
  // window is hidden. Quit only happens via the tray menu / before-quit.
  if (process.platform === 'darwin') { /* keep mac default */ }
})
