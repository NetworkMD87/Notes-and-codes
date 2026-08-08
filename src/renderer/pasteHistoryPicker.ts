import { DialogController } from './dialogController'

export class PasteHistoryPicker {
  private overlay: HTMLDivElement
  private listEl: HTMLDivElement
  private closeButton: HTMLButtonElement
  private onPick: ((text: string) => void) | null = null
  private dialog: DialogController

  constructor(host: HTMLElement, focusEditor: () => void) {
    this.dialog = new DialogController(focusEditor)
    this.overlay = document.createElement('div')
    this.overlay.className = 'ph-picker hidden'
    const box = document.createElement('div')
    box.className = 'ph-list ph-picker-box'
    const head = document.createElement('div')
    head.className = 'ph-picker-head'
    const title = document.createElement('h2')
    title.id = 'paste-history-title'
    title.textContent = 'Paste from History'
    this.closeButton = document.createElement('button')
    this.closeButton.type = 'button'
    this.closeButton.className = 'ph-picker-close'
    this.closeButton.setAttribute('aria-label', 'Close Paste from History')
    this.closeButton.textContent = 'Close'
    this.closeButton.onclick = () => this.close()
    head.append(title, this.closeButton)
    this.listEl = document.createElement('div')
    this.listEl.className = 'ph-picker-rows'
    box.append(head, this.listEl)
    this.overlay.appendChild(box)
    host.appendChild(this.overlay)
    this.overlay.addEventListener('click', (e) => { if (e.target === this.overlay) this.close() })
    // Escape handled centrally by overlayManager.
  }

  open(entries: string[], onPick: (text: string) => void): void {
    this.onPick = onPick
    const rows = entries.map(text => {
      const preview = text.replace(/\s+/g, ' ').slice(0, 120) || '(empty)'
      const row = document.createElement('button')
      row.type = 'button'
      row.className = 'ph-row'
      row.textContent = preview
      row.title = text.slice(0, 2000)
      row.setAttribute('aria-label', `Paste ${preview}`)
      row.onclick = () => { const pick = this.onPick; this.close(); pick?.(text) }
      return row
    })
    this.listEl.replaceChildren(...rows)
    if (entries.length === 0) { const e = document.createElement('div'); e.className = 'ph-row'; e.textContent = '(no history yet)'; this.listEl.appendChild(e) }
    this.overlay.classList.remove('hidden')
    this.dialog.open({ panel: this.overlay.querySelector<HTMLElement>('.ph-picker-box')!, labelledBy: 'paste-history-title', initialFocus: rows[0] ?? this.closeButton, requestClose: () => this.close() })
  }

  private close(): void { this.overlay.classList.add('hidden'); this.dialog.close() }
}
