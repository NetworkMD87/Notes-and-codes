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
declare global { interface Window { api: Api } }

const manager = new BufferManager(() => crypto.randomUUID())
const view = new SplitView(document.getElementById('paneA')!, document.getElementById('paneB')!)
const statusBar = new StatusBar(document.getElementById('statusbar')!)
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
  const b = manager.get(manager.activeId!)!
  statusBar.update({ language: b.language, eol: b.eol, cursor: paneFor(view.focusedPane()).getCursor(), dirty: b.dirty })
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
  paneFor(which).onChange(c => { manager.update(manager.activeId!, c); tabBar.render(manager.list(), manager.activeId); refreshStatus(); scheduleSessionSave() })
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
  const b = manager.get(manager.activeId!)!
  let path = b.filePath
  if (!path) { path = await window.api.saveAsDialog(); if (!path) return }
  await window.api.writeFile(path, paneFor(view.focusedPane()).getContent(), b.eol)
  manager.markSaved(b.id, path)
  tabBar.render(manager.list(), manager.activeId)
}

async function openFromDisk(): Promise<void> {
  const path = await window.api.openDialog(); if (!path) return
  const file = await window.api.readFile(path)
  manager.open(file); showActive()
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
palette.register({ id: 'new', label: 'New Tab', run: () => { manager.create(); showActive(); scheduleSessionSave() } })
palette.register({ id: 'close', label: 'Close Tab', run: () => { manager.close(manager.activeId!); if (!manager.list().length) manager.create(); showActive(); scheduleSessionSave() } })
palette.register({ id: 'split', label: 'Toggle Split', run: () => { view.setSplit(!view.isSplit()); showActive() } })
palette.register({ id: 'lines', label: 'Toggle Line Numbers', run: () => { paneFor(view.focusedPane()).toggleLineNumbers() } })
palette.register({ id: 'theme', label: 'Cycle Theme', run: () => theme.cycle() })
palette.register({ id: 'save', label: 'Save', run: () => saveActive() })
palette.register({ id: 'open', label: 'Open File', run: () => openFromDisk() })
palette.register({ id: 'diff', label: 'Start Diff (tab vs tab)', run: () => startDiff() })
palette.register({ id: 'diff-close', label: 'Close Diff', run: () => diff.hide() })
palette.register({ id: 'autosave', label: 'Toggle Auto-Save Session', run: async () => {
  autoSave = !autoSave
  const s = await window.api.loadSettings(); await window.api.saveSettings({ ...s, autoSaveSession: autoSave })
} })
palette.register({ id: 'ctxmenu', label: 'Toggle "Open with Notes & Codes" right-click menu', run: async () => {
  const s = await window.api.loadSettings()
  const next = !s.contextMenuEnabled
  await window.api.setContextMenu(next)
  await window.api.saveSettings({ ...s, contextMenuEnabled: next })
  toast(`Right-click menu ${next ? 'enabled' : 'disabled'}.`)
} })

window.addEventListener('keydown', (e) => {
  if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'p') { e.preventDefault(); palette.open() }
  if (e.ctrlKey && e.key === '\\') { view.setSplit(!view.isSplit()); showActive() }
  if (e.ctrlKey && e.key.toLowerCase() === 's') { e.preventDefault(); saveActive() }
  if (e.ctrlKey && e.key.toLowerCase() === 'o') { e.preventDefault(); openFromDisk() }
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
