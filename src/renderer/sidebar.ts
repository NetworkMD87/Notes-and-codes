import type { DirEntry } from '../shared/types'
import type { TreeModel } from './treeModel'

export interface SidebarDeps {
  model: TreeModel
  loadChildren: (path: string) => Promise<void> // readDir + model.setChildren
  openFile: (path: string) => void
  onContext: (entry: DirEntry | null, x: number, y: number) => void
}

export class Sidebar {
  private activePath: string | null = null
  constructor(private host: HTMLElement, private d: SidebarDeps) {
    // right-click on empty sidebar space → root context menu
    this.host.addEventListener('contextmenu', (e) => {
      if (e.target === this.host) { e.preventDefault(); this.d.onContext(null, e.clientX, e.clientY) }
    })
  }

  setActivePath(path: string | null): void { this.activePath = path; this.render() }

  render(): void {
    const root = this.d.model.root
    this.host.replaceChildren()
    if (!root) return
    const list = document.createElement('div'); list.className = 'sb-list'
    this.renderLevel(root, 0, list)
    this.host.appendChild(list)
  }

  private renderLevel(dirPath: string, depth: number, into: HTMLElement): void {
    const entries = this.d.model.getChildren(dirPath) ?? []
    for (const entry of entries) {
      const row = document.createElement('div')
      row.className = 'sb-row' + (entry.path === this.activePath ? ' active' : '')
      row.style.paddingLeft = `${8 + depth * 14}px`
      const twisty = document.createElement('span'); twisty.className = 'sb-twisty'
      twisty.textContent = entry.isDir ? (this.d.model.isExpanded(entry.path) ? '▾' : '▸') : ''
      const label = document.createElement('span'); label.className = 'sb-label'; label.textContent = entry.name
      row.append(twisty, label)
      row.onclick = () => { entry.isDir ? void this.toggleDir(entry.path) : this.d.openFile(entry.path) }
      row.oncontextmenu = (e) => { e.preventDefault(); e.stopPropagation(); this.d.onContext(entry, e.clientX, e.clientY) }
      into.appendChild(row)
      if (entry.isDir && this.d.model.isExpanded(entry.path)) this.renderLevel(entry.path, depth + 1, into)
    }
  }

  private async toggleDir(path: string): Promise<void> {
    const open = this.d.model.isExpanded(path)
    if (!open && !this.d.model.hasChildren(path)) await this.d.loadChildren(path)
    this.d.model.setExpanded(path, !open)
    this.render()
  }
}
