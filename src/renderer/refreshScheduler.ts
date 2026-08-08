export interface RefreshRun<T> {
  snapshot: T
  isCurrent: () => boolean
}

export class RefreshScheduler<T> {
  private generation = 0
  private running = false
  private dirty = false
  private waiters: Array<() => void> = []

  constructor(
    private snapshot: () => T,
    private run: (run: RefreshRun<T>) => Promise<void>,
    private onError: (error: unknown) => void = error => {
      console.error('workspace refresh failed', error)
    },
  ) {}

  request(): Promise<void> {
    this.generation++
    this.dirty = true
    void this.drain()
    return this.whenIdle()
  }

  invalidate(): void {
    this.generation++
    this.dirty = false
    if (!this.running) this.resolveWaiters()
  }

  whenIdle(): Promise<void> {
    if (!this.running && !this.dirty) return Promise.resolve()
    return new Promise(resolve => this.waiters.push(resolve))
  }

  private async drain(): Promise<void> {
    if (this.running) return
    this.running = true
    try {
      while (this.dirty) {
        this.dirty = false
        const generation = this.generation
        const snapshot = this.snapshot()
        try {
          await this.run({ snapshot, isCurrent: () => generation === this.generation })
        } catch (error) {
          this.onError(error)
        }
      }
    } finally {
      this.running = false
      if (this.dirty) void this.drain()
      else this.resolveWaiters()
    }
  }

  private resolveWaiters(): void {
    const waiters = this.waiters.splice(0)
    for (const resolve of waiters) resolve()
  }
}
