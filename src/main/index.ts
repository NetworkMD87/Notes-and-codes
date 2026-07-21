import { app, BrowserWindow, dialog, globalShortcut, nativeTheme, Tray } from 'electron'
import { join } from 'node:path'
import { existsSync } from 'node:fs'
import { pickFileArg } from './fileArg'
import { shouldStartHidden } from './startupFlags'
import { registerIpc } from './ipc'
import { setContextMenu } from './contextMenu'
import { createTray } from './tray'
import { glyphImage } from './themeIcon'
import { buildMenu } from './menu'
import { RecentFilesStore } from './recentFilesStore'
import { SettingsStore } from './settingsStore'
import type { HotkeyResult } from '../shared/types'

let mainWindow: BrowserWindow | null = null
let pendingFile: string | null = null
let tray: Tray | null = null
let isQuitting = false
let unsavedCount = 0
// Force the exit if the renderer never replies app:quitNow to a clean-quit flush.
const FLUSH_QUIT_FALLBACK_MS = 2000
let recentStore: RecentFilesStore | null = null
let settingsStore: SettingsStore | null = null
// Tracks whatever accelerator is actually bound right now (or '' if none), so applyHotkey()
// knows what to unregister/restore. Kept independent of settings.globalHotkey — that's the
// persisted intent, this is the live OS-level state.
let activeHotkey = ''

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
  return pickFileArg(argv, app.isPackaged, existsSync)
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
  // The window must be visible before this send: the renderer may raise a themed
  // confirm (the on-save overwrite guard) or a Save-As dialog, and a DOM modal
  // rendered inside a hidden window (the app's normal tray-parked state) would hang
  // the quit with no way to answer it — unlike the old native-only Save-As path,
  // which stayed visible regardless of window state.
  showWindow()
  mainWindow.webContents.send('app:saveAllAndQuit')
}

