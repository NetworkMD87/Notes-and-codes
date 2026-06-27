export interface AutoSaveDeps {
  enabled: () => boolean
  delayMs: number
  flush: () => void   // performs the actual save of all eligible buffers (fire-and-forget)
}

export class AutoSaveController {
  private timer: ReturnType<typeof setTimeout> | null = null
  constructor(private d: AutoSaveDeps) {}

  noteEdit(): void {
    if (!this.d.enabled()) return
    if (this.timer !== null) clearTimeout(this.timer)
    this.timer = setTimeout(() => { this.timer = null; this.d.flush() }, this.d.delayMs)
  }

  flushNow(): void {
    if (!this.d.enabled()) return
    this.cancel()
    this.d.flush()
  }

  cancel(): void {
    if (this.timer !== null) { clearTimeout(this.timer); this.timer = null }
  }
}

export interface AutosaveBuffer { id: string; filePath: string | null; dirty: boolean }

export function eligibleForAutosave(buffers: AutosaveBuffer[], conflicts: Set<string>): string[] {
  return buffers.filter(b => b.dirty && b.filePath !== null && !conflicts.has(b.id)).map(b => b.id)
}
