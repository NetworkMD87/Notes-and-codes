import type { Snippet } from '../shared/types'

export class SnippetPicker {
  private overlay: HTMLDivElement
  private listEl: HTMLDivElement
  private onPick: ((s: Snippet) => void) | null = null

  constructor(host: HTMLElement) {
    this.overlay = document.createElement('div')
    this.overlay.className = 'snip-picker hidden'
    this.listEl = document.createElement('div')
    this.listEl.className = 'snip-list'
    this.overlay.appendChild(this.listEl)
    host.appendChild(this.overlay)
    this.overlay.addEventListener('click', (e) => { if (e.target === this.overlay) this.close() })
    this.overlay.addEventListener('keydown', (e) => { if (e.key === 'Escape') this.close() })
  }

  open(items: Snippet[], onPick: (s: Snippet) => void): void {
    this.onPick = onPick
    this.listEl.replaceChildren(...items.map(s => {
      const row = document.createElement('div')
      row.className = 'snip-row'
      row.textContent = s.name
      row.title = s.body.slice(0, 2000)
      row.onclick = () => { this.close(); this.onPick?.(s) }
      return row
    }))
    if (!items.length) { const e = document.createElement('div'); e.className = 'snip-row'; e.textContent = '(no snippets yet)'; this.listEl.appendChild(e) }
    this.overlay.classList.remove('hidden')
    this.overlay.setAttribute('tabindex', '-1')
    this.overlay.focus()
  }
  private close(): void { this.overlay.classList.add('hidden') }
}
