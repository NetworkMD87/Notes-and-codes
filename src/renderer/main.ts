import './monacoEnv'
import type { Api } from '../shared/types'
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
declare global { interface Window { api: Api } }

const manager = new BufferManager(() => crypto.randomUUID())
const view = new SplitView(document.getElementById('paneA')!, document.getElementById('paneB')!)
const statusBar = new StatusBar(document.getElementById('statusbar')!, {
  onEol: (eol) => { const id = paneFor(view.focusedPane()).currentBufferId(); const b = id && manager.get(id); if (b) { b.eol = eol; b.dirty = true; refreshStatus(); tabBar.render(manager.list(), manager.activeId); scheduleSessionSave() } },
  onEncoding: (enc) => { const id = paneFor(view.focusedPane()).currentBufferId(); const b = id && manager.get(id); if (b) { b.encoding = enc; b.dirty = true; refreshStatus(); tabBar.render(manager.list(), manager.activeId); scheduleSessionSave() } }
})
const diff = new DiffView(document.getElementById('diff')!)
const diffPicker = new DiffPicker(document.getElementById('app')!)

const theme = new ThemeController([view.paneA, view.paneB], (m) => {
  window.api.loadSettings().then(s => window.api.saveSettings({ ...s, theme: m }))
})
const themeBtn = document.createElement('button')
themeBtn.id = 'theme-toggle'; themeBtn.textContent = '◐ theme'
themeBtn.onclick = () => theme.cycle()
document.getElementById('header')!.appendChild(themeBtn)

function paneFor(which: 'A' | 'B') { return which === 'A' ? view.paneA : view.paneB }

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
  })
}

let autoSave = true
let saveTimer: number | undefined

function scheduleSessionSave(): void {
  if (!autoSave) return
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => window.api.saveSession(manager.toSession()), 500) as unknown as number
}

async function boot(): Promise<void> {
  const settings = await window.api.loadSettings()
  autoSave = settings.autoSaveSession
  theme.apply(settings.theme)
  const session = await window.api.loadSession()
  if (session.buffers.length > 0) manager.restore(session)
  else manager.create()
  if (!manager.activeId) manager.setActive(manager.list()[0].id)
  showActive()
}

async function saveActive(): Promise<void> {
  const pane = paneFor(view.focusedPane())
  const id = pane.currentBufferId()
  if (!id) return
  const b = manager.get(id)!
  const oldLang = b.language
  let path = b.filePath
  if (!path) { path = await window.api.saveAsDialog(); if (!path) return }
  await window.api.writeFile(path, pane.getContent(), b.eol, b.encoding)
  manager.markSaved(id, path)
  if (manager.get(id)!.language !== oldLang) pane.setBuffer(manager.get(id)!)
  tabBar.render(manager.list(), manager.activeId)
  refreshStatus()
}

async function openFromDisk(): Promise<void> {
  const path = await window.api.openDialog(); if (!path) return
  const file = await window.api.readFile(path)
  manager.open(file); showActive()
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
    { title: a.split(/[\\/]/).pop() ?? a, content: fa.content, language: '' },
    { title: bPath.split(/[\\/]/).pop() ?? bPath, content: fb.content, language: '' }
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

const palette = new CommandPalette()
registerCommands({
  palette, manager, view, theme, diff, paneFor, showActive, scheduleSessionSave,
  saveActive, openFromDisk, startDiff, diffClipboard, diffFiles,
  getAutoSave: () => autoSave, setAutoSave: (v) => { autoSave = v }
})

const overlayOpen = () =>
  !document.getElementById('palette')?.classList.contains('hidden') ||
  !!document.querySelector('.diff-picker:not(.hidden)')

window.addEventListener('keydown', (e) => {
  if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'p') { e.preventDefault(); palette.open() }
  if (e.ctrlKey && e.key === '\\') { view.setSplit(!view.isSplit()); showActive() }
  if (e.ctrlKey && e.key.toLowerCase() === 's') { e.preventDefault(); if (overlayOpen()) return; saveActive() }
  if (e.ctrlKey && e.key.toLowerCase() === 'o') { e.preventDefault(); if (overlayOpen()) return; openFromDisk() }
  if (e.key === 'Escape' && diff.isOpen()) diff.hide()
})

window.api.onOpenFile(async (path) => {
  try {
    const file = await window.api.readFile(path)
    manager.open(file)
    showActive()
    scheduleSessionSave()
  } catch (err) {
    console.error('failed to open file:', path, err)
    toast(`Could not open: ${path}`)
  }
})

boot()
