import { ACCENT_PALETTE, HIGHLIGHT_COLOURS, type HighlightColour } from '../shared/types'

export interface ToolbarHandlers {
  open: () => void
  save: () => void
  openHistory: () => void
  toggleSplit: () => void
  togglePreview: () => void
  togglePin: () => void
  startDiff: () => void
  pasteFromHistory: () => void
  toggleHighlighter: () => void
  pickHighlightColour: (c: HighlightColour) => void
  clearHighlights: () => void
}

const S = 'viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"'
const ICONS = {
  open: `<svg ${S}><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>`,
  save: `<svg ${S}><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><path d="M17 21v-8H7v8"/><path d="M7 3v5h8"/></svg>`,
  split: `<svg ${S}><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="12" y1="3" x2="12" y2="21"/></svg>`,
  preview: `<svg ${S}><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg>`,
  diff: `<svg ${S}><circle cx="6" cy="6" r="3"/><circle cx="18" cy="18" r="3"/><path d="M6 9v6a3 3 0 0 0 3 3h6"/><path d="M18 15V9a3 3 0 0 0-3-3H9"/></svg>`,
  paste: `<svg ${S}><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1"/></svg>`,
  pin: `<svg ${S}><path d="M12 17v5"/><path d="M9 10.76V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v5.76l2 3.24H7z"/></svg>`,
  highlighter: `<svg ${S}><path d="m9 11-6 6v3h3l6-6"/><path d="m17 7 3-3a1.4 1.4 0 0 0-2-2l-3 3"/><path d="m12 8 4 4"/><path d="M9 11l4 4"/></svg>`,
  history: `<svg ${S}><path d="M3 3v5h5"/><path d="M3.05 13A9 9 0 1 0 6 5.3L3 8"/><path d="M12 7v5l4 2"/></svg>`,
}

/** Solid swatch colours = the shared palette hexes (the editor highlights are the semi-transparent .hl-*). */
const HL_HEX = Object.fromEntries(
  ACCENT_PALETTE.map(c => [c.name.toLowerCase(), c.value]),
) as Record<HighlightColour, string>

export class Toolbar {
  private el: HTMLDivElement
  private splitBtn: HTMLButtonElement
  private previewBtn: HTMLButtonElement
  private pinBtn: HTMLButtonElement
  private hlBtn!: HTMLButtonElement

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
    this.hlBtn = mk('Highlighter — drag to paint, re-stroke same colour to erase', ICONS.highlighter, h.toggleHighlighter)
    const hlWrap = document.createElement('div')
    hlWrap.className = 'tb-hl-wrap'
    const caret = document.createElement('button')
    caret.className = 'tb-btn tb-caret'; caret.title = 'Highlight colour'; caret.textContent = '▾'
    const pop = document.createElement('div'); pop.className = 'tb-hl-pop hidden'
    for (const c of HIGHLIGHT_COLOURS) {
      const sw = document.createElement('button')
      sw.className = 'tb-swatch'; sw.title = c; sw.style.background = HL_HEX[c]
      sw.onclick = (e) => { e.stopPropagation(); h.pickHighlightColour(c); pop.classList.add('hidden') }
      pop.appendChild(sw)
    }
    const clearBtn = document.createElement('button')
    clearBtn.className = 'tb-hl-clear'; clearBtn.textContent = 'Clear highlights'
    clearBtn.onclick = (e) => { e.stopPropagation(); h.clearHighlights(); pop.classList.add('hidden') }
    pop.appendChild(clearBtn)
    caret.onclick = (e) => { e.stopPropagation(); pop.classList.toggle('hidden') }
    document.addEventListener('click', () => pop.classList.add('hidden'))
    hlWrap.append(this.hlBtn, caret, pop)
    this.syncHighlighter(false, 'yellow') // initial colour indicator (manager defaults to yellow)
    this.el.append(
      mk('Open file', ICONS.open, h.open),
      mk('Save', ICONS.save, h.save),
      mk('File History', ICONS.history, h.openHistory),
      sep(),
      this.splitBtn,
      this.previewBtn,
      this.pinBtn,
      sep(),
      hlWrap,
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

  syncHighlighter(on: boolean, colour: HighlightColour): void {
    this.hlBtn.classList.toggle('tb-active', on)
    this.hlBtn.style.boxShadow = `inset 0 -3px 0 ${HL_HEX[colour]}` // underline shows the active colour
    this.hlBtn.title = `Highlighter (${colour}) — drag to paint, re-stroke same colour to erase`
  }
}