// Windows startup entry. MUST stay gated on app.isPackaged: in dev, process.execPath is
// Electron's own binary, so an ungated write would register a real HKCU\...\Run entry that
// launches a bare Electron at every boot of the developer's machine. The renderer still
// persists the setting either way, so the checkbox behaves normally in dev — it just has
// no OS effect until the app is installed.
function setLoginItem(enabled: boolean): void {
  if (!app.isPackaged) {
    notifyRenderer('Launch on login applies to the installed app, not a dev run.')
    return
  }
  app.setLoginItemSettings({ openAtLogin: enabled, args: ['--hidden'] })
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

/**
 * Bind `accel` as the summon hotkey, test-then-commit.
 *
 * Registering IS the test — there is no way to ask Windows whether a combo is free without
 * taking it, and our own live binding would falsely conflict. So: drop the current one, try
 * the new one, and put the old one back if the new one won't take. Settings are written only
 * on success, so they can never hold a combo that doesn't work.
 *
 * Under NC_HEADLESS the OS-level bind is skipped entirely (smoke runs on a real desktop; a
 * test that seizes a global hotkey mid-run is intrusive and flaky) but the persist and the
 * result shape stay real, so the renderer plumbing is still covered.
 */
async function applyHotkey(accel: string): Promise<HotkeyResult> {
  const previous = activeHotkey

  if (process.env.NC_HEADLESS) {
    activeHotkey = accel
    await settingsStore?.update({ globalHotkey: accel })
    return { ok: true, active: accel }
  }

  if (previous) globalShortcut.unregister(previous)

  if (accel === '') {                       // cleared on purpose — no hotkey at all
    activeHotkey = ''
    await settingsStore?.update({ globalHotkey: '' })
    return { ok: true, active: '' }
  }

  let bound = false
  try { bound = globalShortcut.register(accel, toggleWindow) }
  catch { bound = false }                   // Electron throws on a malformed accelerator

  if (bound) {
    activeHotkey = accel
    await settingsStore?.update({ globalHotkey: accel })
    return { ok: true, active: accel }
  }

  // Failed to take the new one — put the old one back. If THAT also fails (something
  // grabbed it in between) we end with no hotkey; report it honestly and leave settings
  // on the old value so the next launch retries.
  let restored = false
  if (previous) {
    try { restored = globalShortcut.register(previous, toggleWindow) }
    catch { restored = false }
  }
  activeHotkey = restored ? previous : ''
  return { ok: false, active: activeHotkey }
}

function createWindow(hidden = false): BrowserWindow {
  const win = new BrowserWindow({
    width: 1100,
    height: 720,
    title: 'Notes & Codes',
    backgroundColor: '#1e1e1e',
    // Launch-on-login starts parked in the tray; the renderer still loads fully behind the
    // hidden window, so the first summon is instant instead of a cold start.
    show: !hidden,
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
  // Renderer-side widgets that only make sense while this window can receive keystrokes
  // (the Settings hotkey recorder) need to know the moment that stops being true. Electron's
  // 'blur' fires whenever the window loses OS focus — hide-to-tray, the summon hotkey
  // (globalShortcut, main-process-only — a renderer preventDefault() can't intercept it),
  // minimise, and alt-tab all take this one path, so it's a single uniform signal rather than
  // one case per trigger. Verified this actually fires on a real hide(): the renderer's own
  // DOM `blur`/`visibilitychange` do NOT reliably fire under Playwright/CDP automation (the
  // page stays reporting focused/visible even once BrowserWindow.isVisible() is false), so
  // this main-process event is what both production and the smoke test can depend on.
  win.on('blur', () => win.webContents.send('window:blur'))
  return win
}

// Must match `appId` in electron-builder.yml, which stamps the same AppUserModelID onto
// the installed shortcut. If the running process declares a different one, Windows treats
// shortcut and window as separate apps — that's how a pinned entry ends up showing the
// wrong icon. Set before any window exists.
app.setAppUserModelId('com.notesandcodes.app')

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
      setLoginItem: (enabled) => setLoginItem(enabled),
      setGlobalHotkey: (accel) => applyHotkey(accel),
      onDirtyCount: (n) => { unsavedCount = n },
      onQuitNow: () => { isQuitting = true; app.quit() },
      onRecentChanged: () => { void rebuildMenu() }
    })
    pendingFile = fileArgFrom(process.argv)

    // Load settings AND run the login-item drift reconcile before the window (and thus the
    // renderer's boot()->loadSettings() IPC round trip) exists. SettingsStore.load() is a raw
    // fs.readFile that does NOT join the chain serialization save()/update() use — so a
    // renderer read racing an in-flight reconcile write could still observe the stale
    // pre-reconcile value. Awaiting both here, before createWindow(), removes that race
    // entirely rather than relying on timing.
    const settings = await settingsStore.load()
    // Windows Task Manager ▸ Startup lets the user disable our entry behind our back.
    // The OS is the truth; reconcile so the Settings checkbox can't lie. Packaged only —
    // in dev the login item is never written, so getLoginItemSettings would always
    // report false and would clobber a setting the user just ticked.
    if (app.isPackaged) {
      const real = app.getLoginItemSettings().openAtLogin
      if (real !== settings.openAtLogin) {
        settings.openAtLogin = real
        await settingsStore.update({ openAtLogin: real })
      }
    }

    mainWindow = createWindow(shouldStartHidden(process.argv, pendingFile !== null))
    void rebuildMenu()
    mainWindow.webContents.on('did-finish-load', () => {
      if (pendingFile) mainWindow!.webContents.send('open-file', pendingFile)
    })

    tray = createTray({ onShow: showWindow, onQuit: () => { requestQuit() } })
    // Re-apply the context-menu registration on every packaged startup, not just when the
    // user toggles it — the registry write is idempotent (reg add /f overwrites) and
    // self-healing (it also repairs a stale exe path after a reinstall elsewhere), so this
    // is how an existing user who already enabled the feature picks up new registry values
    // (e.g. the Icon value) without re-toggling the setting. MUST stay gated on
    // app.isPackaged: in dev, app.getPath('exe') is Electron's own binary, and an ungated
    // re-apply would silently rewrite the user's real installed registry entry to point at
    // electron.exe.
    if (app.isPackaged && settings.contextMenuEnabled) {
      void setContextMenu(true, app.getPath('exe'))
    }
    // '' means the user deliberately cleared the hotkey — DON'T fall back to the default
    // (a `||` here would silently re-bind it on every restart). undefined/null means a
    // settings file written before the field existed, which does take the default.
    const hotkey = settings.globalHotkey ?? 'CommandOrControl+Shift+Space'
    // Keep the live window/taskbar glyph contrasting when the taskbar theme flips.
    nativeTheme.on('updated', () => mainWindow?.setIcon(glyphImage()))

    // Skip the OS-level global hotkey under automated smoke (NC_HEADLESS) — it's a
    // singleton, can't be automated, and a machine already holding it would inject a
    // conflict toast into unrelated tests. Real dev/packaged runs always register it.
    if (!process.env.NC_HEADLESS && hotkey) {
      // globalShortcut.register throws on a malformed accelerator string — and
      // settings.json is user-editable (and, as of this branch, written from a recorded
      // keystroke), so a bad value here is reachable. An uncaught throw inside this async
      // whenReady callback would be an unhandled rejection with no .catch(), which can take
      // the whole main process down. Treat a throw exactly like a failed bind: degrade,
      // never crash — same as the corrupt-safe load() contract every store follows.
      let ok = false
      let malformed = false
      try { ok = globalShortcut.register(hotkey, toggleWindow) }
      catch { malformed = true }
      if (ok) {
        activeHotkey = hotkey
      } else {
        // activeHotkey must describe reality: no binding was made, so it stays ''
        // (never claim `hotkey` is active when register() failed or threw).
        activeHotkey = ''
        // Non-blocking: never a modal (dialog.showErrorBox) here — one froze startup
        // and every smoke test the last time this path grew a blocking call. See
        // notifyRenderer. Two different problems get two different messages: a conflict
        // is fixed by picking a different combo, a malformed value means settings.json
        // itself holds something unusable and needs to be reset, not just changed.
        console.error('global hotkey registration failed:', hotkey)
        notifyRenderer(malformed
          ? `Summon hotkey "${hotkey}" in your settings isn't a valid shortcut, so no hotkey is active. Set a new one in Settings ▸ Startup.`
          : `Summon hotkey "${hotkey}" is unavailable — another app may be using it. You can change it in Settings ▸ Startup.`)
      }
    } else if (process.env.NC_HEADLESS) {
      activeHotkey = hotkey
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
