import * as monaco from 'monaco-editor'
import type { BufferState } from '../shared/types'

export class EditorPane {
  private editor: monaco.editor.IStandaloneCodeEditor
  private changeCb: ((content: string) => void) | null = null
  private lineNumbersOn = true
  private cursorListener: monaco.IDisposable | null = null
  private bufferId: string | null = null

  constructor(container: HTMLElement) {
    this.editor = monaco.editor.create(container, {
      value: '',
      language: 'plaintext',
      theme: 'vs-dark',
      automaticLayout: true,
      lineNumbers: 'on',
      minimap: { enabled: true }
    })
    this.editor.onDidChangeModelContent(() => {
      this.changeCb?.(this.editor.getValue())
    })
  }

  setBuffer(b: BufferState): void {
    this.bufferId = b.id
    const old = this.editor.getModel()
    const model = monaco.editor.createModel(b.content, b.language)
    this.editor.setModel(model)
    old?.dispose()
  }

  currentBufferId(): string | null { return this.bufferId }

  getContent(): string { return this.editor.getValue() }
  onChange(cb: (content: string) => void): void { this.changeCb = cb }
  setLineNumbers(on: boolean): void {
    this.lineNumbersOn = on
    this.editor.updateOptions({ lineNumbers: on ? 'on' : 'off' })
  }
  toggleLineNumbers(): boolean { this.setLineNumbers(!this.lineNumbersOn); return this.lineNumbersOn }
  lineNumbersVisible(): boolean { return this.lineNumbersOn }
  setTheme(theme: 'vs' | 'vs-dark'): void { monaco.editor.setTheme(theme) }

  getCursor(): { line: number; col: number } {
    const p = this.editor.getPosition()
    return { line: p?.lineNumber ?? 1, col: p?.column ?? 1 }
  }
  onCursor(cb: (pos: { line: number; col: number }) => void): void {
    this.cursorListener?.dispose()
    this.cursorListener = this.editor.onDidChangeCursorPosition(e => cb({ line: e.position.lineNumber, col: e.position.column }))
  }
  layout(): void { this.editor.layout() }
  dispose(): void { this.cursorListener?.dispose(); this.editor.getModel()?.dispose(); this.editor.dispose() }
}
