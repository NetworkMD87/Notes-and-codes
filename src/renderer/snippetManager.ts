import type { Snippet } from '../shared/types'

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
  private listEl: HTMLDivElement

  constructor(host: HTMLElement, private deps: SnippetManagerDeps) {
    this.overlay = document.createElement('div')
    this.overlay.className = 'snip-mgr hidden'
    const box = document.createElement('div'); box.className = 'snip-mgr-box'
    const head = document.createElement('div'); head.className = 'snip-mgr-head'
    const title = document.createElement('span'); title.textContent = 'Snippets'
    const addBtn = document.createElement('button'); addBtn.textContent = '+ Add'
    addBtn.onclick = () => { this.deps.add(); this.deps.persist(); this.render() }
    const closeBtn = document.createElement('button'); closeBtn.textContent = 'Close'
    closeBtn.onclick = () => this.close()
    head.append(title, addBtn, closeBtn)
    this.listEl = document.createElement('div'); this.listEl.className = 'snip-mgr-list'
    box.append(head, this.listEl)
    this.overlay.appendChild(box)
    host.appendChild(this.overlay)
    this.overlay.addEventListener('click', (e) => { if (e.target === this.overlay) this.close() })
    this.overlay.addEventListener('keydown', (e) => { if (e.key === 'Escape') this.close() })
  }

  open(): void { this.render(); this.overlay.classList.remove('hidden'); this.overlay.setAttribute('tabindex', '-1'); this.overlay.focus() }
  private close(): void { this.overlay.classList.add('hidden') }

  private render(): void {
    this.listEl.replaceChildren(...this.deps.list().map(s => {
      const row = document.createElement('div'); row.className = 'snip-mgr-row'
      const name = document.createElement('input'); name.value = s.name; name.className = 'snip-mgr-name'
      name.onchange = () => { this.deps.rename(s.id, name.value.trim() || 'Untitled'); this.deps.persist() }
      const body = document.createElement('textarea'); body.value = s.body; body.className = 'snip-mgr-body'
      body.onchange = () => { this.deps.updateBody(s.id, body.value); this.deps.persist() }
      const del = document.createElement('button'); del.textContent = 'Delete'
      del.onclick = () => { this.deps.remove(s.id); this.deps.persist(); this.render() }
      row.append(name, body, del)
      return row
    }))
    if (!this.deps.list().length) {
      const empty = document.createElement('div'); empty.className = 'snip-mgr-empty'; empty.textContent = 'No snippets. Click "+ Add".'
      this.listEl.appendChild(empty)
    }
  }
}
