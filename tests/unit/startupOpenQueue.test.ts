import { describe, expect, it } from 'vitest'
import { BufferManager } from '../../src/renderer/bufferManager'
import { StartupOpenQueue } from '../../src/renderer/startupOpenQueue'
import type { BufferState } from '../../src/shared/types'

function file(path: string, content = path) {
  return { filePath: path, content, eol: 'LF' as const, encoding: 'utf8' as const }
}

function restoredBuffer(): BufferState {
  return {
    id: 'restored',
    title: 'Restored',
    filePath: null,
    content: 'restored session content',
    language: 'plaintext',
    eol: 'LF',
    encoding: 'utf8',
    dirty: false,
  }
}

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void
  return { promise: new Promise(done => { resolve = done }), resolve: () => resolve() }
}

describe('StartupOpenQueue', () => {
  it('opens a pre-boot request after session restore and leaves it active', async () => {
    const manager = new BufferManager(() => 'startup')
    const queue = new StartupOpenQueue(async path => { manager.open(file(path, 'startup file content')) })
    queue.open('C:\\notes\\startup.txt')

    manager.restore({ buffers: [restoredBuffer()], activeId: 'restored' })
    await queue.finishStartup(() => {
      if (manager.list().length === 0) manager.create()
    })

    expect(manager.get(manager.activeId!)?.content).toBe('startup file content')
    expect(manager.list().map(buffer => buffer.title)).toEqual(['Restored', 'startup.txt'])
    expect(manager.get(manager.activeId!)?.filePath).toBe('C:\\notes\\startup.txt')
  })

  it('drains duplicate and late startup requests in arrival order before fallback', async () => {
    const firstStarted = deferred()
    const releaseFirst = deferred()
    const events: string[] = []
    const queue = new StartupOpenQueue(async path => {
      events.push(path)
      if (path === 'first') {
        firstStarted.resolve()
        await releaseFirst.promise
      }
    })
    queue.open('first')
    queue.open('second')
    queue.open('second')

    const finishing = queue.finishStartup(() => { events.push('fallback') })
    await firstStarted.promise
    queue.open('late')
    releaseFirst.resolve()
    await finishing

    expect(events).toEqual(['first', 'second', 'second', 'late', 'fallback'])
  })

  it('creates an Untitled fallback only when restore and queued opens leave no buffer', async () => {
    const manager = new BufferManager(() => 'untitled')
    const queue = new StartupOpenQueue(async path => { manager.open(file(path)) })

    await queue.finishStartup(() => {
      if (manager.list().length === 0) manager.create()
    })

    expect(manager.list().map(buffer => buffer.title)).toEqual(['Untitled-1'])
    expect(manager.activeId).toBe('untitled')
  })

  it('opens new requests immediately after startup readiness', async () => {
    const opened: string[] = []
    const queue = new StartupOpenQueue(async path => { opened.push(path) })
    await queue.finishStartup(() => undefined)

    queue.open('after-boot')

    expect(opened).toEqual(['after-boot'])
  })
})
