import * as monaco from 'monaco-editor'
import type { BufferState } from '../shared/types'

export class EditorPane {
  private editor: monaco.editor.IStandaloneCodeEditor
  private container: HTMLElement
  private changeCb: ((content: string) => void) | null = null
  private lineNumbersOn = true
  private wordWrapOn = true
  private cursorListener: monaco.IDisposable | null = null
  private pasteListener: monaco.IDisposable | null = null
  private copyCutHandler: (() => void) | null = null
  private bufferId: string | null = null

  constructor(container: HTMLElement) {
    this.container = container
    this.editor = monaco.editor.create(container, {
      value: '',
      language: 'plaintext',
      theme: 'vs-dark',
      automaticLayout: true,
      lineNumbers: 'on',
      wordWrap: 'on',
      minimap: { enabled: true },
      fontSize: 14,
      mouseWheelZoom: true
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
  setWordWrap(on: boolean): void {
    this.wordWrapOn = on
    this.editor.updateOptions({ wordWrap: on ? 'on' : 'off' })
  }
  toggleWordWrap(): boolean { this.setWordWrap(!this.wordWrapOn); return this.wordWrapOn }
  wordWrapEnabled(): boolean { return this.wordWrapOn }
  setFontSize(px: number): void { this.editor.updateOptions({ fontSize: px }) }
  setTheme(theme: 'vs' | 'vs-dark'): void { monaco.editor.setTheme(theme) }

  getCursor(): { line: number; col: number } {
    const p = this.editor.getPosition()
    return { line: p?.lineNumber ?? 1, col: p?.column ?? 1 }
  }
  onCursor(cb: (pos: { line: number; col: number }) => void): void {
    this.cursorListener?.dispose()
    this.cursorListener = this.editor.onDidChangeCursorPosition(e => cb({ line: e.position.lineNumber, col: e.position.column }))
  }
  onPaste(cb: (text: string) => void): void {
    this.pasteListener?.dispose()
    this.pasteListener = this.editor.onDidPaste(e => {
      const text = this.editor.getModel()?.getValueInRange(e.range) ?? ''
      if (text) cb(text)
    })
  }
  onCopyCut(cb: (text: string) => void): void {
    if (this.copyCutHandler) {
      this.container.removeEventListener('copy', this.copyCutHandler)
      this.container.removeEventListener('cut', this.copyCutHandler)
    }
    const handler = () => {
      const sel = this.editor.getSelection()
      const text = sel ? this.editor.getModel()?.getValueInRange(sel) ?? '' : ''
      if (text) cb(text)
    }
    this.copyCutHandler = handler
    this.container.addEventListener('copy', handler)
    this.container.addEventListener('cut', handler)
  }
  insertAtCursor(text: string): void {
    const sel = this.editor.getSelection()
    if (!sel) return
    this.editor.executeEdits('paste-history', [{ range: sel, text, forceMoveMarkers: true }])
    this.editor.focus()
  }
  getSelectionText(): string {
    const sel = this.editor.getSelection()
    return sel ? this.editor.getModel()?.getValueInRange(sel) ?? '' : ''
  }
  triggerFind(): void { this.editor.getAction('actions.find')?.run() }
  triggerReplace(): void { this.editor.getAction('editor.action.startFindReplaceAction')?.run() }
  layout(): void { this.editor.layout() }
  dispose(): void {
    if (this.copyCutHandler) {
      this.container.removeEventListener('copy', this.copyCutHandler)
      this.container.removeEventListener('cut', this.copyCutHandler)
    }
    this.cursorListener?.dispose()
    this.pasteListener?.dispose()
    this.editor.getModel()?.dispose()
    this.editor.dispose()
  }
}
