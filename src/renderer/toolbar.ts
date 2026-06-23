export interface ToolbarHandlers {
  open: () => void
  save: () => void
  toggleSplit: () => void
  togglePreview: () => void
  togglePin: () => void
  startDiff: () => void
  pasteFromHistory: () => void
}

const S = 'viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"'
const ICONS = {
  open: `<svg ${S}><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>`,
  save: `<svg ${S}><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><path d="M17 21v-8H7v8"/><path d="M7 3v5h8"/></svg>`,
  split: `<svg ${S}><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="12" y1="3" x2="12" y2="21"/></svg>`,
  preview: `<svg ${S}><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg>`,
  diff: `<svg ${S}><circle cx="6" cy="6" r="3"/><circle cx="18" cy="18" r="3"/><path d="M6 9v6a3 3 0 0 0 3 3h6"/><path d="M18 15V9a3 3 0 0 0-3-3H9"/></svg>`,
  paste: `<svg ${S}><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1"/></svg>`,
  pin: `<svg ${S}><path d="M12 17v5"/><path d="M9 10.76V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v5.76l2 3.24H7z"/></svg>`
}

export class Toolbar {
  private el: HTMLDivElement
  private splitBtn: HTMLButtonElement
  private previewBtn: HTMLButtonElement
  private pinBtn: HTMLButtonElement

  constructor(host: HTMLElement, h: ToolbarHandlers) {
    this.el = document.createElement('div')
    this.el.id = 'toolbar'

    const mk = (title: string, svg: string, onClick: () => void): HTMLButtonElement => {
      const b = document.createElement('button')
      b.className = 'tb-btn'
      b.title = title
      b.innerHTML = svg
      b.onclick = onClick
      return b
    }
    const sep = (): HTMLSpanElement => {
      const s = document.createElement('span')
      s.className = 'tb-sep'
      return s
    }

    this.splitBtn = mk('Toggle split pane', ICONS.split, h.toggleSplit)
    this.previewBtn = mk('Toggle markdown preview', ICONS.preview, h.togglePreview)
    this.pinBtn = mk('Toggle always on top', ICONS.pin, h.togglePin)
    this.el.append(
      mk('Open file', ICONS.open, h.open),
      mk('Save', ICONS.save, h.save),
      sep(),
      this.splitBtn,
      this.previewBtn,
      this.pinBtn,
      sep(),
      mk('Start diff', ICONS.diff, h.startDiff),
      mk('Paste from history', ICONS.paste, h.pasteFromHistory)
    )
    host.appendChild(this.el)
  }

  syncToggles(state: { split: boolean; preview: boolean; pin: boolean }): void {
    this.splitBtn.classList.toggle('tb-active', state.split)
    this.previewBtn.classList.toggle('tb-active', state.preview)
    this.pinBtn.classList.toggle('tb-active', state.pin)
  }
}
