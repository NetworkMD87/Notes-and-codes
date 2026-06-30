import * as monaco from 'monaco-editor'
import type { BufferState } from '../shared/types'
import { formatText, UnsupportedLanguageError, type FormatRange } from './formatter'
import { toast } from './notify'

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
  private models = new Map<string, monaco.editor.ITextModel>()
  private viewStates = new Map<string, monaco.editor.ICodeEditorViewState>()

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
      mouseWheelZoom: true,
      fontFamily: "'JetBrains Mono', Consolas, monospace",
      fontLigatures: true
    })
    this.editor.onDidChangeModelContent(() => {
      this.changeCb?.(this.editor.getValue())
    })
    this.editor.addCommand(monaco.KeyMod.Shift | monaco.KeyMod.Alt | monaco.KeyCode.KeyF, () => { void this.formatDocument() })
  }

  /** Switch the visible buffer, preserving each buffer's scroll/cursor (view state) and undo history. */
  setBuffer(b: BufferState): void {
    if (b.id === this.bufferId) return
    if (this.bufferId) {
      const vs = this.editor.saveViewState()
      if (vs) this.viewStates.set(this.bufferId, vs)
    } else {
      this.editor.getModel()?.dispose() // drop the throwaway model created in the constructor
    }
    this.bufferId = b.id
    this.editor.setModel(this.modelFor(b))
    const vs = this.viewStates.get(b.id)
    if (vs) this.editor.restoreViewState(vs)
  }

  /** Replace a buffer's model out-of-band (external reload, history restore, post-save language change). */
  refreshBuffer(b: BufferState): void {
    const old = this.models.get(b.id)
    const model = monaco.editor.createModel(b.content, b.language)
    this.models.set(b.id, model)
    this.viewStates.delete(b.id)
    if (this.bufferId === b.id) this.editor.setModel(model)
    old?.dispose()
  }

  /** Drop a closed buffer's cached model + view state. */
  forgetBuffer(id: string): void {
    if (id === this.bufferId) return // still on screen — keep the live model
    this.models.get(id)?.dispose()
    this.models.delete(id)
    this.viewStates.delete(id)
  }

  private modelFor(b: BufferState): monaco.editor.ITextModel {
    let model = this.models.get(b.id)
    if (!model || model.isDisposed()) {
      model = monaco.editor.createModel(b.content, b.language)
      this.models.set(b.id, model)
    }
    return model
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
  setFontFamily(css: string): void { this.editor.updateOptions({ fontFamily: css }) }
  setLigatures(on: boolean): void { this.editor.updateOptions({ fontLigatures: on }) }
  setTheme(themeId: string): void { monaco.editor.setTheme(themeId) }

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

  async formatDocument(): Promise<void> {
    const model = this.editor.getModel(); if (!model) return
    const text = model.getValue(); if (!text.trim()) return
    await this.applyFormat(text, model.getLanguageId())
  }

  async formatSelection(): Promise<void> {
    const model = this.editor.getModel(); if (!model) return
    const sel = this.editor.getSelection()
    if (!sel || sel.isEmpty()) { await this.formatDocument(); return }
    const range: FormatRange = {
      start: model.getOffsetAt(sel.getStartPosition()),
      end: model.getOffsetAt(sel.getEndPosition()),
    }
    await this.applyFormat(model.getValue(), model.getLanguageId(), range)
  }

  private async applyFormat(text: string, lang: string, range?: FormatRange): Promise<void> {
    let formatted: string
    try {
      formatted = await formatText(text, lang, range)
    } catch (err) {
      if (err instanceof UnsupportedLanguageError) toast(`Can't format — ${lang} isn't supported.`)
      else toast(`Format failed: ${(err as Error).message.split('\n')[0]}`)
      return
    }
    if (formatted === text) return
    const model = this.editor.getModel(); if (!model || model.getValue() !== text) return
    const viewState = this.editor.saveViewState()
    this.editor.executeEdits('format', [{ range: model.getFullModelRange(), text: formatted }])
    if (viewState) this.editor.restoreViewState(viewState)
    this.editor.focus()
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
    for (const m of this.models.values()) m.dispose()
    this.models.clear()
    this.editor.dispose()
  }
}
