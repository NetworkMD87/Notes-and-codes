import type { BufferState, SessionData, EolMode, Encoding } from '../shared/types'
import { languageFromPath } from '../shared/language'

// Keep the leading // of UNC paths; separator/case differences must not create a second tab.
const normalizedPath = (path: string): string => path.replaceAll('\\', '/').replace(/\/+$/, '')
const pathKey = (path: string): string => normalizedPath(path).toLowerCase()

export class BufferManager {
  private buffers: BufferState[] = []
  private editRevisions = new Map<string, number>()
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
    this.editRevisions.set(b.id, 0)
    this._activeId = b.id
    return b
  }

  open(file: { filePath: string; content: string; eol: EolMode; encoding: Encoding; mtimeMs?: number }): BufferState {
    const existing = this.buffers.find(b => b.filePath !== null && pathKey(b.filePath) === pathKey(file.filePath))
    if (existing) { this._activeId = existing.id; return existing }
    const title = file.filePath.split(/[\\/]/).pop() ?? file.filePath
    return this.create({ filePath: file.filePath, content: file.content, eol: file.eol, encoding: file.encoding, title, language: languageFromPath(file.filePath), diskMtime: file.mtimeMs })
  }

  openExternal(file: { filePath: string; content: string; eol: EolMode; encoding: Encoding; mtimeMs?: number }): BufferState {
    const existing = this.buffers.find(b => b.filePath !== null && pathKey(b.filePath) === pathKey(file.filePath))
    if (existing) { this._activeId = existing.id; return existing }

    const placeholder = this.buffers.length === 1 ? this.buffers[0] : undefined
    if (placeholder && placeholder.filePath === null && placeholder.content === '' && !placeholder.dirty) {
      this.buffers.splice(0, 1)
      this.editRevisions.delete(placeholder.id)
      this._activeId = null
    }
    return this.open(file)
  }

  setActive(id: string): void { if (this.get(id)) this._activeId = id }

  idsAtPath(path: string, isDirectory: boolean): string[] {
    const key = pathKey(path)
    return this.buffers.filter(buffer => {
      if (!buffer.filePath) return false
      const current = pathKey(buffer.filePath)
      return current === key || (isDirectory && current.startsWith(key + '/'))
    }).map(buffer => buffer.id)
  }

  renamePath(from: string, to: string, isDirectory: boolean): string[] {
    const target = to.replace(/[\\/]+$/, '')
    const fromPath = normalizedPath(from)
    const targetSeparator = to.includes('/') ? '/' : '\\'
    const changed = this.idsAtPath(from, isDirectory)

    for (const id of changed) {
      const buffer = this.get(id)!
      const suffix = normalizedPath(buffer.filePath!).slice(fromPath.length)
      buffer.filePath = target + suffix.replaceAll('/', targetSeparator)
      buffer.title = buffer.filePath.split(/[\\/]/).pop() ?? buffer.filePath
      buffer.language = languageFromPath(buffer.filePath)
    }

    return changed
  }

  captureRevision(id: string): number | undefined {
    if (!this.get(id)) return undefined
    return this.editRevisions.get(id) ?? 0
  }

  update(id: string, content: string): void {
    const b = this.get(id)
    if (!b) return
    b.content = content
    this.markDirty(id)
  }

  setEol(id: string, eol: EolMode): void {
    const b = this.get(id)
    if (!b) return
    b.eol = eol
    this.markDirty(id)
  }

  setEncoding(id: string, encoding: Encoding): void {
    const b = this.get(id)
    if (!b) return
    b.encoding = encoding
    this.markDirty(id)
  }

  markSaved(id: string, filePath: string, diskMtime?: number, savedRevision = this.captureRevision(id)): void {
    const b = this.get(id)
    if (!b) return
    b.filePath = filePath
    b.title = filePath.split(/[\\/]/).pop() ?? filePath
    b.language = languageFromPath(filePath)
    if (this.captureRevision(id) === savedRevision) b.dirty = false
    // Always assigned, never merged: an undefined mtime (post-write stat failed) must clear the
    // old baseline, or the next save would compare against a value that no longer describes the file.
    b.diskMtime = diskMtime
  }

  setLanguage(id: string, language: string): void {
    const b = this.get(id); if (b) b.language = language
  }

  private markDirty(id: string): void {
    const b = this.get(id)
    if (!b) return
    b.dirty = true
    this.editRevisions.set(id, (this.editRevisions.get(id) ?? 0) + 1)
  }

  close(id: string): void {
    const idx = this.buffers.findIndex(b => b.id === id)
    if (idx === -1) return
    const wasActive = this._activeId === id
    this.buffers.splice(idx, 1)
    this.editRevisions.delete(id)
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
    this.editRevisions = new Map(this.buffers.map(b => [b.id, 0]))
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
