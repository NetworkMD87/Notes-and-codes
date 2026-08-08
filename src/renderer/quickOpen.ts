import { rankFiles } from './fuzzy'
import { DialogController } from './dialogController'

export interface QuickOpenDeps {
  files: () => string[]
  truncated: () => boolean
  openFile: (path: string) => void
  focusEditor: () => void
}

export class QuickOpen {
  private host: HTMLElement
  private input!: HTMLInputElement
  private listEl!: HTMLElement
  private results: string[] = []
  private active = 0
  private dialog: DialogController
  constructor(parent: HTMLElement, private d: QuickOpenDeps) {
    this.dialog = new DialogController(d.focusEditor)
    this.host = document.createElement('div')
    this.host.id = 'quick-open'; this.host.className = 'hidden'
    this.host.addEventListener('mousedown', (e) => { if (e.target === this.host) this.close() })
    parent.appendChild(this.host)
  }

  open(): void {
    const box = document.createElement('div'); box.className = 'qo-box'
    const title = document.createElement('h2')
    title.id = 'quick-open-title'; title.textContent = 'Quick Open'; title.className = 'sr-only'
    this.input = document.createElement('input'); this.input.type = 'search'; this.input.placeholder = 'Go to file…'
    this.input.setAttribute('role', 'combobox'); this.input.setAttribute('aria-label', 'Quick Open')
    this.input.setAttribute('aria-controls', 'quick-open-results'); this.input.setAttribute('aria-expanded', 'true')
    this.listEl = document.createElement('div'); this.listEl.id = 'quick-open-results'
    this.listEl.className = 'qo-list'; this.listEl.setAttribute('role', 'listbox')
    box.append(title, this.input, this.listEl)
    if (this.d.truncated()) {
      const note = document.createElement('div'); note.className = 'qo-note'
      note.textContent = 'Index truncated — some files may not appear.'
      box.append(note)
    }
    this.host.replaceChildren(box)
    this.host.classList.remove('hidden')
    this.dialog.open({ panel: box, labelledBy: title.id, initialFocus: this.input, requestClose: () => this.close() })
    this.input.addEventListener('input', () => this.refresh())
    this.input.addEventListener('keydown', (e) => this.onKey(e))
    this.refresh()
  }

  private refresh(): void {
    this.results = rankFiles(this.input.value, this.d.files(), 50).map(r => r.path)
    this.active = 0
    this.renderList()
  }

  private renderList(): void {
    this.listEl.replaceChildren()
    this.results.forEach((path, i) => {
      const name = path.split(/[\\/]/).pop() ?? path
      const row = document.createElement('div')
      row.className = 'qo-row' + (i === this.active ? ' active' : '')
      const nm = document.createElement('span'); nm.className = 'qo-name'; nm.textContent = name
      const pa = document.createElement('span'); pa.className = 'qo-path'; pa.textContent = path
      row.append(nm, pa)
      row.onclick = () => this.choose(i)
      this.listEl.appendChild(row)
    })
  }

  private onKey(e: KeyboardEvent): void {
    if (e.key === 'ArrowDown') { e.preventDefault(); this.active = Math.min(this.active + 1, this.results.length - 1); this.renderList() }
    else if (e.key === 'ArrowUp') { e.preventDefault(); this.active = Math.max(this.active - 1, 0); this.renderList() }
    else if (e.key === 'Enter') { e.preventDefault(); this.choose(this.active) }
    // Escape handled centrally by overlayManager.
  }

  private choose(i: number): void {
    const path = this.results[i]
    if (path) { this.close(); this.d.openFile(path) }
  }

  private close(): void { this.host.classList.add('hidden'); this.dialog.close() }
}
