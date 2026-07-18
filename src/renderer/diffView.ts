import * as monaco from 'monaco-editor'
import { pushOverlay } from './overlayManager'

export interface DiffSide { title: string; content: string; language: string }

export class DiffView {
  private editor: monaco.editor.IStandaloneDiffEditor | null = null
  private closeBtn: HTMLButtonElement | null = null
  private unreg?: () => void
  constructor(private container: HTMLElement) {}

  isOpen(): boolean { return this.editor !== null }

  show(left: DiffSide, right: DiffSide): void {
    this.hide()
    this.container.classList.remove('hidden')
    // No `theme` here: Monaco's theme is GLOBAL across every editor instance. The panes
    // already hold the correct resolved theme (ThemeController.apply → monaco.editor.setTheme),
    // so the diff inherits it. Passing a theme re-set the global theme — and the old
    // `dataset.theme === 'dark' ? 'vs-dark' : 'vs'` mapped all 9 dark themes whose id isn't
    // literally 'dark' (Monokai, Dracula, Nord, …) to the light 'vs', turning every pane white.
    this.editor = monaco.editor.createDiffEditor(this.container, {
      readOnly: true, automaticLayout: true
    })
    this.editor.setModel({
      original: monaco.editor.createModel(left.content, left.language),
      modified: monaco.editor.createModel(right.content, right.language)
    })
    this.addCloseButton()
    this.unreg = pushOverlay(() => this.hide())
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
    this.unreg?.(); this.unreg = undefined
    if (this.editor) {
      const m = this.editor.getModel()
      m?.original.dispose(); m?.modified.dispose()
      this.editor.dispose(); this.editor = null
    }
    this.closeBtn?.remove(); this.closeBtn = null
    this.container.classList.add('hidden')
  }
}
