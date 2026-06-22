import './monacoEnv'
import type { Api } from '../shared/types'
import { BufferManager } from './bufferManager'
import { TabBar } from './tabBar'
import { SplitView } from './splitView'
declare global { interface Window { api: Api } }

const manager = new BufferManager(() => crypto.randomUUID())
const view = new SplitView(document.getElementById('paneA')!, document.getElementById('paneB')!)

function paneFor(which: 'A' | 'B') { return which === 'A' ? view.paneA : view.paneB }

const tabBar = new TabBar(document.getElementById('tabbar')!, {
  onSelect: (id) => { manager.setActive(id); showActive() },
  onClose: (id) => { manager.close(id); if (manager.list().length === 0) manager.create(); showActive() },
  onNew: () => { manager.create(); showActive() }
})

function showActive(): void {
  const active = manager.get(manager.activeId!)!
  paneFor(view.focusedPane()).setBuffer(active)
  tabBar.render(manager.list(), manager.activeId)
}

for (const which of ['A', 'B'] as const) {
  paneFor(which).onChange(c => { manager.update(manager.activeId!, c); tabBar.render(manager.list(), manager.activeId) })
}

// temporary keyboard toggle to verify split; replaced by command palette in Task 11
window.addEventListener('keydown', (e) => {
  if (e.ctrlKey && e.key === '\\') { view.setSplit(!view.isSplit()); showActive() }
})

manager.create()
showActive()
