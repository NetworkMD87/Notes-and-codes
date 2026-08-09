export interface LatestWriteSchedulerDeps<T> {
  write: (value: T) => Promise<void>
  snapshot?: (value: T) => T
  onSuccess?: () => void
  onFailure?: (error: unknown) => void
  onStateChange?: (state: LatestWriteSchedulerState) => void
  debounceMs: number
  setTimer?: (callback: () => void, delay: number) => ReturnType<typeof setTimeout>
  clearTimer?: (timer: ReturnType<typeof setTimeout>) => void
}

export interface LatestWriteSchedulerState {
  active: boolean
  pending: boolean
  revision: number
}

export class LatestWriteScheduler<T> {
  private timer: ReturnType<typeof setTimeout> | null = null
  private active: Promise<void> | null = null
  private pending: T | null = null
  private idleWaiters: Array<() => void> = []
  private revision = 0
  private readonly setTimer
  private readonly clearTimer

  constructor(private deps: LatestWriteSchedulerDeps<T>) {
    this.setTimer = deps.setTimer ?? ((callback: () => void, delay: number) => setTimeout(callback, delay))
    this.clearTimer = deps.clearTimer ?? ((timer: ReturnType<typeof setTimeout>) => clearTimeout(timer))
  }

  schedule(value: T): void {
    this.pending = this.deps.snapshot?.(value) ?? value
    this.revision += 1
    this.cancelTimer()
    this.timer = this.setTimer(() => {
      this.timer = null
      this.startPending()
    }, this.deps.debounceMs)
    this.emitState()
  }

  async flush(value: T): Promise<void> {
    this.pending = this.deps.snapshot?.(value) ?? value
    this.revision += 1
    this.cancelTimer()
    this.startPending()
    await this.whenIdle()
  }

  whenIdle(): Promise<void> {
    if (!this.active && this.pending === null && this.timer === null) return Promise.resolve()
    return new Promise(resolve => { this.idleWaiters.push(resolve) })
  }

  private startPending(): void {
    if (this.active || this.pending === null) return
    const value = this.pending
    this.pending = null
    this.active = Promise.resolve()
      .then(() => this.deps.write(value))
      .then(() => this.deps.onSuccess?.(), error => this.deps.onFailure?.(error))
      .finally(() => {
        this.active = null
        if (this.pending !== null && this.timer === null) this.startPending()
        else {
          this.emitState()
          this.resolveIdle()
        }
      })
    this.emitState()
  }

  private cancelTimer(): void {
    if (this.timer === null) return
    this.clearTimer(this.timer)
    this.timer = null
  }

  private resolveIdle(): void {
    if (this.active || this.pending !== null || this.timer !== null) return
    const waiters = this.idleWaiters.splice(0)
    waiters.forEach(resolve => resolve())
  }

  private emitState(): void {
    this.deps.onStateChange?.({
      active: this.active !== null,
      pending: this.pending !== null,
      revision: this.revision,
    })
  }
}
