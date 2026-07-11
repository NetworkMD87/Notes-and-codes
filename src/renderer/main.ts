import './monacoEnv'
import '@fontsource/jetbrains-mono/400.css'
import '@fontsource/jetbrains-mono/700.css'
import '@fontsource/fira-code/400.css'
import '@fontsource/ibm-plex-mono/400.css'
import '@fontsource/ibm-plex-mono/700.css'
import { installMenuCommands } from './menuCommands'
import type { Api, Encoding } from '../shared/types'
import { languageFromPath } from '../shared/language'
import { BufferManager } from './bufferManager'
import { TabBar } from './tabBar'
import { SplitView } from './splitView'
import { ThemeController } from './theme'
import { CommandPalette } from './commandPalette'
import { StatusBar } from './statusBar'
import { DiffView } from './diffView'
import { DiffPicker } from './diffPicker'
import { toast } from './notify'
import { registerCommands } from './commands'
import { migrateThemeId } from './themes'
import { MarkdownPreview } from './markdownPreview'
import { PasteHistoryList } from './pasteHistory'
import { PasteHistoryPicker } from './pasteHistoryPicker'
import { installDropOpen } from './dropOpen'
import { Toolbar } from './toolbar'
import { SnippetList } from './snippets'
import { SnippetPicker } from './snippetPicker'
import { SnippetManager } from './snippetManager'
import { promptInput, confirmDialog } from './inputOverlay'
import { AppearancePanel } from './appearancePanel'
import { FileHistoryPanel } from './fileHistoryPanel'
import { FolderMode } from './folderMode'
import { buildExportHtml, suggestExportName, type ExportFormat } from './exportDoc'
import { AutoSaveController, eligibleForAutosave } from './autoSaveController'
import { formatText, isFormattable } from './formatter'
import { HighlightManager } from './highlightManager'
import { clampToLength } from './highlights'
import { HelpOverlay } from './helpOverlay'
import { uiFontStack } from './uiFont'
import type { Highlight, HighlightColour } from '../shared/types'
declare global { interface Window { api: Api } }

const manager = new BufferManager(() => crypto.randomUUID())
const view = new SplitView(document.getElementById('paneA')!, document.getElementById('paneB')!)
const highlights = new HighlightManager()
const hlLoaded = new Set<string>()
const ENC_LABEL: Record<Encoding, string> = { utf8: 'UTF-8', utf8bom: 'UTF-8-BOM', utf16le: 'UTF-16 LE', utf16be: 'UTF-16 BE' }
const statusBar = new StatusBar(document.getElementById('statusbar')!, {
  onEol: (eol) => { const id = paneFor(view.focusedPane()).currentBufferId(); const b = id && manager.get(id); if (b) { b.eol = eol; b.dirty = true; refreshStatus(); tabBar.render(manager.list(), manager.activeId); scheduleSessionSave(); toast('Line endings: ' + eol) } },
  onEncoding: (enc) => { const id = paneFor(view.focusedPane()).currentBufferId(); const b = id && manager.get(id); if (b) { b.encoding = enc; b.dirty = true; refreshStatus(); tabBar.render(manager.list(), manager.activeId); scheduleSessionSave(); toast('Encoding: ' + ENC_LABEL[enc]) } }
})
const diff = new DiffView(document.getElementById('diff')!)
const diffPicker = new DiffPicker(document.getElementById('app')!)
const phPicker = new PasteHistoryPicker(document.getElementById('app')!)
const mdPreview = new MarkdownPreview(document.getElementById('mdpreview')!, () => { view.paneA.layout(); view.paneB.layout() })

function previewContent(): string { return paneFor(view.focusedPane()).getContent() }
function refreshPreview(): void { mdPreview.update(previewContent()) }

const theme = new ThemeController([view.paneA, view.paneB], (themeId, accent) => {
  window.api.loadSettings().then(s => window.api.saveSettings({ ...s, themeId, accent }))
})
const themeBtn = document.createElement('button')
themeBtn.id = 'theme-toggle'; themeBtn.textContent = '◐'; themeBtn.title = 'Theme'
document.getElementById('header')!.appendChild(themeBtn)

function paneFor(which: 'A' | 'B') { return which === 'A' ? view.paneA : view.paneB }

