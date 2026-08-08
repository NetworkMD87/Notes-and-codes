import Split from 'split.js'
import type { DirEntry, WorkspaceFilter } from '../shared/types'
import { TreeModel } from './treeModel'
import { Sidebar } from './sidebar'
import { FolderPanel } from './folderPanel'
import { QuickOpen } from './quickOpen'
import { showContextMenu, type ContextMenuEntry } from './contextMenu'
import { promptInput, confirmDialog } from './inputOverlay'
import { toast } from './notify'
import { menuEntries, splitPath } from './recentFolders'
import { buildQuickOpenCandidates, type QuickOpenCandidate } from './fuzzy'
import { RefreshScheduler } from './refreshScheduler'

export interface FolderModeDeps {
  sidebarEl: HTMLElement
  mainEl: HTMLElement
  openFile: (path: string) => void
  activePath: () => string | null
  pickFolder: () => Promise<void>   // the same picker the File menu / palette use
  focusEditor: () => void
  filter: () => WorkspaceFilter
  workspaceChanged: () => void
}

interface FolderRefreshSnapshot {
  root: string | null
  filter: WorkspaceFilter
  directories: string[]
}

export class FolderMode {
  private model = new TreeModel()
  private sidebar: Sidebar
  private panel: FolderPanel
  private quick: QuickOpen
  private index: QuickOpenCandidate[] = []
  private indexTruncated = false
  private split: ReturnType<typeof Split> | null = null
  private lifecycleGeneration = 0
  private desiredRoot: string | null = null
  private desiredSidebarVisible = false
  private refresh = new RefreshScheduler(
    () => this.refreshSnapshot(),
    run => this.runRefresh(run.snapshot, run.isCurrent),
  )

  constructor(private d: FolderModeDeps) {
    this.sidebar = new Sidebar(d.sidebarEl, {
      model: this.model,
      loadChildren: (p) => this.loadChildren(p),
      openFile: d.openFile,
      onContext: (entry, x, y) => this.contextMenu(entry, x, y),
      onHeaderClick: (x, y, keyboardOpener) => void this.folderMenu(x, y, keyboardOpener)
    })
    this.quick = new QuickOpen(document.getElementById('app')!, {
      candidates: () => this.index,
      truncated: () => this.indexTruncated,
      openFile: d.openFile,
      focusEditor: d.focusEditor
    })
    this.panel = new FolderPanel(d.sidebarEl, {
      pickFolder: () => d.pickFolder(),
      recents: () => window.api.loadRecentFolders(),
      chooseRecent: (p) => this.chooseRecent(p),
      clearRecents: async () => { await window.api.clearRecentFolders() }
    })
    window.api.onDirChanged(() => void this.onDiskChange())
  }

  hasFolder(): boolean { return this.model.root !== null }
  root(): string | null { return this.model.root }

  async openFolder(root: string): Promise<void> {
    const generation = ++this.lifecycleGeneration
    this.desiredRoot = root
    this.desiredSidebarVisible = true
    const s = await window.api.loadSettings()
    if (!this.isCurrent(generation)) return
    this.refresh.invalidate()
    this.model.setRoot(root)
    this.d.workspaceChanged()
    this.hideSidebar()
    this.showSidebar(s.sidebarWidth)
    this.sidebar.render()
    await this.syncWatcher(root, generation)
    if (!this.isCurrent(generation)) return
    await this.persistFolderState(root, true, generation)
    if (!this.isCurrent(generation)) return
    await this.refresh.request()
    if (!this.isCurrent(generation)) return
    void window.api.addRecentFolder(root)
  }

  closeFolder(): void {
    const generation = ++this.lifecycleGeneration
    this.desiredRoot = null
    this.desiredSidebarVisible = this.split !== null
    this.refresh.invalidate()
    this.model.setRoot('')
    this.model.root = null
    this.index = []
    this.indexTruncated = false
    this.d.workspaceChanged()
    void this.syncWatcher(null, generation)
    // Spec: "Close Folder returns the panel; the tab stays." The panel replaces the tree in
    // place rather than collapsing the sidebar — hideSidebar() destroys the Split, which would
    // force a second click on the tab just to reach Open Folder…/recents. So the Split (if any)
    // is left exactly as it is; only the sidebar's *content* changes. If the sidebar was already
    // collapsed, it stays collapsed — this only stops an *open* sidebar from closing on you.
    this.renderSidebar()
    void this.persistFolderState(null, this.desiredSidebarVisible, generation)
  }

