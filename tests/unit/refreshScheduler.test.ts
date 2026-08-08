import { describe, expect, it, vi } from 'vitest'
import { RefreshScheduler, type RefreshRun } from '../../src/renderer/refreshScheduler'

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void
  return { promise: new Promise<void>(done => { resolve = done }), resolve }
}

function nextEventLoopTurn(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, 0))
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
    expect(runs[1].isCurrent()).toBe(true)
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

  it('cancels a queued follow-up and settles every request when invalidated', async () => {
    const gate = deferred()
    const settled: string[] = []
    let runs = 0
    const scheduler = new RefreshScheduler(() => 'root-a', async () => {
      runs++
      await gate.promise
    })

    const firstRequest = scheduler.request().then(() => { settled.push('first') })
    const secondRequest = scheduler.request().then(() => { settled.push('second') })
    scheduler.invalidate()
    gate.resolve()

    await Promise.all([firstRequest, secondRequest, scheduler.whenIdle()])
    expect(runs).toBe(1)
    expect(settled).toEqual(['first', 'second'])
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

  it('contains snapshot exceptions, settles the batch, and recovers on a later request', async () => {
    const snapshotError = new Error('snapshot failed')
    const reported: unknown[] = []
    const unhandled: unknown[] = []
    const seen: string[] = []
    let snapshotCalls = 0
    const onUnhandled = (error: unknown): void => { unhandled.push(error) }
    process.on('unhandledRejection', onUnhandled)
    try {
      const scheduler = new RefreshScheduler(() => {
        snapshotCalls++
        if (snapshotCalls === 1) throw snapshotError
        return 'recovered'
      }, async run => {
        seen.push(run.snapshot)
      }, error => {
        reported.push(error)
      })

      await scheduler.request()
      await nextEventLoopTurn()
      expect(reported).toEqual([snapshotError])
      expect(unhandled).toEqual([])

      await scheduler.request()
      expect(seen).toEqual(['recovered'])
    } finally {
      process.off('unhandledRejection', onUnhandled)
    }
  })

  it('contains exceptions from the error reporter and allows later recovery', async () => {
    const reporterError = new Error('reporter failed')
    const unhandled: unknown[] = []
    const seen: number[] = []
    let value = 1
    const onUnhandled = (error: unknown): void => { unhandled.push(error) }
    process.on('unhandledRejection', onUnhandled)
    try {
      const scheduler = new RefreshScheduler(() => value, async run => {
        seen.push(run.snapshot)
        if (run.snapshot === 1) throw new Error('refresh failed')
      }, () => {
        throw reporterError
      })

      await scheduler.request()
      await nextEventLoopTurn()
      expect(unhandled).toEqual([])

      value = 2
      await scheduler.request()
      expect(seen).toEqual([1, 2])
    } finally {
      process.off('unhandledRejection', onUnhandled)
    }
  })
})
