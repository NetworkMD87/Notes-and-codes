import './monacoEnv'
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
import { MarkdownPreview } from './markdownPreview'
import { PasteHistoryList } from './pasteHistory'
import { PasteHistoryPicker } from './pasteHistoryPicker'
import { installDropOpen } from './dropOpen'
import { Toolbar } from './toolbar'
import { SnippetList } from './snippets'
import { SnippetPicker } from './snippetPicker'
import { SnippetManager } from './snippetManager'
import { promptInput } from './inputOverlay'
declare global { interface Window { api: Api } }

const manager = new BufferManager(() => crypto.randomUUID())
const view = new SplitView(document.getElementById('paneA')!, document.getElementById('paneB')!)
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

const theme = new ThemeController([view.paneA, view.paneB], (m) => {
  window.api.loadSettings().then(s => window.api.saveSettings({ ...s, theme: m }))
})
const themeBtn = document.createElement('button')
themeBtn.id = 'theme-toggle'; themeBtn.textContent = '◐ theme'
themeBtn.onclick = () => theme.cycle()
document.getElementById('header')!.appendChild(themeBtn)

function paneFor(which: 'A' | 'B') { return which === 'A' ? view.paneA : view.paneB }

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

function refreshStatus(): void {
  const id = paneFor(view.focusedPane()).currentBufferId() ?? manager.activeId!
  const b = manager.get(id)!
  statusBar.update({ language: b.language, eol: b.eol, encoding: b.encoding, cursor: paneFor(view.focusedPane()).getCursor(), dirty: b.dirty })
}

const tabBar = new TabBar(document.getElementById('tabbar')!, {
  onSelect: (id) => { manager.setActive(id); showActive(); scheduleSessionSave() },
  onClose: (id) => { manager.close(id); if (manager.list().length === 0) manager.create(); showActive(); scheduleSessionSave() },
  onNew: () => { manager.create(); showActive(); scheduleSessionSave() }
})

function showActive(): void {
  const active = manager.get(manager.activeId!)!
  paneFor(view.focusedPane()).setBuffer(active)
  tabBar.render(manager.list(), manager.activeId)
  refreshStatus()
  refreshPreview()
  refreshToolbar()
  syncWatch()
}

for (const which of ['A', 'B'] as const) paneFor(which).onCursor(() => refreshStatus())

for (const which of ['A', 'B'] as const) {
  paneFor(which).onChange(c => {
    const id = paneFor(which).currentBufferId()
    if (!id) return
    manager.update(id, c)
    tabBar.render(manager.list(), manager.activeId)
    refreshStatus()
    scheduleSessionSave()
    refreshPreview()
  })
}

let autoSave = true
let saveTimer: number | undefined
let alwaysOnTop = false
let fontSize = 14
function applyFontSize(): void { view.paneA.setFontSize(fontSize); view.paneB.setFontSize(fontSize) }
function persistFontSize(): void { window.api.loadSettings().then(s => window.api.saveSettings({ ...s, fontSize })) }
function zoomBy(delta: number): void { fontSize = Math.min(40, Math.max(6, fontSize + delta)); applyFontSize(); persistFontSize() }
function zoomReset(): void { fontSize = 14; applyFontSize(); persistFontSize() }

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
  saveTimer = setTimeout(() => window.api.saveSession(manager.toSession()), 500) as unknown as number
}

async function boot(): Promise<void> {
  const settings = await window.api.loadSettings()
  autoSave = settings.autoSaveSession
  theme.apply(settings.theme)
  fontSize = settings.fontSize ?? 14; applyFontSize()
  alwaysOnTop = settings.alwaysOnTop; await window.api.setAlwaysOnTop(alwaysOnTop)
  pasteHistory.load(await window.api.loadClipboardHistory())
  snippets.load(await window.api.loadSnippets())
  const session = await window.api.loadSession()
  if (session.buffers.length > 0) manager.restore(session)
  else manager.create()
  if (!manager.activeId) manager.setActive(manager.list()[0].id)
  showActive()
}

