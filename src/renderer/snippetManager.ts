import type { Snippet } from '../shared/types'
import { DialogController } from './dialogController'
import { emptyState, EMPTY_ICONS } from './emptyState'

export interface SnippetManagerDeps {
  list: () => Snippet[]
  add: () => Snippet
  rename: (id: string, name: string) => void
  updateBody: (id: string, body: string) => void
  remove: (id: string) => void
  persist: () => void
}

export class SnippetManager {
  private overlay: HTMLDivElement
  private box: HTMLDivElement
  private listEl: HTMLDivElement
  private addButton: HTMLButtonElement
  private dialog: DialogController

  constructor(host: HTMLElement, private deps: SnippetManagerDeps, focusEditor: () => void) {
    this.dialog = new DialogController(focusEditor)
    this.overlay = document.createElement('div')
    this.overlay.className = 'snip-mgr hidden'
    this.box = document.createElement('div'); this.box.className = 'snip-mgr-box'
    const head = document.createElement('div'); head.className = 'snip-mgr-head'
    const title = document.createElement('h2'); title.id = 'snippet-manager-title'; title.textContent = 'Snippets'
    this.addButton = document.createElement('button'); this.addButton.type = 'button'; this.addButton.textContent = '+ Add'; this.addButton.setAttribute('aria-label', 'Add snippet')
    this.addButton.onclick = () => { this.deps.add(); this.deps.persist(); this.render() }
    const closeBtn = document.createElement('button'); closeBtn.type = 'button'; closeBtn.textContent = 'Close'; closeBtn.setAttribute('aria-label', 'Close Snippets')
    closeBtn.onclick = () => this.close()
    head.append(title, this.addButton, closeBtn)
    this.listEl = document.createElement('div'); this.listEl.className = 'snip-mgr-list'
    this.box.append(head, this.listEl)
    this.overlay.appendChild(this.box)
    host.appendChild(this.overlay)
    this.overlay.addEventListener('click', (e) => { if (e.target === this.overlay) this.close() })
    // Escape handled centrally by overlayManager.
  }

  open(): void {
    this.render()
    this.overlay.classList.remove('hidden')
    this.dialog.open({ panel: this.box, labelledBy: 'snippet-manager-title', initialFocus: this.addButton, requestClose: () => this.close() })
  }
  private close(): void { this.overlay.classList.add('hidden'); this.dialog.close() }

  private render(): void {
    this.listEl.replaceChildren(...this.deps.list().map(s => {
      const row = document.createElement('div'); row.className = 'snip-mgr-row'
      const name = document.createElement('input'); name.value = s.name; name.className = 'snip-mgr-name'; name.setAttribute('aria-label', `Snippet name: ${s.name}`)
      name.onchange = () => {
        const currentName = name.value.trim() || 'Untitled'
        this.deps.rename(s.id, currentName)
        this.deps.persist()
        name.setAttribute('aria-label', `Snippet name: ${currentName}`)
        body.setAttribute('aria-label', `Snippet body: ${currentName}`)
        del.setAttribute('aria-label', `Delete snippet ${currentName}`)
      }
      const body = document.createElement('textarea'); body.value = s.body; body.className = 'snip-mgr-body'; body.setAttribute('aria-label', `Snippet body: ${s.name}`)
      body.onchange = () => { this.deps.updateBody(s.id, body.value); this.deps.persist() }
      const del = document.createElement('button'); del.type = 'button'; del.textContent = 'Delete'; del.setAttribute('aria-label', `Delete snippet ${s.name}`)
      del.onclick = () => { this.deps.remove(s.id); this.deps.persist(); this.render() }
      row.append(name, body, del)
      return row
    }))
    if (!this.deps.list().length) {
      this.listEl.appendChild(emptyState('snip-mgr-empty', EMPTY_ICONS.snippet, 'No snippets yet — click "+ Add".'))
    }
  }
}
