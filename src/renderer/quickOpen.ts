import { rankFileCandidates, type QuickOpenCandidate } from './fuzzy'
import { DialogController } from './dialogController'

export interface QuickOpenDeps {
  candidates: () => readonly QuickOpenCandidate[]
  truncated: () => boolean
  openFile: (path: string) => void
  focusEditor: () => void
}

export class QuickOpen {
  private host: HTMLElement
  private input!: HTMLInputElement
  private listEl!: HTMLElement
  private statusEl!: HTMLElement
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
    this.input.setAttribute('aria-autocomplete', 'list'); this.input.setAttribute('aria-controls', 'quick-open-results')
    this.listEl = document.createElement('div'); this.listEl.id = 'quick-open-results'
    this.listEl.className = 'qo-list'; this.listEl.setAttribute('role', 'listbox')
    this.statusEl = document.createElement('div'); this.statusEl.setAttribute('role', 'status')
    box.append(title, this.input, this.listEl, this.statusEl)
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
    this.results = rankFileCandidates(this.input.value, this.d.candidates(), 50)
      .map(result => result.path)
    this.active = 0
    this.renderList()
  }

  private renderList(): void {
    const hasMatches = this.results.length > 0
    this.input.removeAttribute('aria-activedescendant')
    this.input.setAttribute('aria-expanded', String(hasMatches))
    this.listEl.hidden = !hasMatches
    this.listEl.replaceChildren(...this.results.map((path, i) => {
      const name = path.split(/[\\/]/).pop() ?? path
      const row = document.createElement('div')
      row.id = `quick-open-option-${i}`; row.className = 'qo-row'; row.setAttribute('role', 'option')
      const nm = document.createElement('span'); nm.className = 'qo-name'; nm.textContent = name
      const pa = document.createElement('span'); pa.className = 'qo-path'; pa.textContent = path
      row.append(nm, pa)
      row.onclick = () => this.choose(i)
      return row
    }))
    const status = hasMatches ? '' : 'No matching files'
    this.statusEl.classList.toggle('qo-note', !hasMatches)
    if (this.statusEl.textContent !== status) this.statusEl.textContent = status
    this.paintActive()
  }

  private paintActive(): void {
    for (const [i, row] of Array.from(this.listEl.children).entries()) {
      const selected = i === this.active
      row.classList.toggle('active', selected)
      row.setAttribute('aria-selected', String(selected))
      if (selected) {
        this.input.setAttribute('aria-activedescendant', row.id)
        row.scrollIntoView({ block: 'nearest' })
      }
    }
  }

  private onKey(e: KeyboardEvent): void {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      if (!this.results.length) return
      const step = e.key === 'ArrowDown' ? 1 : -1
      const next = Math.max(0, Math.min(this.active + step, this.results.length - 1))
      if (next === this.active) return
      this.active = next
      this.paintActive()
    }
    else if (e.key === 'Enter') { e.preventDefault(); this.choose(this.active) }
    // Escape handled centrally by overlayManager.
  }

  private choose(i: number): void {
    const path = this.results[i]
    if (path) { this.close(); this.d.openFile(path) }
  }

  private close(): void { this.host.classList.add('hidden'); this.dialog.close() }
}
