import { emptyState, EMPTY_ICONS } from './emptyState'
import { splitPath } from './recentFolders'

export interface FolderPanelDeps {
  pickFolder: () => Promise<void>
  recents: () => Promise<string[]>
  /** Open a recent folder, or prune it and report it gone. Owned by FolderMode so the panel and
   *  the header switcher cannot drift apart on what a dead entry does. */
  chooseRecent: (path: string) => Promise<'opened' | 'gone'>
  clearRecents: () => Promise<void>
}

/** The no-folder view of #sidebar: an empty state, a way to open a folder, and the recent-folder
 *  list. FolderMode owns which view is mounted (tree vs panel), so this module never touches the
 *  tree and Sidebar never has to know the panel exists. */
export class FolderPanel {
  constructor(private host: HTMLElement, private d: FolderPanelDeps) {}

  async render(): Promise<void> {
    const panel = document.createElement('div')
    panel.className = 'sb-panel'
    panel.appendChild(emptyState('sb-panel-empty', EMPTY_ICONS.folder, 'No folder open'))
    const btn = document.createElement('button')
    btn.className = 'sb-open-btn'
    btn.textContent = 'Open Folder…'
    btn.onclick = () => void this.d.pickFolder()
    panel.appendChild(btn)
    // Mount the shell before awaiting the store, so the panel appears immediately. A render that
    // is superseded while awaiting appends to its own detached panel and is simply discarded.
    this.host.replaceChildren(panel)

    const recents = await this.d.recents()
    if (!recents.length) {
      // Stamped only once the recents round-trip has resolved, and carrying the resolved count, so
      // a test can assert on a positive fact. A bare `[data-rendered] .sb-recent-row` count of 0 is
      // also satisfied by this panel not being in the DOM yet — which is true for the whole IPC
      // round-trip, because replaceChildren() mounts a fresh panel before the await.
      panel.dataset.recents = String(recents.length)
      return
    }
    const head = document.createElement('div')
    head.className = 'sb-header'
    head.textContent = 'Recent'
    const list = document.createElement('div')
    list.className = 'sb-recent'
    for (const path of recents) list.appendChild(this.recentRow(path))
    const clear = document.createElement('button')
    clear.className = 'sb-clear'
    clear.textContent = 'Clear'
    clear.onclick = () => void this.d.clearRecents().then(() => this.render())
    panel.append(head, list, clear)
    // Stamped after the rows are appended, so a completed render is never observable without them.
    panel.dataset.recents = String(recents.length)
  }

  private recentRow(path: string): HTMLElement {
    const { name, parent } = splitPath(path)
    const row = document.createElement('div')
    row.className = 'sb-recent-row'
    row.dataset.path = path
    row.title = path
    const nm = document.createElement('span'); nm.className = 'sb-recent-name'; nm.textContent = name
    const pa = document.createElement('span'); pa.className = 'sb-recent-parent'; pa.textContent = parent
    row.append(nm, pa)
    row.onclick = () => void this.choose(path)
    return row
  }

  private async choose(path: string): Promise<void> {
    // 'opened' replaces this whole view with the tree, so only the 'gone' case needs a repaint.
    if (await this.d.chooseRecent(path) === 'gone') await this.render()
  }
}
