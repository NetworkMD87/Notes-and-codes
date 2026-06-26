import Split from 'split.js'
import type { DirEntry } from '../shared/types'
import { TreeModel } from './treeModel'
import { Sidebar } from './sidebar'
import { QuickOpen } from './quickOpen'
import { showContextMenu } from './contextMenu'
import { promptInput, confirmDialog } from './inputOverlay'
import { toast } from './notify'

export interface FolderModeDeps {
  sidebarEl: HTMLElement
  mainEl: HTMLElement
  openFile: (path: string) => void
  activePath: () => string | null
}

export class FolderMode {
  private model = new TreeModel()
  private sidebar: Sidebar
  private quick: QuickOpen
  private index: string[] = []
  private split: ReturnType<typeof Split> | null = null
  private showAll = false

  constructor(private d: FolderModeDeps) {
    this.sidebar = new Sidebar(d.sidebarEl, {
      model: this.model,
      loadChildren: (p) => this.loadChildren(p),
      openFile: d.openFile,
      onContext: (entry, x, y) => this.contextMenu(entry, x, y)
    })
    this.quick = new QuickOpen(document.getElementById('app')!, {
      files: () => this.index,
      openFile: d.openFile
    })
    window.api.onDirChanged(() => void this.onDiskChange())
  }

  hasFolder(): boolean { return this.model.root !== null }

  async openFolder(root: string): Promise<void> {
    const s = await window.api.loadSettings()
    this.showAll = s.showAllFiles
    this.model.setRoot(root)
    await this.loadChildren(root)
    this.hideSidebar()
    this.showSidebar(s.sidebarWidth)
    this.sidebar.render()
    await window.api.watchDir(root)
    await window.api.saveSettings({ ...s, lastFolder: root, sidebarVisible: true })
    void this.reindex()
  }

  closeFolder(): void {
    this.model.setRoot('')
    this.model.root = null
    this.index = []
    void window.api.watchDir(null)
    this.hideSidebar()
    void window.api.loadSettings().then(s => window.api.saveSettings({ ...s, lastFolder: null, sidebarVisible: false }))
  }

  toggleSidebar(): void {
    if (!this.hasFolder()) { toast('Open a folder first (File ▸ Open Folder…).'); return }
    if (this.split) this.hideSidebar()
    else void window.api.loadSettings().then(s => { this.showSidebar(s.sidebarWidth); this.sidebar.render() })
  }

  openQuickOpen(): void {
    if (!this.hasFolder()) { toast('Open a folder to use Quick Open.'); return }
    this.quick.open()
  }

  async revealActive(): Promise<void> {
    const path = this.d.activePath(); const root = this.model.root
    if (!path || !root || !path.startsWith(root)) { toast('Active file is not in the open folder.'); return }
    const sep = root.includes('\\') ? '\\' : '/'
    const rel = path.slice(root.length).replace(/^[\\/]/, '')
    const segs = rel.split(/[\\/]/); segs.pop() // drop filename
    let dir = root
    for (const seg of segs) {
      if (!this.model.hasChildren(dir)) await this.loadChildren(dir)
      this.model.setExpanded(dir, true)
      dir = dir.replace(/[\\/]$/, '') + sep + seg
    }
    if (!this.model.hasChildren(dir)) await this.loadChildren(dir)
    this.model.setExpanded(dir, true)
    this.sidebar.setActivePath(path)
  }

  async restore(): Promise<void> {
    const s = await window.api.loadSettings()
    if (!s.restoreFolderOnLaunch || !s.lastFolder) return
    if (await window.api.dirExists(s.lastFolder)) {
      await this.openFolder(s.lastFolder)
    } else {
      await window.api.saveSettings({ ...s, lastFolder: null, sidebarVisible: false })
    }
  }

  // --- internals ---

  private async loadChildren(path: string): Promise<void> {
    this.model.setChildren(path, await window.api.readDir(path, this.showAll))
  }

