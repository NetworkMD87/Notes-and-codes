import type { DirEntry } from '../shared/types'
import { HL_HEX } from '../shared/types'
import type { TreeModel } from './treeModel'
import { fileType } from './fileType'

const SVGNS = 'http://www.w3.org/2000/svg'
const FOLDER_PATH = 'M4 7a1 1 0 0 1 1-1h4l2 2h8a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7z'

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

  /** Lightweight active-row update — toggles `.active` on existing rows without a full re-render (so a
   *  tab switch doesn't rebuild the tree or reset scroll). A file in a collapsed dir has no row yet, so
   *  it simply isn't highlighted until revealed; `setActivePath` (full render) is used by Reveal. */
  markActive(path: string | null): void {
    this.activePath = path
    for (const row of this.host.querySelectorAll<HTMLElement>('.sb-row')) {
      row.classList.toggle('active', row.dataset.path === path)
    }
  }

  render(): void {
    const root = this.d.model.root
    this.host.replaceChildren()
    if (!root) return
    const header = document.createElement('div'); header.className = 'sb-header'
    // basename without a node import (renderer is sandboxed): strip trailing slashes, take the last segment.
    header.textContent = root.split(/[\\/]/).filter(Boolean).pop() ?? root
    this.host.appendChild(header)
    const list = document.createElement('div'); list.className = 'sb-list'
    this.renderLevel(root, 0, list)
    this.host.appendChild(list)
  }

  private renderLevel(dirPath: string, depth: number, into: HTMLElement): void {
    const entries = this.d.model.getChildren(dirPath) ?? []
    for (const entry of entries) {
      const row = document.createElement('div')
      row.className = 'sb-row' + (entry.path === this.activePath ? ' active' : '')
      row.dataset.path = entry.path
      row.style.paddingLeft = `${8 + depth * 14}px`
      row.style.setProperty('--depth', String(depth))
      const twisty = document.createElement('span'); twisty.className = 'sb-twisty'
      twisty.textContent = entry.isDir ? (this.d.model.isExpanded(entry.path) ? '▾' : '▸') : ''
      const type = document.createElement('span')
      if (entry.isDir) {
        type.className = 'sb-folder'
        const svg = document.createElementNS(SVGNS, 'svg'); svg.setAttribute('viewBox', '0 0 24 24')
        const p = document.createElementNS(SVGNS, 'path'); p.setAttribute('d', FOLDER_PATH); svg.appendChild(p)
        type.appendChild(svg)
      } else {
        const b = fileType(entry.name)
        type.className = 'sb-badge'; type.textContent = b.label
        if (b.colour) { const hex = HL_HEX[b.colour]; type.style.color = hex; type.style.background = hex + '22' }
        else type.style.color = 'var(--muted)'
      }
      const label = document.createElement('span'); label.className = 'sb-label'; label.textContent = entry.name
      row.append(twisty, type, label)
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
