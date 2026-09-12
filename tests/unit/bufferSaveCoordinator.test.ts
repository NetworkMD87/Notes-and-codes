import { describe, expect, it } from 'vitest'
import { BufferSaveCoordinator } from '../../src/renderer/bufferSaveCoordinator'
import { BufferManager } from '../../src/renderer/bufferManager'

function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

describe('BufferSaveCoordinator', () => {
  it('holds a folder rename behind every descendant save and holds later saves until retargeting finishes', async () => {
    const coordinator = new BufferSaveCoordinator()
    let nextId = 0
    const manager = new BufferManager(() => String(++nextId))
    const a = manager.open({ filePath: 'C:/old/a.txt', content: 'old a', eol: 'LF', encoding: 'utf8' })
    const b = manager.open({ filePath: 'C:/old/nested/b.txt', content: 'old b', eol: 'LF', encoding: 'utf8' })
    const disk = new Map([[a.filePath!, a.content], [b.filePath!, b.content]])
    const firstGate = deferred()
    const secondGate = deferred()
    const renameGate = deferred()
    const startedRename = deferred()
    const events: string[] = []
    const save = (id: string, gate = Promise.resolve()) => coordinator.run(id, async () => {
      const buffer = manager.get(id)!
      const path = buffer.filePath!
      const content = buffer.content
      const revision = manager.captureRevision(id)
      await gate
      disk.set(path, content)
      manager.markSaved(id, path, undefined, revision)
      events.push(`saved ${id}`)
    })
    manager.update(a.id, 'first a')
    manager.update(b.id, 'first b')
    const first = save(a.id, firstGate.promise)
    const second = save(b.id, secondGate.promise)
    await Promise.resolve()
    const rename = coordinator.run([a.id, b.id, a.id], async () => {
      events.push('rename started')
      startedRename.resolve()
      await renameGate.promise
      for (const [path, content] of [...disk]) {
        disk.delete(path)
        disk.set(path.replace('C:/old/', 'C:/new/'), content)
      }
      manager.renamePath('C:/old', 'C:/new', true)
    })
    manager.update(a.id, 'latest a')
    manager.update(b.id, 'latest b')
    const laterA = save(a.id)
    const laterB = save(b.id)
    await coordinator.run('unrelated', async () => { events.push('unrelated') })
    expect(events).toEqual(['unrelated'])
    firstGate.resolve()
    await first
    expect(events).toEqual(['unrelated', 'saved 1'])
    expect(a.dirty).toBe(true)
    secondGate.resolve()
    await second
    await startedRename.promise
    expect(events).toEqual(['unrelated', 'saved 1', 'saved 2', 'rename started'])
    expect(b.dirty).toBe(true)
    renameGate.resolve()
    await Promise.all([rename, laterA, laterB])
    expect([...disk]).toEqual([['C:/new/a.txt', 'latest a'], ['C:/new/nested/b.txt', 'latest b']])
    expect(a).toMatchObject({ filePath: 'C:/new/a.txt', content: 'latest a', dirty: false })
    expect(b).toMatchObject({ filePath: 'C:/new/nested/b.txt', content: 'latest b', dirty: false })
  })

  it('does not deadlock overlapping groups in reverse order or discard a newer pending group tail', async () => {
    const coordinator = new BufferSaveCoordinator()
    const firstGate = deferred()
    const secondGate = deferred()
    const secondStarted = deferred()
    const events: string[] = []
    const first = coordinator.run(['a', 'b'], () => firstGate.promise)
    const second = coordinator.run(['b', 'a'], async () => {
      events.push('second')
      secondStarted.resolve()
      await secondGate.promise
    })
    firstGate.resolve()
    await first
    await secondStarted.promise
    const third = coordinator.run('a', async () => { events.push('third') })
    await Promise.resolve()
    expect(events).toEqual(['second'])
    secondGate.resolve()
    await Promise.all([second, third])
    expect(events).toEqual(['second', 'third'])
  })

  it('releases every reserved buffer after a grouped operation fails', async () => {
    const coordinator = new BufferSaveCoordinator()
    const gate = deferred()
    const events: string[] = []
    const failed = coordinator.run(['a', 'b'], () => gate.promise)
    const later = ['a', 'b'].map(id => coordinator.run(id, async () => { events.push(id) }))
    await Promise.resolve()
    expect(events).toEqual([])
    gate.reject(new Error('rename failed'))
    await expect(failed).rejects.toThrow('rename failed')
    await Promise.all(later)
    expect(events).toEqual(['a', 'b'])
  })

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

  it('accepts a new save after a settled buffer tail has been cleaned up', async () => {
    const coordinator = new BufferSaveCoordinator()
    const operations: string[] = []

    await coordinator.run('buffer-a', async () => { operations.push('first') })
    await coordinator.run('buffer-a', async () => { operations.push('second') })

    expect(operations).toEqual(['first', 'second'])
  })

  it('keeps a newer pending tail when an older operation settles', async () => {
    const coordinator = new BufferSaveCoordinator()
    const firstGate = deferred<void>()
    const secondGate = deferred<void>()
    const started: string[] = []

    const first = coordinator.run('buffer-a', async () => {
      started.push('first')
      await firstGate.promise
    })
    await Promise.resolve()
    const second = coordinator.run('buffer-a', async () => {
      started.push('second')
      await secondGate.promise
    })

    firstGate.resolve()
    await first
    await Promise.resolve()
    const third = coordinator.run('buffer-a', async () => { started.push('third') })
    await Promise.resolve()

    expect(started).toEqual(['first', 'second'])
    secondGate.resolve()
    await Promise.all([second, third])
    expect(started).toEqual(['first', 'second', 'third'])
  })
})
