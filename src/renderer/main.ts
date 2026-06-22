import './monacoEnv'
import type { Api } from '../shared/types'
import { BufferManager } from './bufferManager'
import { TabBar } from './tabBar'
import { SplitView } from './splitView'
import { ThemeController } from './theme'
declare global { interface Window { api: Api } }

const manager = new BufferManager(() => crypto.randomUUID())
const view = new SplitView(document.getElementById('paneA')!, document.getElementById('paneB')!)

const theme = new ThemeController([view.paneA, view.paneB], (m) => {
  window.api.loadSettings().then(s => window.api.saveSettings({ ...s, theme: m }))
})
const themeBtn = document.createElement('button')
themeBtn.id = 'theme-toggle'; themeBtn.textContent = '◐ theme'
themeBtn.onclick = () => theme.cycle()
document.getElementById('header')!.appendChild(themeBtn)

function paneFor(which: 'A' | 'B') { return which === 'A' ? view.paneA : view.paneB }

const tabBar = new TabBar(document.getElementById('tabbar')!, {
  onSelect: (id) => { manager.setActive(id); showActive(); scheduleSessionSave() },
  onClose: (id) => { manager.close(id); if (manager.list().length === 0) manager.create(); showActive(); scheduleSessionSave() },
  onNew: () => { manager.create(); showActive(); scheduleSessionSave() }
})

function showActive(): void {
  const active = manager.get(manager.activeId!)!
  paneFor(view.focusedPane()).setBuffer(active)
  tabBar.render(manager.list(), manager.activeId)
}

for (const which of ['A', 'B'] as const) {
  paneFor(which).onChange(c => { manager.update(manager.activeId!, c); tabBar.render(manager.list(), manager.activeId); scheduleSessionSave() })
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

// temporary keyboard toggle to verify split; replaced by command palette in Task 11
window.addEventListener('keydown', (e) => {
  if (e.ctrlKey && e.key === '\\') { view.setSplit(!view.isSplit()); showActive() }
  if (e.ctrlKey && e.key.toLowerCase() === 's') { e.preventDefault(); saveActive() }
  if (e.ctrlKey && e.key.toLowerCase() === 'o') { e.preventDefault(); openFromDisk() }
})

boot()
