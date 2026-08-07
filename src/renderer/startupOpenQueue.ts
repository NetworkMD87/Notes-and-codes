export class StartupOpenQueue {
  private pending: string[] = []
  private ready = false

  constructor(private openPath: (path: string) => Promise<unknown>) {}

  open(path: string): boolean {
    if (!this.ready) {
      this.pending.push(path)
      return true
    }
    void this.openPath(path)
    return false
  }

  async finishStartup(afterDrained: () => void): Promise<void> {
    if (this.ready) return

    while (this.pending.length > 0) {
      await this.openPath(this.pending.shift()!)
    }

    // No await may separate the empty-queue check, fallback, and ready transition: an
    // open received during draining must either join the queue or run after readiness.
    afterDrained()
    this.ready = true
  }
}