function applyHighlightsToPanes(bufferId: string, hs: Highlight[]): void {
  for (const which of ['A', 'B'] as const) {
    if (paneFor(which).currentBufferId() === bufferId) paneFor(which).setHighlights(hs)
  }
}
const hlSaveTimers = new Map<string, number>()
function scheduleHighlightSave(bufferId: string): void {
  clearTimeout(hlSaveTimers.get(bufferId))
  hlSaveTimers.set(bufferId, setTimeout(() => { persistHighlights(bufferId); hlSaveTimers.delete(bufferId) }, 600) as unknown as number)
}
function persistHighlights(bufferId: string): Promise<void> | void {
  const b = manager.get(bufferId); if (!b) return
  const hs = highlights.get(bufferId)
  if (b.filePath) return window.api.saveHighlights(b.filePath, hs)
  b.highlights = hs; scheduleSessionSave()
}
/** Flush a buffer's pending debounced highlight save immediately (cancels the timer first). */
function flushHighlightSave(bufferId: string): Promise<void> | void {
  clearTimeout(hlSaveTimers.get(bufferId)); hlSaveTimers.delete(bufferId)
  return persistHighlights(bufferId)
}
async function loadHighlightsFor(b: { id: string; filePath: string | null; content: string; highlights?: Highlight[] }): Promise<void> {
  if (hlLoaded.has(b.id)) return
  hlLoaded.add(b.id)
  try {
    let hs = b.filePath ? await window.api.loadHighlights(b.filePath) : (b.highlights ?? [])
    hs = clampToLength(hs, b.content.length)
    highlights.load(b.id, hs)
    applyHighlightsToPanes(b.id, hs)
  } catch {
    hlLoaded.delete(b.id) // allow retry on next showActive
  }
}

const pasteHistory = new PasteHistoryList()
let clipSaveTimer: number | undefined
function persistClipHistory(): void {
  clearTimeout(clipSaveTimer)
  clipSaveTimer = setTimeout(() => window.api.saveClipboardHistory(pasteHistory.entries()), 500) as unknown as number
}
function captureClip(text: string): void { pasteHistory.add(text); persistClipHistory() }
for (const which of ['A', 'B'] as const) {
  paneFor(which).onPaste(captureClip)
  paneFor(which).onCopyCut(captureClip)
}

function reportDirty(): void {
  // Count ALL unsaved buffers (named + untitled) so quit warns about any unsaved work.
  window.api.setDirtyCount(manager.list().filter(b => b.dirty).length)
}

function refreshStatus(): void {
  const id = paneFor(view.focusedPane()).currentBufferId() ?? manager.activeId!
  const b = manager.get(id)!
  statusBar.update({ language: b.language, eol: b.eol, encoding: b.encoding, cursor: paneFor(view.focusedPane()).getCursor(), dirty: b.dirty })
  reportDirty()
}

async function closeTab(id: string): Promise<void> {
  const b = manager.get(id)
  if (b && b.dirty && (b.filePath || /\S/.test(b.content))) {
    // Unsaved edits — a named file (drops from disk) or an untitled scratch buffer
    // (never hits file history, so it's unrecoverable). Warn before discarding either.
    const ok = await confirmDialog(`"${b.title}" has unsaved changes. Discard and close?`, 'Discard')
    if (!ok) return
  }
  const wasLast = manager.list().length === 1
  void flushHighlightSave(id) // persist a just-painted highlight before the buffer is gone
  manager.close(id)
  if (manager.list().length === 0) manager.create()
  showActive(); scheduleSessionSave()
  view.paneA.forgetBuffer(id); view.paneB.forgetBuffer(id)
  highlights.forget(id); hlLoaded.delete(id)
  if (wasLast) window.api.hideWindow()
}

const tabBar = new TabBar(document.getElementById('tabbar')!, {
  onSelect: (id) => { manager.setActive(id); showActive(); scheduleSessionSave() },
  onClose: (id) => void closeTab(id),
  onNew: () => { manager.create(); showActive(); scheduleSessionSave() },
  onReorder: (id, toIndex) => { manager.move(id, toIndex); tabBar.render(manager.list(), manager.activeId); scheduleSessionSave() }
})

function showActive(): void {
  const active = manager.get(manager.activeId!)!
  paneFor(view.focusedPane()).setBuffer(active)
  applyHighlightsToPanes(active.id, highlights.get(active.id))
  void loadHighlightsFor(active)
  tabBar.render(manager.list(), manager.activeId)
  refreshStatus()
  refreshPreview()
  refreshToolbar()
  syncWatch()
  autosave.flushNow()
}

for (const which of ['A', 'B'] as const) paneFor(which).onCursor(() => refreshStatus())

for (const which of ['A', 'B'] as const) {
  paneFor(which).onHighlightPaint(range => {
    const id = paneFor(which).currentBufferId(); if (!id) return
    const hs = highlights.paint(id, range)
    applyHighlightsToPanes(id, hs)
    scheduleHighlightSave(id)
  })
}

