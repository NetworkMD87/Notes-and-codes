import { afterEach, describe, expect, it, vi } from 'vitest'
import { LatestWriteScheduler } from '../../src/renderer/latestWriteScheduler'

const deferred = <T = void>() => {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

afterEach(() => { vi.useRealTimers() })

describe('LatestWriteScheduler', () => {
  it('runs one write and retains only the newest pending value', async () => {
    vi.useFakeTimers()
    const first = deferred()
    const writes: string[] = []
    const scheduler = new LatestWriteScheduler<string>({
      debounceMs: 500,
      write: value => { writes.push(value); return value === 'one' ? first.promise : Promise.resolve() },
    })

    scheduler.schedule('one')
    await vi.advanceTimersByTimeAsync(500)
    scheduler.schedule('two')
    scheduler.schedule('three')
    await vi.advanceTimersByTimeAsync(500)

    expect(writes).toEqual(['one'])
    first.resolve()
    await scheduler.whenIdle()
    expect(writes).toEqual(['one', 'three'])
  })

  it('runs the newest pending value after a failure', async () => {
    vi.useFakeTimers()
    const first = deferred()
    const failures: unknown[] = []
    const writes: string[] = []
    const scheduler = new LatestWriteScheduler<string>({
      debounceMs: 0,
      write: value => { writes.push(value); return value === 'old' ? first.promise : Promise.resolve() },
      onFailure: error => { failures.push(error) },
    })

    scheduler.schedule('old')
    await vi.advanceTimersByTimeAsync(0)
    scheduler.schedule('newest')
    first.reject(new Error('disk full'))
    await vi.advanceTimersByTimeAsync(0)
    await scheduler.whenIdle()

    expect(writes).toEqual(['old', 'newest'])
    expect(failures).toHaveLength(1)
  })

  it('flush replaces the pending snapshot and settles after its one attempt fails', async () => {
    const writes: string[] = []
    const scheduler = new LatestWriteScheduler<string>({
      debounceMs: 500,
      write: async value => { writes.push(value); throw new Error('denied') },
    })

    scheduler.schedule('stale')
    await scheduler.flush('quit-state')

    expect(writes).toEqual(['quit-state'])
    await expect(scheduler.whenIdle()).resolves.toBeUndefined()
  })
})
