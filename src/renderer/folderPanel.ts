import { emptyState, EMPTY_ICONS } from './emptyState'

export interface FolderPanelDeps {
  pickFolder: () => Promise<void>
}

/** The no-folder view of #sidebar: an empty state plus a way to open a folder. FolderMode owns
 *  which view is mounted (tree vs panel), so this module never touches the tree and Sidebar
 *  never has to know the panel exists. */
export class FolderPanel {
  constructor(private host: HTMLElement, private d: FolderPanelDeps) {}

  render(): void {
    const panel = document.createElement('div')
    panel.className = 'sb-panel'
    panel.appendChild(emptyState('sb-panel-empty', EMPTY_ICONS.folder, 'No folder open'))
    const btn = document.createElement('button')
    btn.className = 'sb-open-btn'
    btn.textContent = 'Open Folder…'
    btn.onclick = () => void this.d.pickFolder()
    panel.appendChild(btn)
    this.host.replaceChildren(panel)
  }
}