  toggleSidebar(): void {
    // No longer gated on hasFolder(): with no folder the sidebar shows the folder panel, so the
    // toggle always has something to show and never needs to nag.
    if (this.split) this.hideSidebar()
    else void window.api.loadSettings().then(s => { this.showSidebar(s.sidebarWidth); this.renderSidebar() })
  }

  /** Mount whichever view matches the current state — tree vs panel. The one place *that*
   *  decision is made; it guarantees nothing about when to call it (openFolder, onDiskChange and
   *  refreshDir all call sidebar.render() directly, since they are already root-guarded). */
  private renderSidebar(): void {
    if (this.model.root) this.sidebar.render()
    else void this.panel.render()
  }

  /** Shared by the folder panel and the header switcher: open a recent folder, or prune it and
   *  say so if it has gone. One owner, so the two surfaces cannot disagree about dead entries.
   *  Pruning happens on click rather than on load, so a folder on a temporarily-offline drive is
   *  not silently forgotten. */
  private async chooseRecent(path: string): Promise<'opened' | 'gone'> {
    if (!await window.api.dirExists(path)) {
      await window.api.removeRecentFolder(path)
      toast('Folder no longer exists.', 'error')
      return 'gone'
    }
    await this.openFolder(path)
    return 'opened'
  }

  /** The sidebar header doubles as a folder switcher: recents (minus the open one), then the
   *  same two actions the File menu offers. Reuses showContextMenu rather than adding a new
   *  overlay component. */
  private async folderMenu(x: number, y: number, keyboardOpener?: HTMLElement): Promise<void> {
    const recents = menuEntries(await window.api.loadRecentFolders(), this.model.root)
    const items: ContextMenuEntry[] = recents.map(p => ({
      label: splitPath(p).name,
      run: () => void this.chooseRecent(p)
    }))
    if (items.length) items.push({ separator: true })
    items.push({ label: 'Open Folder…', run: () => void this.d.pickFolder() })
    items.push({ label: 'Close Folder', run: () => this.closeFolder() })
    showContextMenu(x, y, items, keyboardOpener ? { opener: keyboardOpener, focusFirst: true } : undefined)
  }

  /** Reflect the active editor file in the sidebar (highlights its row). No-op with no folder open. */
  setActiveFile(path: string | null): void {
    if (this.model.root) this.sidebar.markActive(path)
  }

  openQuickOpen(): void {
    if (!this.hasFolder()) { toast('Open a folder to use Quick Open.', 'warning'); return }
    this.quick.open()
  }