  private async reindex(): Promise<void> {
    if (this.model.root) this.index = await window.api.walkFiles(this.model.root, this.showAll)
  }

  private async onDiskChange(): Promise<void> {
    if (!this.model.root) return
    for (const p of [this.model.root, ...this.model.expandedPaths()]) {
      if (this.model.hasChildren(p)) this.model.setChildren(p, await window.api.readDir(p, this.showAll))
    }
    this.sidebar.render()
    await this.reindex()
  }

  private showSidebar(width: number): void {
    this.d.sidebarEl.classList.remove('hidden')
    const total = this.d.sidebarEl.parentElement!.clientWidth || window.innerWidth
    const pct = Math.min(60, Math.max(10, (width / total) * 100))
    this.split = Split([this.d.sidebarEl, this.d.mainEl], {
      sizes: [pct, 100 - pct],
      minSize: [140, 240],
      gutterSize: 6,
      elementStyle: (_dim, size, gutter) => ({ 'flex-basis': `calc(${size}% - ${gutter}px)` }),
      gutterStyle: (_dim, gutter) => ({ 'flex-basis': `${gutter}px` }),
      onDragEnd: () => void this.persistWidth()
    })
  }

  private hideSidebar(): void {
    if (this.split) { this.split.destroy(); this.split = null }
    this.d.sidebarEl.style.flexBasis = ''
    this.d.mainEl.style.flexBasis = ''
    this.d.sidebarEl.classList.add('hidden')
  }

  private async persistWidth(): Promise<void> {
    const width = Math.round(this.d.sidebarEl.getBoundingClientRect().width)
    const s = await window.api.loadSettings()
    await window.api.saveSettings({ ...s, sidebarWidth: width })
  }

  private contextMenu(entry: DirEntry | null, x: number, y: number): void {
    const dir = entry ? (entry.isDir ? entry.path : entry.path.replace(/[\\/][^\\/]+$/, '')) : this.model.root!
    const items = [
      { label: 'New File…', run: () => void this.newFile(dir) },
      { label: 'New Folder…', run: () => void this.newFolder(dir) }
    ]
    if (entry) {
      items.push({ label: 'Rename…', run: () => void this.rename(entry) })
      items.push({ label: 'Delete', run: () => void this.remove(entry) })
    }
    showContextMenu(x, y, items)
  }

  private async newFile(dir: string): Promise<void> {
    const name = await promptInput('New file name'); if (!name) return
    if (await window.api.createFile(dir.replace(/[\\/]$/, '') + '/' + name)) await this.refreshDir(dir)
    else toast('Could not create file (already exists?).')
  }
  private async newFolder(dir: string): Promise<void> {
    const name = await promptInput('New folder name'); if (!name) return
    if (await window.api.createFolder(dir.replace(/[\\/]$/, '') + '/' + name)) await this.refreshDir(dir)
    else toast('Could not create folder (already exists?).')
  }
  private async rename(entry: DirEntry): Promise<void> {
    const name = await promptInput('Rename', entry.name); if (!name || name === entry.name) return
    const parent = entry.path.replace(/[\\/][^\\/]+$/, '')
    if (await window.api.renamePath(entry.path, parent + '/' + name)) await this.refreshDir(parent)
    else toast('Could not rename (name in use?).')
  }
  private async remove(entry: DirEntry): Promise<void> {
    if (!await confirmDialog(`Delete "${entry.name}"? It will be moved to the Recycle Bin.`)) return
    const parent = entry.path.replace(/[\\/][^\\/]+$/, '')
    if (await window.api.trashPath(entry.path)) { await this.refreshDir(parent); toast(`Moved "${entry.name}" to Recycle Bin.`) }
    else toast('Could not delete.')
  }

  private async refreshDir(dir: string): Promise<void> {
    this.model.setChildren(dir, await window.api.readDir(dir, this.showAll))
    this.model.setExpanded(dir, true)
    this.sidebar.render()
    await this.reindex()
  }
}