for (const which of ['A', 'B'] as const) {
  paneFor(which).onChange(c => {
    const id = paneFor(which).currentBufferId()
    if (!id) return
    manager.update(id, c)
    if (highlights.get(id).length) {
      highlights.sync(id, paneFor(which).readHighlights())
      scheduleHighlightSave(id)
    }
    tabBar.render(manager.list(), manager.activeId)
    refreshStatus()
    scheduleSessionSave()
    autosave.noteEdit()
    refreshPreview()
  })
}

let autoSave = true
let autoSaveToDisk = false
let formatOnSave = false
const conflicts = new Set<string>()
const selfWrites = new Map<string, number>()
const autosaveFailed = new Set<string>()
const SELF_WRITE_WINDOW_MS = 2500
let saveTimer: number | undefined
let sessionSaveFailed = false
let alwaysOnTop = false
let fontSize = 14
function applyFontSize(): void { view.paneA.setFontSize(fontSize); view.paneB.setFontSize(fontSize) }
function persistFontSize(): void { window.api.loadSettings().then(s => window.api.saveSettings({ ...s, fontSize })) }
function zoomBy(delta: number): void { fontSize = Math.min(40, Math.max(6, fontSize + delta)); applyFontSize(); persistFontSize() }
function zoomReset(): void { fontSize = 14; applyFontSize(); persistFontSize() }

let fontFamily = 'JetBrains Mono'
let fontLigatures = true
let showAllFiles = false
let restoreFolder = true
function fontStack(name: string): string { return `'${name}', Consolas, monospace` }
function applyFont(): void {
  view.paneA.setFontFamily(fontStack(fontFamily)); view.paneB.setFontFamily(fontStack(fontFamily))
  view.paneA.setLigatures(fontLigatures); view.paneB.setLigatures(fontLigatures)
}
function persistFont(): void { window.api.loadSettings().then(s => window.api.saveSettings({ ...s, fontFamily, fontLigatures })) }

function setFontFamilyState(name: string): void { fontFamily = name; applyFont(); persistFont() }
function setLigaturesState(on: boolean): void { fontLigatures = on; applyFont(); persistFont() }
function setFontSizeState(px: number): void { fontSize = Math.min(40, Math.max(6, px)); applyFontSize(); persistFontSize() }

let uiFontFamily = 'System'
function applyUiFont(): void { document.body.style.setProperty('--ui-font', uiFontStack(uiFontFamily)) }
function persistUiFont(): void { window.api.loadSettings().then(s => window.api.saveSettings({ ...s, uiFontFamily })) }
function setUiFontFamilyState(name: string): void { uiFontFamily = name; applyUiFont(); persistUiFont() }

async function setAlwaysOnTop(on: boolean): Promise<void> {
  alwaysOnTop = on
  await window.api.setAlwaysOnTop(on)
  const s = await window.api.loadSettings(); await window.api.saveSettings({ ...s, alwaysOnTop: on })
  refreshToolbar()
}
const toggleAlwaysOnTop = () => setAlwaysOnTop(!alwaysOnTop)

function scheduleSessionSave(): void {
  if (!autoSave) return
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    window.api.saveSession(manager.toSession())
      .then(() => { sessionSaveFailed = false })
      .catch(err => {
        console.error('session save failed', err)
        if (!sessionSaveFailed) { sessionSaveFailed = true; toast('Session save failed — check disk space / permissions.') }
      })
  }, 500) as unknown as number
}

async function boot(): Promise<void> {
  if (!window.api) {
    document.body.textContent = 'Failed to initialize: the preload bridge did not load.'
    return
  }
  const settings = await window.api.loadSettings()
  autoSave = settings.autoSaveSession
  autoSaveToDisk = settings.autoSaveToDisk
  formatOnSave = settings.formatOnSave
  theme.apply(migrateThemeId(settings), settings.accent ?? null)
  fontFamily = settings.fontFamily ?? 'JetBrains Mono'
  uiFontFamily = settings.uiFontFamily ?? 'System'
  fontLigatures = settings.fontLigatures ?? true
  showAllFiles = settings.showAllFiles
  restoreFolder = settings.restoreFolderOnLaunch
  applyFont()
  applyUiFont()
  fontSize = settings.fontSize ?? 14; applyFontSize()
  alwaysOnTop = settings.alwaysOnTop; await window.api.setAlwaysOnTop(alwaysOnTop)
  pasteHistory.load(await window.api.loadClipboardHistory())
  snippets.load(await window.api.loadSnippets())
  const session = await window.api.loadSession()
  if (session.buffers.length > 0) manager.restore(session)
  else manager.create()
  if (!manager.activeId) manager.setActive(manager.list()[0].id)
  showActive()
  reportDirty()
  await folder.restore()
}

