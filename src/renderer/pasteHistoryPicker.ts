export class PasteHistoryPicker {
  private overlay: HTMLDivElement
  private listEl: HTMLDivElement
  private onPick: ((text: string) => void) | null = null

  constructor(host: HTMLElement) {
    this.overlay = document.createElement('div')
    this.overlay.className = 'ph-picker hidden'
    this.listEl = document.createElement('div')
    this.listEl.className = 'ph-list'
    this.overlay.appendChild(this.listEl)
    host.appendChild(this.overlay)
    this.overlay.addEventListener('click', (e) => { if (e.target === this.overlay) this.close() })
    this.overlay.addEventListener('keydown', (e) => { if (e.key === 'Escape') this.close() })
  }

  open(entries: string[], onPick: (text: string) => void): void {
    this.onPick = onPick
    this.listEl.replaceChildren(...entries.map(text => {
      const row = document.createElement('div')
      row.className = 'ph-row'
      row.textContent = text.replace(/\s+/g, ' ').slice(0, 120) || '(empty)'
      row.title = text.slice(0, 2000)
      row.onclick = () => { this.close(); this.onPick?.(text) }
      return row
    }))
    if (entries.length === 0) { const e = document.createElement('div'); e.className = 'ph-row'; e.textContent = '(no history yet)'; this.listEl.appendChild(e) }
    this.overlay.classList.remove('hidden')
    this.overlay.setAttribute('tabindex', '-1')
    this.overlay.focus()
  }

  private close(): void { this.overlay.classList.add('hidden') }
}