  async revealActive(): Promise<void> {
    const path = this.d.activePath(); const root = this.model.root
    if (!path || !root || !path.startsWith(root)) { toast('Active file is not in the open folder.', 'warning'); return }
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
      await window.api.updateSettings({ lastFolder: null, sidebarVisible: false })
    }
  }

  // --- internals ---

  private isCurrent(generation: number): boolean {
    return generation === this.lifecycleGeneration
  }

  /** A stale watchDir continuation may finish after a newer open/close. Reapply the latest
   * desired root before returning so the main process cannot be left watching the stale one. */
  private async syncWatcher(root: string | null, generation: number): Promise<void> {
    let targetRoot = root
    let targetGeneration = generation
    while (true) {
      await window.api.watchDir(targetRoot)
      if (this.isCurrent(targetGeneration)) return
      targetRoot = this.desiredRoot
      targetGeneration = this.lifecycleGeneration
    }
  }

  /** updateSettings writes are asynchronous too. If an older write lands last, follow it with
   * the current desired state so lastFolder/sidebarVisible converge on the active lifecycle. */
  private async persistFolderState(
    root: string | null,
    sidebarVisible: boolean,
    generation: number,
  ): Promise<void> {
    let targetRoot = root
    let targetVisible = sidebarVisible
    let targetGeneration = generation
    while (true) {
      await window.api.updateSettings({ lastFolder: targetRoot, sidebarVisible: targetVisible })
      if (this.isCurrent(targetGeneration)) return
      targetRoot = this.desiredRoot
      targetVisible = this.desiredSidebarVisible
      targetGeneration = this.lifecycleGeneration
    }
  }

  private async loadChildren(path: string): Promise<void> {
    const root = this.model.root
    if (!root) return
    const filter = this.d.filter()
    const children = await window.api.readDir(root, path, filter)
    const current = this.d.filter()
    if (this.model.root !== root || current.showAll !== filter.showAll ||
      current.excludePatterns.join('\n') !== filter.excludePatterns.join('\n')) return
    this.model.setChildren(path, children)
  }

  private refreshSnapshot(): FolderRefreshSnapshot {
    const root = this.model.root
    const filter = this.d.filter()
    return {
      root,
      filter: { showAll: filter.showAll, excludePatterns: [...filter.excludePatterns] },
      directories: root ? [root, ...this.model.expandedPaths()] : [],
    }
  }

  private async runRefresh(
    snapshot: FolderRefreshSnapshot,
    isCurrent: () => boolean,
  ): Promise<void> {
    if (!snapshot.root) return
    const walk = await window.api.walkFiles(snapshot.root, snapshot.filter)
    const children: DirEntry[][] = []
    for (const path of snapshot.directories) {
      if (!isCurrent()) return
      children.push(await window.api.readDir(snapshot.root, path, snapshot.filter))
    }
    if (!isCurrent() || this.model.root !== snapshot.root) return
    snapshot.directories.forEach((path, index) => this.model.setChildren(path, children[index]))
    this.index = buildQuickOpenCandidates(snapshot.root, walk.files)
    this.indexTruncated = walk.truncated
    this.sidebar.render()
  }

  workspaceSettingsChanged(): Promise<void> { return this.refresh.request() }

  private onDiskChange(): Promise<void> { return this.refresh.request() }

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
    await window.api.updateSettings({ sidebarWidth: width })
  }

  private contextMenu(entry: DirEntry | null, x: number, y: number): void {
    const root = this.model.root
    // The folder panel mounts into #sidebar too, and does not fill it — so a right-click on the
    // blank area below it reaches Sidebar's host handler with no tree and no root. There is
    // nothing to create into; the pre-branch code could assume a root here, this cannot.
    if (!entry && !root) return
    const dir = entry ? (entry.isDir ? entry.path : entry.path.replace(/[\\/][^\\/]+$/, '')) : root!
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
    const name = await promptInput('New file name', { focusFallback: this.d.focusEditor }); if (!name) return
    if (await window.api.createFile(dir.replace(/[\\/]$/, '') + '/' + name)) await this.refreshDir(dir)
    else toast('Could not create file (already exists?).', 'error')
  }
  private async newFolder(dir: string): Promise<void> {
    const name = await promptInput('New folder name', { focusFallback: this.d.focusEditor }); if (!name) return
    if (await window.api.createFolder(dir.replace(/[\\/]$/, '') + '/' + name)) await this.refreshDir(dir)
    else toast('Could not create folder (already exists?).', 'error')
  }
  private async rename(entry: DirEntry): Promise<void> {
    const name = await promptInput('Rename', { initial: entry.name, focusFallback: this.d.focusEditor }); if (!name || name === entry.name) return
    const parent = entry.path.replace(/[\\/][^\\/]+$/, '')
    if (await window.api.renamePath(entry.path, parent + '/' + name)) await this.refreshDir(parent)
    else toast('Could not rename (name in use?).', 'error')
  }
  private async remove(entry: DirEntry): Promise<void> {
    if (!await confirmDialog(`Delete "${entry.name}"? It will be moved to the Recycle Bin.`, { focusFallback: this.d.focusEditor })) return
    const parent = entry.path.replace(/[\\/][^\\/]+$/, '')
    if (await window.api.trashPath(entry.path)) { await this.refreshDir(parent); toast(`Moved "${entry.name}" to Recycle Bin.`, 'success') }
    else toast('Could not delete.', 'error')
  }

  private refreshDir(_dir: string): Promise<void> { return this.refresh.request() }
}
