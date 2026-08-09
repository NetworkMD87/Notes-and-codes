import { afterEach, describe, expect, it, vi } from 'vitest'
import { LatestWriteScheduler } from '../../src/renderer/latestWriteScheduler'
import { snapshotSession } from '../../src/renderer/sessionSnapshot'
import type { SessionData } from '../../src/shared/types'

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

  it('writes the event-time session copy when the source mutates without another schedule', async () => {
    vi.useFakeTimers()
    const writes: SessionData[] = []
    const source: SessionData = {
      buffers: [{
        id: 'note', title: 'Note', filePath: null, content: 'before', language: 'plaintext',
        eol: 'LF', encoding: 'utf8', dirty: true,
        highlights: [{ start: 1, end: 3, colour: 'yellow' }],
      }],
      activeId: 'note',
    }
    const scheduler = new LatestWriteScheduler<SessionData>({
      debounceMs: 500,
      snapshot: snapshotSession,
      write: async value => { writes.push(value) },
    })

    scheduler.schedule(source)
    source.buffers[0].content = 'mutated-without-event'
    source.buffers[0].highlights![0].start = 99
    await vi.advanceTimersByTimeAsync(500)
    await scheduler.whenIdle()

    expect(writes[0].buffers[0].content).toBe('before')
    expect(writes[0].buffers[0].highlights).toEqual([{ start: 1, end: 3, colour: 'yellow' }])
  })

  it('reports when a newer value is pending behind the active write', async () => {
    vi.useFakeTimers()
    const first = deferred()
    const states: Array<{ active: boolean; pending: boolean; revision: number }> = []
    const scheduler = new LatestWriteScheduler<string>({
      debounceMs: 500,
      write: value => value === 'old' ? first.promise : Promise.resolve(),
      onStateChange: state => { states.push(state) },
    })

    scheduler.schedule('old')
    await vi.advanceTimersByTimeAsync(500)
    expect(states.at(-1)).toMatchObject({ active: true, pending: false, revision: 1 })

    scheduler.schedule('newest')
    expect(states.at(-1)).toMatchObject({ active: true, pending: true, revision: 2 })

    first.resolve()
    await vi.advanceTimersByTimeAsync(500)
    await scheduler.whenIdle()
    expect(states.at(-1)).toMatchObject({ active: false, pending: false, revision: 2 })
  })
})