window.api.onSaveAllAndQuit(async () => {
  // Save every unsaved buffer (named in place, untitled via Save-As). If a Save-As
  // is cancelled or a write fails, abort the quit (stay open) — "Don't Save" remains
  // the guaranteed quit path, so we never trap the user.
  try {
    for (const b of manager.list()) {
      if (b.dirty) {
        const ok = await saveBuffer(b.id)
        if (!ok) { tabBar.render(manager.list(), manager.activeId); refreshStatus(); return }
      }
    }
  } catch (err) {
    console.error('save-on-quit failed', err)
    toast('Could not save — quit cancelled.')
    tabBar.render(manager.list(), manager.activeId); refreshStatus()
    return
  }
  tabBar.render(manager.list(), manager.activeId); refreshStatus()
  await flushPendingWritesBeforeQuit()
  window.api.quitNow()
})

// A clean quit (no unsaved tabs) skips the save handshake above, so main asks us to
// flush the same debounced writes before it exits — otherwise the last ~500ms of
// clipboard/session state is lost (audit R1 / v1.7 I8 residual).
window.api.onFlushAndQuit(async () => {
  await flushPendingWritesBeforeQuit()
  window.api.quitNow()
})

// Flush every pending debounced write (highlights + clipboard history + session) so
// none of the last ~500ms is lost on quit. Shared by the save-then-quit and the
// clean-quit paths. Never throws — a failed flush must not trap the quit.
async function flushPendingWritesBeforeQuit(): Promise<void> {
  clearTimeout(clipSaveTimer); clearTimeout(saveTimer)   // sync — can't throw
  try {
    await Promise.all([...hlSaveTimers.keys()].map(id => flushHighlightSave(id) ?? Promise.resolve()))
    await window.api.saveClipboardHistory(pasteHistory.entries())
    await window.api.saveSession(manager.toSession())
  } catch (err) {
    console.error('final flush before quit failed', err)
  }
}

interface SaveOpts { snapshot: boolean; recent: boolean; allowDialog: boolean; format: boolean; forceDialog: boolean }
const MANUAL_SAVE: SaveOpts = { snapshot: true, recent: true, allowDialog: true, format: true, forceDialog: false }

async function saveBuffer(id: string, opts: SaveOpts = MANUAL_SAVE): Promise<boolean> {
  const b = manager.get(id); if (!b) return false
  const pane = view.paneA.currentBufferId() === id ? view.paneA
    : view.paneB.currentBufferId() === id ? view.paneB : null
  if (opts.format && formatOnSave && isFormattable(b.language)) {
    if (pane) await pane.formatDocument()
    else {
      try { manager.update(id, await formatText(b.content, b.language)) }
      catch { /* leave unformatted — never block a save */ }
    }
  }
  const content = pane ? pane.getContent() : b.content
  const oldLang = b.language
  let path = b.filePath
  if (!path || opts.forceDialog) {
    if (!opts.allowDialog) return false
    path = await window.api.saveAsDialog(); if (!path) return false
  }
  await window.api.writeFile(path, content, b.eol, b.encoding)
  selfWrites.set(path, Date.now())
  if (opts.snapshot) window.api.snapshotHistory(path, content, b.eol, b.encoding)
  manager.markSaved(id, path)
  await window.api.saveHighlights(path, highlights.get(id))
  manager.get(id)!.highlights = undefined
  conflicts.delete(id)
  if (opts.recent) window.api.addRecentFile(path)
  if (pane && manager.get(id)!.language !== oldLang) pane.refreshBuffer(manager.get(id)!)
  syncWatch()
  return true
}
async function saveActive(): Promise<void> {
  const id = paneFor(view.focusedPane()).currentBufferId(); if (!id) return
  try {
    await saveBuffer(id)
  } catch (err) {
    console.error('save failed', err)
    toast('Save failed — check disk space / permissions.')
  }
  tabBar.render(manager.list(), manager.activeId); refreshStatus()
}
async function saveAll(): Promise<void> {
  let saved = 0, failed = 0
  for (const b of manager.list()) {
    if (b.dirty) {
      try { if (await saveBuffer(b.id)) saved++ }
      catch (err) { console.error('save failed', b.title, err); failed++ }
    }
  }
  tabBar.render(manager.list(), manager.activeId); refreshStatus()
  if (failed) toast(`Saved ${saved} file${saved === 1 ? '' : 's'}, ${failed} failed.`)
  else toast(saved ? `Saved ${saved} file${saved === 1 ? '' : 's'}.` : 'Nothing to save.')
}

