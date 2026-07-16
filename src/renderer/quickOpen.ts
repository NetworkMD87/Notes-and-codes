import { rankFiles } from './fuzzy'
import { pushOverlay } from './overlayManager'

export interface QuickOpenDeps {
  files: () => string[]
  truncated: () => boolean
  openFile: (path: string) => void
}

export class QuickOpen {
  private host: HTMLElement
  private input!: HTMLInputElement
  private listEl!: HTMLElement
  private results: string[] = []
  private active = 0
  private unreg?: () => void
  constructor(parent: HTMLElement, private d: QuickOpenDeps) {
    this.host = document.createElement('div')
    this.host.id = 'quick-open'; this.host.className = 'hidden'
    this.host.addEventListener('mousedown', (e) => { if (e.target === this.host) this.close() })
    parent.appendChild(this.host)
  }

  open(): void {
    const box = document.createElement('div'); box.className = 'qo-box'
    this.input = document.createElement('input'); this.input.placeholder = 'Go to file…'
    this.listEl = document.createElement('div'); this.listEl.className = 'qo-list'
    box.append(this.input, this.listEl)
    if (this.d.truncated()) {
      const note = document.createElement('div'); note.className = 'qo-note'
      note.textContent = 'Index truncated — some files may not appear.'
      box.append(note)
    }
    this.host.replaceChildren(box)
    this.host.classList.remove('hidden')
    this.unreg = pushOverlay(() => this.close())
    this.input.addEventListener('input', () => this.refresh())
    this.input.addEventListener('keydown', (e) => this.onKey(e))
    this.refresh()
    this.input.focus()
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

  private close(): void { this.unreg?.(); this.unreg = undefined; this.host.classList.add('hidden') }
}
