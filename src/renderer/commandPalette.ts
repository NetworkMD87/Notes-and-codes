export interface Command { id: string; label: string; run: () => void }

export class CommandPalette {
  private commands: Command[] = []
  private overlay: HTMLDivElement
  private input: HTMLInputElement
  private listEl: HTMLDivElement
  private filtered: Command[] = []
  private cursor = 0

  constructor() {
    this.overlay = document.createElement('div'); this.overlay.id = 'palette'; this.overlay.className = 'hidden'
    this.input = document.createElement('input'); this.input.placeholder = 'Type a command…'
    this.listEl = document.createElement('div'); this.listEl.className = 'palette-list'
    this.overlay.append(this.input, this.listEl)
    document.body.appendChild(this.overlay)
    this.input.addEventListener('input', () => this.refresh())
    this.input.addEventListener('keydown', (e) => this.onKey(e))
    this.overlay.addEventListener('click', (e) => { if (e.target === this.overlay) this.close() })
  }

  register(cmd: Command): void { this.commands.push(cmd) }

  open(): void {
    this.overlay.classList.remove('hidden'); this.input.value = ''; this.refresh(); this.input.focus()
  }
  close(): void { this.overlay.classList.add('hidden') }

  private refresh(): void {
    const q = this.input.value.toLowerCase()
    this.filtered = this.commands.filter(c => c.label.toLowerCase().includes(q))
    this.cursor = 0
    this.listEl.replaceChildren(...this.filtered.map((c, i) => {
      const row = document.createElement('div')
      row.className = 'palette-row' + (i === this.cursor ? ' active' : '')
      row.textContent = c.label
      row.onclick = () => { c.run(); this.close() }
      return row
    }))
  }

  private onKey(e: KeyboardEvent): void {
    if (e.key === 'Escape') return this.close()
    if (e.key === 'ArrowDown') { this.cursor = Math.min(this.cursor + 1, this.filtered.length - 1); this.paint() }
    if (e.key === 'ArrowUp') { this.cursor = Math.max(this.cursor - 1, 0); this.paint() }
    if (e.key === 'Enter') { const c = this.filtered[this.cursor]; if (c) { c.run(); this.close() } }
  }
  private paint(): void {
    [...this.listEl.children].forEach((el, i) => el.classList.toggle('active', i === this.cursor))
  }
}
