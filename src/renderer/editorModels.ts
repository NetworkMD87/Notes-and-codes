import * as monaco from 'monaco-editor'
import type { BufferState } from '../shared/types'

type ReplacementListener = (id: string, model: monaco.editor.ITextModel | null) => void

/** Document models belong to buffers, not to the panes currently displaying them. */
export class EditorModels {
  private models = new Map<string, monaco.editor.ITextModel>()
  private listeners = new Set<ReplacementListener>()

  get(buffer: BufferState): monaco.editor.ITextModel {
    let model = this.models.get(buffer.id)
    if (!model || model.isDisposed()) {
      model = monaco.editor.createModel(buffer.content, buffer.language)
      this.models.set(buffer.id, model)
    }
    return model
  }

  onReplace(listener: ReplacementListener): monaco.IDisposable {
    this.listeners.add(listener)
    return { dispose: () => { this.listeners.delete(listener) } }
  }

  refresh(buffer: BufferState): void {
    const old = this.models.get(buffer.id)
    const model = monaco.editor.createModel(buffer.content, buffer.language)
    this.models.set(buffer.id, model)
    // Every attached view must leave the old model before it is disposed.
    for (const listener of this.listeners) listener(buffer.id, model)
    old?.dispose()
  }

  setLanguage(id: string, language: string): void {
    const model = this.models.get(id)
    if (model && !model.isDisposed()) monaco.editor.setModelLanguage(model, language)
  }

  forget(id: string): void {
    const model = this.models.get(id)
    this.models.delete(id)
    for (const listener of this.listeners) listener(id, null)
    model?.dispose()
  }

  dispose(): void {
    for (const id of this.models.keys()) this.forget(id)
    this.listeners.clear()
  }
}
