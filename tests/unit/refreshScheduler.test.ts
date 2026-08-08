import { describe, expect, it, vi } from 'vitest'
import { RefreshScheduler, type RefreshRun } from '../../src/renderer/refreshScheduler'

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void
  return { promise: new Promise<void>(done => { resolve = done }), resolve }
}

describe('RefreshScheduler', () => {
  it('runs one active job and exactly one follow-up with the newest snapshot', async () => {
    let snapshot = 'root-a:first'
    let active = 0
    let maxActive = 0
    const first = deferred()
    const second = deferred()
    const runs: RefreshRun<string>[] = []
    const scheduler = new RefreshScheduler(() => snapshot, async run => {
      runs.push(run)
      active++
      maxActive = Math.max(maxActive, active)
      await (runs.length === 1 ? first.promise : second.promise)
      active--
    })

    void scheduler.request()
    snapshot = 'root-a:second'
    void scheduler.request()
    snapshot = 'root-a:newest'
    const idle = scheduler.request()

    expect(runs).toHaveLength(1)
    expect(runs[0].snapshot).toBe('root-a:first')
    expect(runs[0].isCurrent()).toBe(false)
    expect(maxActive).toBe(1)

    first.resolve()
    await vi.waitFor(() => expect(runs).toHaveLength(2))
    expect(runs[1].snapshot).toBe('root-a:newest')
    expect(maxActive).toBe(1)

    second.resolve()
    await idle
    expect(runs).toHaveLength(2)
  })

  it('resolves every request promise only after the coalesced batch is idle', async () => {
    let snapshot = 1
    const first = deferred()
    const second = deferred()
    const settled: number[] = []
    let runCount = 0
    const scheduler = new RefreshScheduler(() => snapshot, async () => {
      runCount++
      await (runCount === 1 ? first.promise : second.promise)
    })

    const firstRequest = scheduler.request().then(() => { settled.push(1) })
    snapshot = 2
    const secondRequest = scheduler.request().then(() => { settled.push(2) })

    first.resolve()
    await vi.waitFor(() => expect(runCount).toBe(2))
    expect(settled).toEqual([])

    second.resolve()
    await Promise.all([firstRequest, secondRequest, scheduler.whenIdle()])
    expect(settled).toEqual([1, 2])
  })

  it('invalidates an active completion without scheduling another run', async () => {
    const gate = deferred()
    const currentChecks: Array<() => boolean> = []
    const scheduler = new RefreshScheduler(() => 'root-a', async run => {
      currentChecks.push(run.isCurrent)
      await gate.promise
    })

    const idle = scheduler.request()
    scheduler.invalidate()

    expect(currentChecks[0]()).toBe(false)
    gate.resolve()
    await idle
    expect(currentChecks).toHaveLength(1)
  })

  it('completes failed generations, runs the dirty follow-up, and accepts later requests', async () => {
    let value = 1
    const onError = vi.fn()
    const seen: number[] = []
    const gate = deferred()
    const scheduler = new RefreshScheduler(() => value, async run => {
      seen.push(run.snapshot)
      if (run.snapshot === 1) {
        await gate.promise
        throw new Error('walk failed')
      }
    }, onError)

    void scheduler.request()
    value = 2
    const failedBatch = scheduler.request()
    gate.resolve()
    await failedBatch

    expect(seen).toEqual([1, 2])
    expect(onError).toHaveBeenCalledOnce()
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'walk failed' }))

    value = 3
    await scheduler.request()
    expect(seen).toEqual([1, 2, 3])
  })
})