function autosaveFlush(): void {
  for (const id of eligibleForAutosave(manager.list(), conflicts)) {
    saveBuffer(id, { snapshot: false, recent: false, allowDialog: false, format: false, forceDialog: false })
      .then(ok => { if (ok) { autosaveFailed.delete(id); tabBar.render(manager.list(), manager.activeId); refreshStatus() } })
      .catch(() => {
        // Leave the buffer dirty (markSaved was never reached). Toast once per failure streak.
        if (!autosaveFailed.has(id)) {
          autosaveFailed.add(id)
          toast(`Auto-save failed for "${manager.get(id)?.title ?? 'file'}" — save manually.`)
        }
      })
  }
}
const autosave = new AutoSaveController({ enabled: () => autoSaveToDisk, delayMs: 1500, flush: autosaveFlush })

function setAutoSaveToDisk(on: boolean): void {
  autoSaveToDisk = on
  void window.api.loadSettings().then(s => window.api.saveSettings({ ...s, autoSaveToDisk: on }))
  if (on) autosave.flushNow(); else autosave.cancel()
}
function toggleAutoSaveToDisk(): void {
  setAutoSaveToDisk(!autoSaveToDisk)
  toast(`Auto-save to disk: ${autoSaveToDisk ? 'on' : 'off'}`)
}
function toggleFormatOnSave(): void {
  formatOnSave = !formatOnSave
  void window.api.loadSettings().then(s => window.api.saveSettings({ ...s, formatOnSave }))
  toast(`Format on save: ${formatOnSave ? 'on' : 'off'}`)
}

window.addEventListener('blur', () => autosave.flushNow())
document.addEventListener('visibilitychange', () => { if (document.hidden) autosave.flushNow() })

async function openFromDisk(): Promise<void> {
  const path = await window.api.openDialog(); if (!path) return
  const file = await window.api.readFile(path)
  manager.open(file); showActive()
  await window.api.addRecentFile(path)
}

async function diffClipboard(): Promise<void> {
  const pane = paneFor(view.focusedPane())
  const id = pane.currentBufferId(); if (!id) return
  const b = manager.get(id)!
  const clip = await window.api.clipboardRead()
  if (!clip) { toast('Clipboard is empty.'); return }
  diff.show(
    { title: b.title, content: pane.getContent(), language: b.language },
    { title: 'Clipboard', content: clip, language: b.language }
  )
}

async function diffFiles(): Promise<void> {
  const a = await window.api.openDialog(); if (!a) return
  const bPath = await window.api.openDialog(); if (!bPath) return
  const [fa, fb] = await Promise.all([window.api.readFile(a), window.api.readFile(bPath)])
  diff.show(
    { title: a.split(/[\\/]/).pop() ?? a, content: fa.content, language: languageFromPath(a) },
    { title: bPath.split(/[\\/]/).pop() ?? bPath, content: fb.content, language: languageFromPath(bPath) }
  )
}

function startDiff(): void {
  const buffers = manager.list()
  if (buffers.length < 2) { toast('Open at least two tabs to diff.'); return }
  diffPicker.open(buffers, (leftId, rightId) => {
    const L = manager.get(leftId), R = manager.get(rightId)
    if (!L || !R) return
    diff.show(
      { title: L.title, content: L.content, language: L.language },
      { title: R.title, content: R.content, language: R.language }
    )
  })
}

const togglePreview = () => { mdPreview.toggle(); refreshPreview(); refreshToolbar() }

async function exportActive(format: ExportFormat): Promise<void> {
  const content = paneFor(view.focusedPane()).getContent()
  if (!content.trim()) { toast('Nothing to export.'); return }
  const id = paneFor(view.focusedPane()).currentBufferId()
  const b = id ? manager.get(id) : null
  const title = b?.title ?? 'untitled'
  const sourcePath = b?.filePath ?? null
  const suggested = suggestExportName(sourcePath, title, format)
  const html = buildExportHtml(content, title)
  const r = format === 'html'
    ? await window.api.exportHtml(html, suggested, sourcePath)
    : await window.api.exportPdf(html, suggested, sourcePath)
  const savedName = r.path ? r.path.replace(/^.*[\\/]/, '') : suggested
  if (r.ok && !r.canceled) toast(`Exported ${savedName}.`)
  else if (!r.ok) toast('Export failed.')
}
const exportHtml = () => void exportActive('html')
const exportPdf = () => void exportActive('pdf')

