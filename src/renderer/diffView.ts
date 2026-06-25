import * as monaco from 'monaco-editor'

export interface DiffSide { title: string; content: string; language: string }

export class DiffView {
  private editor: monaco.editor.IStandaloneDiffEditor | null = null
  private closeBtn: HTMLButtonElement | null = null
  constructor(private container: HTMLElement) {}

  isOpen(): boolean { return this.editor !== null }

  show(left: DiffSide, right: DiffSide): void {
    this.hide()
    this.container.classList.remove('hidden')
    this.editor = monaco.editor.createDiffEditor(this.container, {
      readOnly: true, automaticLayout: true, theme: document.body.dataset.theme === 'dark' ? 'vs-dark' : 'vs'
    })
    this.editor.setModel({
      original: monaco.editor.createModel(left.content, left.language),
      modified: monaco.editor.createModel(right.content, right.language)
    })
    this.addCloseButton()
  }

  // Floating ✕ so the diff is discoverably exitable (Esc still works); sits
  // above Monaco's minimap canvas via z-index per the overlay convention.
  private addCloseButton(): void {
    const btn = document.createElement('button')
    btn.className = 'diff-close'
    btn.title = 'Close diff (Esc)'
    btn.setAttribute('aria-label', 'Close diff')
    btn.textContent = '✕'
    btn.addEventListener('click', () => this.hide())
    this.container.appendChild(btn)
    this.closeBtn = btn
  }

  hide(): void {
    if (this.editor) {
      const m = this.editor.getModel()
      m?.original.dispose(); m?.modified.dispose()
      this.editor.dispose(); this.editor = null
    }
    this.closeBtn?.remove(); this.closeBtn = null
    this.container.classList.add('hidden')
  }
}
