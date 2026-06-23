import { watchFile, unwatchFile } from 'node:fs'

export class FileWatcher {
  private watched = new Set<string>()
  constructor(private onChange: (path: string) => void) {}

  setPaths(paths: string[]): void {
    const next = new Set(paths)
    for (const p of this.watched) if (!next.has(p)) { unwatchFile(p); this.watched.delete(p) }
    for (const p of next) if (!this.watched.has(p)) {
      watchFile(p, { interval: 1000 }, (curr, prev) => { if (curr.mtimeMs !== prev.mtimeMs) this.onChange(p) })
      this.watched.add(p)
    }
  }
  dispose(): void { for (const p of this.watched) unwatchFile(p); this.watched.clear() }
}