const pasteFromHistory = () => phPicker.open(pasteHistory.entries(), (text) => { paneFor(view.focusedPane()).insertAtCursor(text) })
const clearPasteHistory = () => { pasteHistory.clear(); persistClipHistory(); toast('Paste history cleared.') }

function toggleHighlighter(): void {
  const on = highlights.toggleMode()
  view.paneA.setHighlighterMode(on); view.paneB.setHighlighterMode(on)
  toolbar.syncHighlighter(on, highlights.colour())
  toast(`Highlighter: ${on ? 'on' : 'off'}`)
}
function setHighlightColour(c: HighlightColour): void {
  highlights.setColour(c)
  if (!highlights.isOn()) { toggleHighlighter(); return }
  toolbar.syncHighlighter(true, c)
}
function clearHighlights(): void {
  const id = paneFor(view.focusedPane()).currentBufferId(); if (!id) return
  const hs = highlights.clear(id)
  applyHighlightsToPanes(id, hs)
  scheduleHighlightSave(id)
  toast('Highlights cleared.')
}

const snippets = new SnippetList(() => crypto.randomUUID())
const snipPicker = new SnippetPicker(document.getElementById('app')!)
function persistSnippets(): void { window.api.saveSnippets(snippets.list()) }
const snipManager = new SnippetManager(document.getElementById('app')!, {
  list: () => snippets.list(),
  add: () => snippets.add('New snippet', ''),
  rename: (id, name) => snippets.rename(id, name),
  updateBody: (id, body) => snippets.updateBody(id, body),
  remove: (id) => snippets.remove(id),
  persist: () => persistSnippets()
})
const manageSnippets = () => snipManager.open()

async function saveSelectionAsSnippet(): Promise<void> {
  const body = paneFor(view.focusedPane()).getSelectionText()
  if (!body) { toast('Select some text first.'); return }
  const name = await promptInput('Snippet name')
  if (!name) return
  snippets.add(name, body); persistSnippets(); toast(`Saved snippet "${name}".`)
}
function insertSnippet(): void {
  snipPicker.open(snippets.list(), (s) => paneFor(view.focusedPane()).insertAtCursor(s.body))
}

const toolbar = new Toolbar(document.getElementById('header')!, {
  open: openFromDisk,
  save: saveActive,
  toggleSplit: () => { view.setSplit(!view.isSplit()); showActive() },
  togglePreview,
  togglePin: toggleAlwaysOnTop,
  startDiff,
  pasteFromHistory,
  toggleHighlighter,
  pickHighlightColour: setHighlightColour,
  clearHighlights,
})
// keep the theme toggle as the right-most element in the header
document.getElementById('header')!.appendChild(themeBtn)

const appearance = new AppearancePanel(document.getElementById('app')!, {
  currentThemeId: () => theme.currentId(), currentAccent: () => theme.currentAccent(),
  pickTheme: (id) => theme.pick(id), setAccent: (a) => theme.setAccent(a),
  fontFamily: () => fontFamily, setFontFamily: setFontFamilyState,
  fontLigatures: () => fontLigatures, setLigatures: setLigaturesState,
  uiFontFamily: () => uiFontFamily, setUiFontFamily: setUiFontFamilyState,
  fontSize: () => fontSize, setFontSize: setFontSizeState,
  showAllFiles: () => showAllFiles,
  setShowAllFiles: (on) => { showAllFiles = on; void window.api.loadSettings().then(s => window.api.saveSettings({ ...s, showAllFiles: on })) },
  restoreFolder: () => restoreFolder,
  setRestoreFolder: (on) => { restoreFolder = on; void window.api.loadSettings().then(s => window.api.saveSettings({ ...s, restoreFolderOnLaunch: on })) },
  autoSaveToDisk: () => autoSaveToDisk,
  setAutoSaveToDisk: (on) => setAutoSaveToDisk(on),
  formatOnSave: () => formatOnSave,
  setFormatOnSave: (on) => {
    formatOnSave = on
    void window.api.loadSettings().then(s => window.api.saveSettings({ ...s, formatOnSave: on }))
  },
})
const openAppearance = () => appearance.open()
themeBtn.onclick = openAppearance

