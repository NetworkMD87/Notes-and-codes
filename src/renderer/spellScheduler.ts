import type { SpellBatch, SpellBatchResult } from '../shared/spell'

export interface SpellSchedulerDeps {
  check: (batch: SpellBatch) => Promise<SpellBatchResult>
  snapshot: (generation: number) => SpellBatch
  apply: (result: SpellBatchResult) => void
  clear: () => void
  failed: () => void
  setTimer?: typeof setTimeout
  clearTimer?: typeof clearTimeout
}

const DEBOUNCE_MS = 300

export class SpellScheduler {
  private readonly setTimer: typeof setTimeout
  private readonly clearTimer: typeof clearTimeout
  private generation = 0
  private timer: ReturnType<typeof setTimeout> | null = null
  private inFlight = false
  private pending = false
  private enabled = true
  private disposed = false

  constructor(private readonly deps: SpellSchedulerDeps) {
    this.setTimer = deps.setTimer ?? setTimeout
    this.clearTimer = deps.clearTimer ?? clearTimeout
  }

  schedule(): void {
    if (!this.enabled || this.disposed) return
    this.cancelTimer()
    this.pending = false
    this.timer = this.setTimer(() => {
      this.timer = null
      this.requestCheck()
    }, DEBOUNCE_MS)
  }

  refreshNow(): void {
    if (!this.enabled || this.disposed) return
    this.cancelTimer()
    this.pending = false
    this.requestCheck()
  }

  setEnabled(enabled: boolean): void {
    if (this.disposed || enabled === this.enabled) return
    this.enabled = enabled
    this.generation++
    this.cancelTimer()
    this.pending = false
    if (enabled) this.requestCheck()
    else this.deps.clear()
  }

  invalidate(): void {
    if (this.disposed) return
    this.generation++
    this.cancelTimer()
    this.pending = false
    if (this.enabled) this.requestCheck()
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.enabled = false
    this.generation++
    this.cancelTimer()
    this.pending = false
    this.deps.clear()
  }

  private requestCheck(): void {
    if (!this.enabled || this.disposed) return
    if (this.inFlight) {
      this.pending = true
      return
    }

    const generation = this.generation
    const batch = this.deps.snapshot(generation)
    if (!batch.documents.length) return

    this.inFlight = true
    let check: Promise<SpellBatchResult>
    try {
      check = this.deps.check(batch)
    } catch {
      this.inFlight = false
      if (this.enabled && !this.disposed && generation === this.generation) this.deps.failed()
      this.submitPending()
      return
    }

    void check.then(result => {
      if (
        this.enabled &&
        !this.disposed &&
        generation === this.generation &&
        result.generation === this.generation
      ) this.deps.apply(result)
    }, () => {
      if (this.enabled && !this.disposed && generation === this.generation) this.deps.failed()
    }).finally(() => {
      this.inFlight = false
      this.submitPending()
    })
  }

  private submitPending(): void {
    if (!this.pending || !this.enabled || this.disposed) return
    this.pending = false
    this.requestCheck()
  }

  private cancelTimer(): void {
    if (this.timer === null) return
    this.clearTimer(this.timer)
    this.timer = null
  }
}
