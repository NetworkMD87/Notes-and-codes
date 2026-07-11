import { app, BrowserWindow, dialog, globalShortcut, nativeTheme, Tray } from 'electron'
import { join } from 'node:path'
import { registerIpc } from './ipc'
import { setContextMenu } from './contextMenu'
import { createTray } from './tray'
import { glyphImage } from './themeIcon'
import { buildMenu } from './menu'
import { RecentFilesStore } from './recentFilesStore'
import { SettingsStore } from './settingsStore'

let mainWindow: BrowserWindow | null = null
let pendingFile: string | null = null
let tray: Tray | null = null
let isQuitting = false
let unsavedCount = 0
// Force the exit if the renderer never replies app:quitNow to a clean-quit flush.
const FLUSH_QUIT_FALLBACK_MS = 2000
let recentStore: RecentFilesStore | null = null
let settingsStore: SettingsStore | null = null

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

// Non-blocking, load-safe main→renderer toast. NEVER use a modal (dialog.showErrorBox)
// for startup diagnostics: a modal blocks the process and freezes the whole app — and
// every smoke test — whenever it fires (e.g. the global hotkey is already held by another
// instance/app). Queue until the renderer has loaded if it hasn't yet.
function notifyRenderer(msg: string): void {
  const wc = mainWindow?.webContents
  if (!wc) return
  if (wc.isLoading()) wc.once('did-finish-load', () => wc.send('app:notify', msg))
  else wc.send('app:notify', msg)
}

function fileArgFrom(argv: string[]): string | null {
  // Packaged: argv = [exe, ...args]. Unpackaged (dev/electron <script>): argv = [electronExe, entryScript, ...args].
  const args = app.isPackaged ? argv.slice(1) : argv.slice(2)
  const candidate = args.reverse().find(a => !a.startsWith('-') && /[\\/.]/.test(a))
  return candidate ?? null
}

function requestQuit(): void {
  if (!mainWindow) { isQuitting = true; app.quit(); return }
  if (unsavedCount === 0) {
    // Clean quit: nothing to save, but the renderer may still hold debounced
    // clipboard/session writes (≤500ms). Ask it to flush them, then it replies
    // app:quitNow. A short fallback still guarantees the exit if the renderer wedges.
    mainWindow.webContents.send('app:flushAndQuit')
    setTimeout(() => { isQuitting = true; app.quit() }, FLUSH_QUIT_FALLBACK_MS)
    return
  }
  const choice = dialog.showMessageBoxSync(mainWindow, {
    type: 'warning', buttons: ['Save', "Don't Save", 'Cancel'], defaultId: 0, cancelId: 2,
    message: `You have unsaved changes in ${unsavedCount} tab${unsavedCount === 1 ? '' : 's'}.`,
    detail: 'Save before quitting?'
  })
  if (choice === 2) return                                    // Cancel
  if (choice === 1) { isQuitting = true; app.quit(); return } // Don't Save
  // Save → renderer saves each unsaved buffer (untitled via Save-As) then sends
  // app:quitNow. No force-timer here: a Save-As dialog is user-paced, and if the
  // user cancels it the renderer aborts the quit. "Don't Save" is the guaranteed exit.
  mainWindow.webContents.send('app:saveAllAndQuit')
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
    // Live window icon = the contrast-aware {&} glyph (taskbar button + title bar). The
    // static exe/installer icon stays build/icon.ico (the dark tile). Swapped on theme
    // change below.
    icon: glyphImage(),
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
  // Ctrl+Q is owned solely by the File ▸ Exit menu accelerator (CmdOrCtrl+Q).
  // No before-input-event handler here — it would double-fire requestQuit (the
  // event fires on both keyDown and keyUp, and again via the menu accelerator).
  return win
}

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', (_e, argv) => {
    const f = fileArgFrom(argv)
    // Resting state is hidden-to-tray; restore()/focus() don't show a hidden window.
    // showWindow() does (and recreates the window if it was closed), so the opened
    // file is never delivered to an invisible window.
    showWindow()
    if (f) mainWindow?.webContents.send('open-file', f)
  })

  app.whenReady().then(async () => {
    // Construct the shared stores ONCE here and hand them to the IPC layer, so the menu
    // (Clear Recent, startup hotkey read) and the renderer use the same instances — a
    // single serialized write chain each, instead of two racing copies.
    recentStore = new RecentFilesStore(app.getPath('userData'))
    settingsStore = new SettingsStore(app.getPath('userData'))
    registerIpc({
      baseDir: app.getPath('userData'),
      settings: settingsStore,
      recent: recentStore,
      getWindow: () => mainWindow,
      setContextMenu: (enabled) => setContextMenu(enabled, app.getPath('exe')),
      onDirtyCount: (n) => { unsavedCount = n },
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
    const settings = await settingsStore.load()
    const hotkey = settings.globalHotkey || 'CommandOrControl+Shift+Space'
    // Keep the live window/taskbar glyph contrasting when the taskbar theme flips.
    nativeTheme.on('updated', () => mainWindow?.setIcon(glyphImage()))

    // Skip the OS-level global hotkey under automated smoke (NC_HEADLESS) — it's a
    // singleton, can't be automated, and a machine already holding it would inject a
    // conflict toast into unrelated tests. Real dev/packaged runs always register it.
    if (!process.env.NC_HEADLESS) {
      const ok = globalShortcut.register(hotkey, toggleWindow)
      if (!ok) {
        // Non-blocking: another app/instance already holds the hotkey. Degrade
        // gracefully with a toast instead of a modal — a blocking dialog here froze
        // startup (and every second-instance smoke test). See notifyRenderer.
        console.error('global hotkey registration failed:', hotkey)
        notifyRenderer(`Summon hotkey "${hotkey}" is unavailable — another app may be using it. You can change it in Settings.`)
      }
    }

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) mainWindow = createWindow()
    })
  })

  app.on('before-quit', () => { isQuitting = true })
  app.on('will-quit', () => { globalShortcut.unregisterAll(); tray?.destroy(); tray = null })
}

app.on('window-all-closed', () => {
  // Intentionally do nothing on Windows: the app lives in the tray after the
  // window is hidden. Quit only happens via the tray menu / before-quit.
  if (process.platform === 'darwin') { /* keep mac default */ }
})