const fileHistory = new FileHistoryPanel(document.getElementById('app')!, {
  current: () => {
    const id = paneFor(view.focusedPane()).currentBufferId(); if (!id) return null
    const b = manager.get(id); if (!b || !b.filePath) return null
    return { path: b.filePath, title: b.title, content: paneFor(view.focusedPane()).getContent(), language: b.language }
  },
  openDiff: (v, cur) => diff.show(
    { title: `${cur.title} — ${new Date(v.ts).toLocaleString()}`, content: v.content, language: cur.language },
    { title: `${cur.title} (current)`, content: cur.content, language: cur.language }
  ),
  restore: (v) => {
    const id = paneFor(view.focusedPane()).currentBufferId(); if (!id) return
    const b = manager.get(id); if (!b || !b.filePath) return
    window.api.snapshotHistory(b.filePath, paneFor(view.focusedPane()).getContent(), b.eol, b.encoding)
    manager.update(id, v.content)
    paneFor(view.focusedPane()).refreshBuffer(b)
    tabBar.render(manager.list(), manager.activeId); refreshStatus(); scheduleSessionSave()
    toast('Restored an earlier version — unsaved, Save to keep it.')
  }
})
const openHistory = () => void fileHistory.open()

const folder = new FolderMode({
  sidebarEl: document.getElementById('sidebar')!,
  mainEl: document.getElementById('main')!,
  openFile: (path) => void openPath(path),
  activePath: () => {
    const id = paneFor(view.focusedPane()).currentBufferId(); if (!id) return null
    return manager.get(id)?.filePath ?? null
  }
})
async function openFolderFromDialog(): Promise<void> {
  const root = await window.api.openFolderDialog(); if (!root) return
  await folder.openFolder(root)
}

function refreshToolbar(): void {
  toolbar.syncToggles({ split: view.isSplit(), preview: mdPreview.isVisible(), pin: alwaysOnTop })
}

const palette = new CommandPalette()
const helpOverlay = new HelpOverlay()
registerCommands({
  palette, manager, view, diff, paneFor, showActive, scheduleSessionSave, closeTab,
  saveActive, saveAll, openFromDisk, startDiff, diffClipboard, diffFiles,
  getAutoSave: () => autoSave, setAutoSave: (v) => { autoSave = v },
  togglePreview, pasteFromHistory, clearPasteHistory, saveSelectionAsSnippet, insertSnippet, manageSnippets,
  toggleAlwaysOnTop,
  zoomIn: () => zoomBy(1), zoomOut: () => zoomBy(-1), zoomReset,
  openAppearance,
  openHistory,
  openFolder: openFolderFromDialog,
  closeFolder: () => folder.closeFolder(),
  toggleSidebar: () => folder.toggleSidebar(),
  revealActive: () => void folder.revealActive(),
  quickOpen: () => folder.openQuickOpen(),
  toggleAutoSaveToDisk,
  exportHtml,
  exportPdf,
  formatDocument: () => void paneFor(view.focusedPane()).formatDocument(),
  formatSelection: () => void paneFor(view.focusedPane()).formatSelection(),
  toggleFormatOnSave,
  toggleHighlighter,
  clearHighlights,
  openHelp: () => helpOverlay.openShortcuts(),
  openAbout: () => helpOverlay.openAbout(),
})

window.addEventListener('keydown', (e) => {
  if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'p') { e.preventDefault(); palette.open() }
  if (e.ctrlKey && !e.shiftKey && e.key.toLowerCase() === 'p') { e.preventDefault(); folder.openQuickOpen() }
  if (e.ctrlKey && e.key === '\\') { view.setSplit(!view.isSplit()); showActive() }
  // Escape (incl. closing the diff) is handled centrally by overlayManager.
})

async function openPath(path: string): Promise<void> {
  try { const file = await window.api.readFile(path); manager.open(file); window.api.addRecentFile(path); showActive(); scheduleSessionSave() }
  catch (err) { console.error('open failed', path, err); toast(`Could not open: ${path}`) }
}

function openPaths(): string[] { return manager.list().map(b => b.filePath).filter((p): p is string => !!p) }
function syncWatch(): void { window.api.watchPaths(openPaths()) }

