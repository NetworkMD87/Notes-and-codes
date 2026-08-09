import type { Snippet } from '../shared/types'
import { DialogController } from './dialogController'

export class SnippetPicker {
  private overlay: HTMLDivElement
  private listEl: HTMLDivElement
  private closeButton: HTMLButtonElement
  private onPick: ((s: Snippet) => void) | null = null
  private dialog: DialogController

  constructor(host: HTMLElement, focusEditor: () => void) {
    this.dialog = new DialogController(focusEditor)
    this.overlay = document.createElement('div')
    this.overlay.className = 'snip-picker hidden'
    const box = document.createElement('div')
    box.className = 'snip-list snip-picker-box'
    const head = document.createElement('div')
    head.className = 'snip-picker-head'
    const title = document.createElement('h2')
    title.id = 'snippet-picker-title'
    title.textContent = 'Insert Snippet'
    this.closeButton = document.createElement('button')
    this.closeButton.type = 'button'
    this.closeButton.className = 'snip-picker-close'
    this.closeButton.setAttribute('aria-label', 'Close Insert Snippet')
    this.closeButton.textContent = 'Close'
    this.closeButton.onclick = () => this.close()
    head.append(title, this.closeButton)
    this.listEl = document.createElement('div')
    this.listEl.className = 'snip-picker-rows'
    box.append(head, this.listEl)
    this.overlay.appendChild(box)
    host.appendChild(this.overlay)
    this.overlay.addEventListener('click', (e) => { if (e.target === this.overlay) this.close() })
    // Escape handled centrally by overlayManager.
  }

  open(items: Snippet[], onPick: (s: Snippet) => void): void {
    this.onPick = onPick
    const rows = items.map(s => {
      const row = document.createElement('button')
      row.type = 'button'
      row.className = 'snip-row'
      row.textContent = s.name
      row.title = s.body.slice(0, 2000)
      row.setAttribute('aria-label', `Insert snippet ${s.name}`)
      row.onclick = () => { const pick = this.onPick; this.close(); pick?.(s) }
      return row
    })
    this.listEl.replaceChildren(...rows)
    if (!items.length) { const e = document.createElement('div'); e.className = 'snip-row'; e.textContent = '(no snippets yet)'; this.listEl.appendChild(e) }
    this.overlay.classList.remove('hidden')
    this.dialog.open({ panel: this.overlay.querySelector<HTMLElement>('.snip-picker-box')!, labelledBy: 'snippet-picker-title', initialFocus: rows[0] ?? this.closeButton, requestClose: () => this.close() })
  }
  private close(): void { this.overlay.classList.add('hidden'); this.dialog.close() }
}
