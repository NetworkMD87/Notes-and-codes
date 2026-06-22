import './monacoEnv'
import type { Api } from '../shared/types'
import { EditorPane } from './editorPane'
import { BufferManager } from './bufferManager'
import { TabBar } from './tabBar'
declare global { interface Window { api: Api } }

const manager = new BufferManager(() => crypto.randomUUID())
const paneA = new EditorPane(document.getElementById('paneA')!)

const tabBar = new TabBar(document.getElementById('tabbar')!, {
  onSelect: (id) => { manager.setActive(id); showActive() },
  onClose: (id) => { manager.close(id); if (manager.list().length === 0) manager.create(); showActive() },
  onNew: () => { manager.create(); showActive() }
})

function showActive(): void {
  const active = manager.get(manager.activeId!)!
  paneA.setBuffer(active)
  tabBar.render(manager.list(), manager.activeId)
}

paneA.onChange(c => { manager.update(manager.activeId!, c); tabBar.render(manager.list(), manager.activeId) })
manager.create()
showActive()
