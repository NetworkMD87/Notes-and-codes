import type { BufferState, SessionData, EolMode, Encoding } from '../shared/types'
import { languageFromPath } from '../shared/language'

export class BufferManager {
  private buffers: BufferState[] = []
  private _activeId: string | null = null
  private untitledCount = 0

  constructor(private idFactory: () => string) {}

  list(): BufferState[] { return this.buffers }
  get activeId(): string | null { return this._activeId }
  get(id: string): BufferState | undefined { return this.buffers.find(b => b.id === id) }

  create(opts: Partial<BufferState> = {}): BufferState {
    this.untitledCount += 1
    const b: BufferState = {
      id: opts.id ?? this.idFactory(),
      title: opts.title ?? `Untitled-${this.untitledCount}`,
      filePath: opts.filePath ?? null,
      content: opts.content ?? '',
      language: opts.language ?? 'plaintext',
      eol: opts.eol ?? 'LF',
      encoding: opts.encoding ?? 'utf8',
      dirty: opts.dirty ?? false,
      diskMtime: opts.diskMtime
    }
    this.buffers.push(b)
    this._activeId = b.id
    return b
  }

  open(file: { filePath: string; content: string; eol: EolMode; encoding: Encoding; mtimeMs?: number }): BufferState {
    const existing = this.buffers.find(b => b.filePath === file.filePath)
    if (existing) { this._activeId = existing.id; return existing }
    const title = file.filePath.split(/[\\/]/).pop() ?? file.filePath
    return this.create({ filePath: file.filePath, content: file.content, eol: file.eol, encoding: file.encoding, title, language: languageFromPath(file.filePath), diskMtime: file.mtimeMs })
  }

  setActive(id: string): void { if (this.get(id)) this._activeId = id }

  update(id: string, content: string): void {
    const b = this.get(id)
    if (!b) return
    b.content = content
    b.dirty = true
  }

  markSaved(id: string, filePath: string, diskMtime?: number): void {
    const b = this.get(id)
    if (!b) return
    b.filePath = filePath
    b.title = filePath.split(/[\\/]/).pop() ?? filePath
    b.language = languageFromPath(filePath)
    b.dirty = false
    // Always assigned, never merged: an undefined mtime (post-write stat failed) must clear the
    // old baseline, or the next save would compare against a value that no longer describes the file.
    b.diskMtime = diskMtime
  }

  setLanguage(id: string, language: string): void {
    const b = this.get(id); if (b) b.language = language
  }

  close(id: string): void {
    const idx = this.buffers.findIndex(b => b.id === id)
    if (idx === -1) return
    const wasActive = this._activeId === id
    this.buffers.splice(idx, 1)
    if (this.buffers.length === 0) this.untitledCount = 0
    if (wasActive) {
      const neighbor = this.buffers[idx] ?? this.buffers[idx - 1] ?? null
      this._activeId = neighbor ? neighbor.id : null
    }
  }

  move(id: string, toIndex: number): void {
    const from = this.buffers.findIndex(b => b.id === id)
    if (from === -1) return
    const [b] = this.buffers.splice(from, 1)
    const to = Math.max(0, Math.min(toIndex, this.buffers.length))
    this.buffers.splice(to, 0, b)
  }

  toSession(): SessionData { return { buffers: this.buffers, activeId: this._activeId } }

  restore(data: SessionData): void {
    this.buffers = data.buffers
    this._activeId = data.activeId
    this.untitledCount = this.buffers.length
    // Backfill any field a session from an older schema may be missing, so downstream
    // reads (status bar, writeFile) never hit undefined.
    for (const b of this.buffers) {
      if (!b.encoding) b.encoding = 'utf8'
      if (!b.eol) b.eol = 'LF'
      if (!b.language) b.language = 'plaintext'
      if (typeof b.dirty !== 'boolean') b.dirty = false
    }
  }
}
