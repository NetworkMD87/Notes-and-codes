export interface LatestWriteSchedulerDeps<T> {
  write: (value: T) => Promise<void>
  onSuccess?: () => void
  onFailure?: (error: unknown) => void
  debounceMs: number
  setTimer?: (callback: () => void, delay: number) => ReturnType<typeof setTimeout>
  clearTimer?: (timer: ReturnType<typeof setTimeout>) => void
}

export class LatestWriteScheduler<T> {
  private timer: ReturnType<typeof setTimeout> | null = null
  private active: Promise<void> | null = null
  private pending: T | null = null
  private idleWaiters: Array<() => void> = []
  private readonly setTimer
  private readonly clearTimer

  constructor(private deps: LatestWriteSchedulerDeps<T>) {
    this.setTimer = deps.setTimer ?? ((callback: () => void, delay: number) => setTimeout(callback, delay))
    this.clearTimer = deps.clearTimer ?? ((timer: ReturnType<typeof setTimeout>) => clearTimeout(timer))
  }

  schedule(value: T): void {
    this.pending = value
    this.cancelTimer()
    this.timer = this.setTimer(() => {
      this.timer = null
      this.startPending()
    }, this.deps.debounceMs)
  }

  async flush(value: T): Promise<void> {
    this.pending = value
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
        else this.resolveIdle()
      })
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
}
