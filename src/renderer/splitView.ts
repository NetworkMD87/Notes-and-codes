import Split from 'split.js'
import { EditorPane } from './editorPane'

export class SplitView {
  readonly paneA: EditorPane
  readonly paneB: EditorPane
  private split: ReturnType<typeof Split> | null = null
  private focused: 'A' | 'B' = 'A'

  constructor(private aEl: HTMLElement, private bEl: HTMLElement) {
    this.paneA = new EditorPane(aEl)
    this.paneB = new EditorPane(bEl)
    aEl.addEventListener('focusin', () => { this.focused = 'A' })
    bEl.addEventListener('focusin', () => { this.focused = 'B' })
  }

  isSplit(): boolean { return this.split !== null }
  focusedPane(): 'A' | 'B' { return this.focused }

  setSplit(on: boolean): void {
    if (on && !this.split) {
      this.bEl.classList.remove('hidden')
      // Panes are flexbox items (`.pane { flex: 1 }`), so a plain `width` (Split.js's
      // default) is ignored by flex-grow. Size via flex-basis instead so dragging works.
      this.split = Split([this.aEl, this.bEl], {
        sizes: [50, 50],
        minSize: 120,
        gutterSize: 6,
        elementStyle: (_dim, size, gutterSize) => ({ 'flex-basis': `calc(${size}% - ${gutterSize}px)` }),
        gutterStyle: (_dim, gutterSize) => ({ 'flex-basis': `${gutterSize}px` })
      })
    } else if (!on && this.split) {
      this.split.destroy()
      this.split = null
      // Clear the inline flex-basis so the single remaining pane fills the row again.
      this.aEl.style.flexBasis = ''
      this.bEl.style.flexBasis = ''
      this.bEl.classList.add('hidden')
      this.focused = 'A'
    }
    this.paneA.layout(); this.paneB.layout()
  }
}
