import { describe, expect, it } from 'vitest'
import { BufferSaveCoordinator } from '../../src/renderer/bufferSaveCoordinator'

function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

describe('BufferSaveCoordinator', () => {
  it('serializes same-buffer saves and captures newer content only when its turn starts', async () => {
    const coordinator = new BufferSaveCoordinator()
    const firstWrite = deferred<void>()
    const started: string[] = []
    const writes: string[] = []
    let content = 'first version'

    const first = coordinator.run('buffer-a', async () => {
      started.push('first')
      const captured = content
      await firstWrite.promise
      writes.push(captured)
    })
    await Promise.resolve()

    content = 'newer version'
    const second = coordinator.run('buffer-a', async () => {
      started.push('second')
      writes.push(content)
    })
    await Promise.resolve()

    expect(started).toEqual(['first'])
    expect(writes).toEqual([])

    firstWrite.resolve()
    await first
    await second

    expect(started).toEqual(['first', 'second'])
    expect(writes).toEqual(['first version', 'newer version'])
  })

  it('allows saves for different buffers to start independently', async () => {
    const coordinator = new BufferSaveCoordinator()
    const firstWrite = deferred<void>()
    const started: string[] = []

    const a = coordinator.run('buffer-a', async () => {
      started.push('a')
      await firstWrite.promise
    })
    const b = coordinator.run('buffer-b', async () => { started.push('b') })
    await Promise.resolve()

    expect(started).toEqual(['a', 'b'])
    firstWrite.resolve()
    await Promise.all([a, b])
  })

  it('runs a later save after an earlier save rejects', async () => {
    const coordinator = new BufferSaveCoordinator()
    const failedWrite = deferred<void>()
    const started: string[] = []

    const first = coordinator.run('buffer-a', async () => {
      started.push('first')
      await failedWrite.promise
    })
    await Promise.resolve()
    const second = coordinator.run('buffer-a', async () => { started.push('second'); return 'saved' })

    failedWrite.reject(new Error('disk full'))
    await expect(first).rejects.toThrow('disk full')
    await expect(second).resolves.toBe('saved')
    expect(started).toEqual(['first', 'second'])
  })
})
