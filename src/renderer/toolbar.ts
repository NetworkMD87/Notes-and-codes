import { HIGHLIGHT_COLOURS, HL_HEX, type HighlightColour, type MarkdownPreviewMode, type MarkdownPreviewVisibleMode } from '../shared/types'
import { showContextMenu } from './contextMenu'
import type { MarkdownAction } from './markdownEditing'

export interface ToolbarHandlers {
  open: () => void
  save: () => void
  openHistory: () => void
  toggleSplit: () => void
  togglePreview: () => void
  setPreviewMode: (mode: MarkdownPreviewMode) => void
  applyMarkdown: (action: MarkdownAction) => void
  togglePin: () => void
  startDiff: () => void
  pasteFromHistory: () => void
  toggleHighlighter: () => void
  pickHighlightColour: (c: HighlightColour) => void
  clearHighlights: () => void
  openSettings: () => void
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
  // Chisel marker — the pen cursor's silhouette (penCursor.ts) scaled to this 24 viewBox and drawn
  // stroke-only, so the button matches the pointer without leaving the row's icon language.
  highlighter: `<svg ${S}><path d="M9.5 12.5 17 5l3 3-7.5 7.5z"/><path d="M9.5 12.5 12.5 15.5 3.5 20.5z"/></svg>`,
  history: `<svg ${S}><path d="M3 3v5h5"/><path d="M3.05 13A9 9 0 1 0 6 5.3L3 8"/><path d="M12 7v5l4 2"/></svg>`,
  gear: `<svg ${S}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`,
}

export class Toolbar {
  private el: HTMLDivElement
  private splitBtn: HTMLButtonElement
  private previewBtn: HTMLButtonElement
  private previewCaret: HTMLButtonElement
  private previewMode: MarkdownPreviewMode = 'off'
  private markdownTools: HTMLButtonElement
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
    this.previewBtn = mk('Show Markdown preview side by side', ICONS.preview, h.togglePreview)
    this.previewBtn.dataset.toolbar = 'markdown-preview-toggle'
    this.previewBtn.setAttribute('aria-label', 'Show Markdown preview side by side')
    this.previewBtn.setAttribute('aria-pressed', 'false')
    const previewWrap = document.createElement('div')
    previewWrap.className = 'tb-preview-wrap'
    this.previewCaret = document.createElement('button')
    this.previewCaret.className = 'tb-btn tb-caret'
    this.previewCaret.dataset.toolbar = 'markdown-preview-mode'
    this.previewCaret.title = 'Choose Markdown preview mode'
    this.previewCaret.textContent = '▾'
    this.previewCaret.setAttribute('aria-label', 'Choose Markdown preview mode')
    this.previewCaret.setAttribute('aria-haspopup', 'menu')
    this.previewCaret.onclick = () => {
      const rect = this.previewCaret.getBoundingClientRect()
      showContextMenu(rect.left, rect.bottom, [
        { label: 'Side by side', checked: this.previewMode === 'side-by-side', run: () => h.setPreviewMode('side-by-side') },
        { label: 'Focus', checked: this.previewMode === 'focus', run: () => h.setPreviewMode('focus') },
        { label: 'Off', checked: this.previewMode === 'off', run: () => h.setPreviewMode('off') },
      ], { opener: this.previewCaret, focusFirst: true })
    }
    previewWrap.append(this.previewBtn, this.previewCaret)
    this.markdownTools = document.createElement('button')
    this.markdownTools.className = 'tb-btn'
    this.markdownTools.dataset.toolbar = 'markdown-tools'
    this.markdownTools.title = 'Markdown tools'
    this.markdownTools.textContent = 'MD ▾'
    this.markdownTools.setAttribute('aria-label', 'Markdown tools')
    this.markdownTools.setAttribute('aria-haspopup', 'menu')
    this.markdownTools.onclick = () => {
      const rect = this.markdownTools.getBoundingClientRect()
      const actions: Array<[string, MarkdownAction]> = [
        ['Heading', 'heading'], ['Bold', 'bold'], ['Italic', 'italic'], ['Link', 'link'],
        ['Inline code', 'inline-code'], ['Code block', 'code-block'], ['Quote', 'quote'],
        ['Bulleted list', 'bulleted-list'], ['Numbered list', 'numbered-list'], ['Task list', 'task-list'],
      ]
      showContextMenu(rect.left, rect.bottom, actions.map(([label, action]) => ({ label, run: () => h.applyMarkdown(action) })), {
        opener: this.markdownTools,
        focusFirst: true,
      })
    }
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
      previewWrap,
      this.markdownTools,
      this.pinBtn,
      sep(),
      hlWrap,
      mk('Start diff', ICONS.diff, h.startDiff),
      mk('Paste from history', ICONS.paste, h.pasteFromHistory),
      sep(),
      mk('Settings', ICONS.gear, h.openSettings)
    )
    host.appendChild(this.el)
  }

  syncToggles(state: { split: boolean; pin: boolean }): void {
    this.splitBtn.classList.toggle('tb-active', state.split)
    this.pinBtn.classList.toggle('tb-active', state.pin)
  }

  syncPreview(state: {
    available: boolean
    mode: MarkdownPreviewMode
    lastVisibleMode: MarkdownPreviewVisibleMode
  }): void {
    this.previewMode = state.mode
    this.previewBtn.disabled = !state.available
    this.previewCaret.disabled = !state.available
    const active = state.available && state.mode !== 'off'
    this.previewBtn.classList.toggle('tb-active', active)
    this.previewBtn.setAttribute('aria-pressed', String(active))
    const unavailable = 'Markdown preview is unavailable for non-Markdown files'
    const mainAction = !state.available
      ? unavailable
      : state.mode !== 'off'
        ? 'Turn Markdown preview off'
        : state.lastVisibleMode === 'focus'
          ? 'Show Markdown preview in Focus mode'
          : 'Show Markdown preview side by side'
    const chooserAction = state.available ? 'Choose Markdown preview mode' : unavailable
    this.previewBtn.title = mainAction
    this.previewBtn.setAttribute('aria-label', mainAction)
    this.previewCaret.title = chooserAction
    this.previewCaret.setAttribute('aria-label', chooserAction)
  }

  syncMarkdownTools(available: boolean): void {
    this.markdownTools.hidden = !available
  }

  syncHighlighter(on: boolean, colour: HighlightColour): void {
    this.hlBtn.classList.toggle('tb-active', on)
    this.hlBtn.style.boxShadow = `inset 0 -3px 0 ${HL_HEX[colour]}` // underline shows the active colour
    this.hlBtn.title = `Highlighter (${colour}) — drag to paint, re-stroke same colour to erase`
  }
}