async function reloadBuffer(id: string): Promise<void> {
  const b = manager.get(id); if (!b || !b.filePath) return
  const file = await window.api.readFile(b.filePath)
  b.content = file.content; b.eol = file.eol; b.encoding = file.encoding; b.dirty = false
  conflicts.delete(id)
  if (paneFor(view.focusedPane()).currentBufferId() === id) paneFor(view.focusedPane()).refreshBuffer(b)
  refreshStatus(); tabBar.render(manager.list(), manager.activeId)
}
const changeBar = document.getElementById('change-bar')!
function showChangeBar(id: string, name: string): void {
  changeBar.replaceChildren()
  const msg = document.createElement('span'); msg.textContent = `"${name}" changed on disk.`
  const reload = document.createElement('button'); reload.textContent = 'Reload (discard mine)'
  reload.onclick = () => { void reloadBuffer(id); changeBar.classList.add('hidden') }
  const keep = document.createElement('button'); keep.textContent = 'Keep mine'
  keep.onclick = () => { conflicts.delete(id); changeBar.classList.add('hidden') }
  changeBar.append(msg, reload, keep); changeBar.classList.remove('hidden')
}
window.api.onFileChanged((path) => {
  // Purge self-write markers past their window so a late/never-matching watcher event
  // (slow or unwatchable filesystem) can't leave dead entries in the Map.
  const now = Date.now()
  for (const [p, t] of selfWrites) if (now - t >= SELF_WRITE_WINDOW_MS) selfWrites.delete(p)
  const ts = selfWrites.get(path)
  if (ts !== undefined && now - ts < SELF_WRITE_WINDOW_MS) { selfWrites.delete(path); return }
  const b = manager.list().find(x => x.filePath === path); if (!b) return
  if (b.dirty) { conflicts.add(b.id); showChangeBar(b.id, b.title) }
  else void reloadBuffer(b.id)
})

installDropOpen((p) => { void openPath(p) })

window.api.onOpenFile((path) => { void openPath(path) })

// Non-blocking startup diagnostics from main (e.g. global-hotkey conflict).
window.api.onAppNotify((msg) => toast(msg))

installMenuCommands({
  new: () => { manager.create(); showActive(); scheduleSessionSave() },
  open: () => void openFromDisk(),
  'save-as': async () => { const id = paneFor(view.focusedPane()).currentBufferId(); if (!id) return; await saveBuffer(id, { ...MANUAL_SAVE, forceDialog: true }); tabBar.render(manager.list(), manager.activeId); refreshStatus() },
  save: () => void saveActive(),
  'save-all': () => void saveAll(),
  close: () => void closeTab(manager.activeId!),
  split: () => { view.setSplit(!view.isSplit()); showActive() },
  mdpreview: togglePreview,
  wrap: () => { const on = paneFor(view.focusedPane()).toggleWordWrap(); toast('Word wrap: ' + (on ? 'on' : 'off')) },
  lines: () => paneFor(view.focusedPane()).toggleLineNumbers(),
  'zoom-in': () => zoomBy(1), 'zoom-out': () => zoomBy(-1), 'zoom-reset': zoomReset,
  appearance: openAppearance, aot: toggleAlwaysOnTop,
  diff: startDiff, 'diff-clip': () => void diffClipboard(), 'diff-files': () => void diffFiles(),
  history: openHistory,
  'paste-history': pasteFromHistory, 'snip-insert': insertSnippet, 'snip-save': () => void saveSelectionAsSnippet(), 'snip-manage': manageSnippets,
  find: () => paneFor(view.focusedPane()).triggerFind(), replace: () => paneFor(view.focusedPane()).triggerReplace(),
  'format-doc': () => void paneFor(view.focusedPane()).formatDocument(),
  'format-selection': () => void paneFor(view.focusedPane()).formatSelection(),
  ctxmenu: async () => { const s = await window.api.loadSettings(); const next = !s.contextMenuEnabled; await window.api.setContextMenu(next); await window.api.saveSettings({ ...s, contextMenuEnabled: next }); toast(`Right-click menu ${next ? 'enabled' : 'disabled'}.`) },
  'folder-open': () => void openFolderFromDialog(),
  'folder-close': () => folder.closeFolder(),
  'sidebar-toggle': () => folder.toggleSidebar(),
  'quick-open': () => folder.openQuickOpen(),
  reveal: () => void folder.revealActive(),
  'export-html': exportHtml,
  'export-pdf': exportPdf,
  'help-shortcuts': () => helpOverlay.openShortcuts(),
  'help-about': () => helpOverlay.openAbout(),
}, (id) => theme.pick(id))

boot()

const HISTORY_INTERVAL_MS = 5 * 60 * 1000
const historyTimer = setInterval(() => {
  for (const b of manager.list()) {
    if (b.filePath && b.dirty) window.api.snapshotHistory(b.filePath, b.content, b.eol, b.encoding)
  }
}, HISTORY_INTERVAL_MS)
// Clear on unload so HMR dev reloads don't stack duplicate timers.
window.addEventListener('beforeunload', () => clearInterval(historyTimer))