async function saveBuffer(id: string): Promise<boolean> {
  const b = manager.get(id); if (!b) return false
  const pane = view.paneA.currentBufferId() === id ? view.paneA
    : view.paneB.currentBufferId() === id ? view.paneB : null
  const content = pane ? pane.getContent() : b.content
  const oldLang = b.language
  let path = b.filePath
  if (!path) { path = await window.api.saveAsDialog(); if (!path) return false }
  await window.api.writeFile(path, content, b.eol, b.encoding)
  manager.markSaved(id, path)
  window.api.addRecentFile(path)
  if (pane && manager.get(id)!.language !== oldLang) pane.setBuffer(manager.get(id)!)
  syncWatch()
  return true
}
async function saveActive(): Promise<void> {
  const id = paneFor(view.focusedPane()).currentBufferId(); if (!id) return
  await saveBuffer(id)
  tabBar.render(manager.list(), manager.activeId); refreshStatus()
}
async function saveAll(): Promise<void> {
  let saved = 0
  for (const b of manager.list()) { if (b.dirty) { if (await saveBuffer(b.id)) saved++ } }
  tabBar.render(manager.list(), manager.activeId); refreshStatus()
  toast(saved ? `Saved ${saved} file${saved === 1 ? '' : 's'}.` : 'Nothing to save.')
}

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

const pasteFromHistory = () => phPicker.open(pasteHistory.entries(), (text) => { paneFor(view.focusedPane()).insertAtCursor(text) })
const clearPasteHistory = () => { pasteHistory.clear(); persistClipHistory(); toast('Paste history cleared.') }

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
  pasteFromHistory
})
// keep the theme toggle as the right-most element in the header
document.getElementById('header')!.appendChild(themeBtn)

function refreshToolbar(): void {
  toolbar.syncToggles({ split: view.isSplit(), preview: mdPreview.isVisible(), pin: alwaysOnTop })
}

const palette = new CommandPalette()
registerCommands({
  palette, manager, view, theme, diff, paneFor, showActive, scheduleSessionSave,
  saveActive, saveAll, openFromDisk, startDiff, diffClipboard, diffFiles,
  getAutoSave: () => autoSave, setAutoSave: (v) => { autoSave = v },
  togglePreview, pasteFromHistory, clearPasteHistory, saveSelectionAsSnippet, insertSnippet, manageSnippets,
  toggleAlwaysOnTop,
  zoomIn: () => zoomBy(1), zoomOut: () => zoomBy(-1), zoomReset
})

const overlayOpen = () =>
  !document.getElementById('palette')?.classList.contains('hidden') ||
  !!document.querySelector('.diff-picker:not(.hidden)')

window.addEventListener('keydown', (e) => {
  if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'p') { e.preventDefault(); palette.open() }
  if (e.ctrlKey && e.key === '\\') { view.setSplit(!view.isSplit()); showActive() }
  if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 's') { e.preventDefault(); if (overlayOpen()) return; saveAll() }
  if (e.ctrlKey && !e.shiftKey && e.key.toLowerCase() === 's') { e.preventDefault(); if (overlayOpen()) return; saveActive() }
  if (e.ctrlKey && e.key.toLowerCase() === 'o') { e.preventDefault(); if (overlayOpen()) return; openFromDisk() }
  if (e.key === 'Escape' && diff.isOpen()) diff.hide()
  if (e.ctrlKey && (e.key === '=' || e.key === '+')) { e.preventDefault(); zoomBy(1) }
  if (e.ctrlKey && e.key === '-') { e.preventDefault(); zoomBy(-1) }
  if (e.ctrlKey && e.key === '0') { e.preventDefault(); zoomReset() }
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
  if (paneFor(view.focusedPane()).currentBufferId() === id) paneFor(view.focusedPane()).setBuffer(b)
  refreshStatus(); tabBar.render(manager.list(), manager.activeId)
}
const changeBar = document.getElementById('change-bar')!
function showChangeBar(id: string, name: string): void {
  changeBar.replaceChildren()
  const msg = document.createElement('span'); msg.textContent = `"${name}" changed on disk.`
  const reload = document.createElement('button'); reload.textContent = 'Reload (discard mine)'
  reload.onclick = () => { void reloadBuffer(id); changeBar.classList.add('hidden') }
  const keep = document.createElement('button'); keep.textContent = 'Keep mine'
  keep.onclick = () => changeBar.classList.add('hidden')
  changeBar.append(msg, reload, keep); changeBar.classList.remove('hidden')
}
window.api.onFileChanged((path) => {
  const b = manager.list().find(x => x.filePath === path); if (!b) return
  if (b.dirty) showChangeBar(b.id, b.title); else void reloadBuffer(b.id)
})

installDropOpen((p) => { void openPath(p) })

window.api.onOpenFile((path) => { void openPath(path) })

boot()
