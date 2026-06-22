import * as monaco from 'monaco-editor'

export interface DiffSide { title: string; content: string; language: string }

export class DiffView {
  private editor: monaco.editor.IStandaloneDiffEditor | null = null
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
  }

  hide(): void {
    if (this.editor) {
      const m = this.editor.getModel()
      m?.original.dispose(); m?.modified.dispose()
      this.editor.dispose(); this.editor = null
    }
    this.container.classList.add('hidden')
  }
}
