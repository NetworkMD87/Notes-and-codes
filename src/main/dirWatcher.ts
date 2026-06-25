import { watch, type FSWatcher } from 'node:fs'

// Watches a folder tree and fires `onChange` (debounced) on any add/remove/rename.
// `recursive: true` is supported on Windows and macOS, which is our target.
export class DirWatcher {
  private watcher: FSWatcher | null = null
  private timer: NodeJS.Timeout | null = null
  constructor(private onChange: () => void) {}

  watch(path: string | null): void {
    this.stop()
    if (!path) return
    try {
      this.watcher = watch(path, { recursive: true }, () => this.schedule())
    } catch {
      this.watcher = null
    }
  }

  private schedule(): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = setTimeout(() => { this.timer = null; this.onChange() }, 300)
  }

  private stop(): void {
    if (this.timer) { clearTimeout(this.timer); this.timer = null }
    if (this.watcher) { this.watcher.close(); this.watcher = null }
  }

  dispose(): void { this.stop() }
}
