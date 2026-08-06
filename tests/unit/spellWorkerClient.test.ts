import { describe, expect, it, vi } from 'vitest'
import {
  exposeSpellTestHooks,
  SpellWorkerClient,
  type WorkerFactory,
} from '../../src/renderer/spellWorkerClient'
import type {
  SpellBatch,
  SpellBatchResult,
  SpellWorkerRequest,
  SpellWorkerResponse
} from '../../src/shared/spell'

type Listener = EventListenerOrEventListenerObject

class FakeWorker {
  readonly messages: SpellWorkerRequest[] = []
  readonly terminate = vi.fn()
  private readonly listeners = new Map<string, Set<Listener>>()

  readonly worker = {
    postMessage: (message: SpellWorkerRequest): void => { this.messages.push(structuredClone(message)) },
    terminate: this.terminate,
    addEventListener: (type: string, listener: Listener): void => {
      const listeners = this.listeners.get(type) ?? new Set<Listener>()
      listeners.add(listener)
      this.listeners.set(type, listeners)
    },
    removeEventListener: (type: string, listener: Listener): void => {
      this.listeners.get(type)?.delete(listener)
    }
  } as unknown as ReturnType<WorkerFactory>

  respond(response: SpellWorkerResponse): void {
    this.emit('message', new MessageEvent('message', { data: response }))
  }

  crash(): void { this.emit('error', new Event('error')) }

  private emit(type: string, event: Event): void {
    for (const listener of [...(this.listeners.get(type) ?? [])]) {
      if (typeof listener === 'function') listener(event)
      else listener.handleEvent(event)
    }
  }
}

function factory(): { createWorker: WorkerFactory; workers: FakeWorker[] } {
  const workers: FakeWorker[] = []
  const createWorker: WorkerFactory = () => {
    const worker = new FakeWorker()
    workers.push(worker)
    return worker.worker
  }
  return { createWorker, workers }
}

const batch: SpellBatch = {
  generation: 7,
  documents: [{ modelUri: 'file:///note.md', modelVersion: 3, languageId: 'markdown', text: 'mispeling' }]
}

const checked: SpellBatchResult = {
  generation: 7,
  documents: [{
    modelUri: 'file:///note.md',
    modelVersion: 3,
    issues: [{ text: 'mispeling', start: 0, end: 9 }]
  }]
}

async function flush(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
}

describe('SpellWorkerClient', () => {
  it('does not expose the smoke-only test hook without the headless navigation flag', () => {
    const { createWorker } = factory()
    const client = new SpellWorkerClient({ createWorker })
    const target: { __ncSpellTest?: unknown } = {}

    exposeSpellTestHooks(new URLSearchParams(), client, target)

    expect(target.__ncSpellTest).toBeUndefined()
    client.dispose()
  })

  it('correlates out-of-order responses by request id', async () => {
    const { createWorker, workers } = factory()
    const client = new SpellWorkerClient({ createWorker })

    const suggestions = client.suggest('mispeling', 3)
    const result = client.check(batch)

    expect(workers[0].messages).toEqual([
      { id: 1, type: 'suggest', word: 'mispeling', limit: 3 },
      { id: 2, type: 'check', batch }
    ])

    workers[0].respond({ id: 2, ok: true, type: 'checked', result: checked })
    workers[0].respond({ id: 1, ok: true, type: 'suggested', suggestions: ['misspelling'] })

    await expect(result).resolves.toEqual(checked)
    await expect(suggestions).resolves.toEqual(['misspelling'])
  })

  it('rejects only with the fixed worker error code', async () => {
    const { createWorker, workers } = factory()
    const client = new SpellWorkerClient({ createWorker })

    const result = client.check(batch)
    workers[0].respond({ id: 1, ok: false, error: 'check-failed' })

    await expect(result).rejects.toThrow('check-failed')
  })

  it('terminates and rejects outstanding and future calls when disposed', async () => {
    const { createWorker, workers } = factory()
    const client = new SpellWorkerClient({ createWorker })
    const outstanding = client.suggest('pending')

    client.dispose()

    expect(workers[0].terminate).toHaveBeenCalledOnce()
    await expect(outstanding).rejects.toThrow('worker-failed')
    await expect(client.suggest('later')).rejects.toThrow('worker-failed')
    expect(workers[0].messages).toHaveLength(1)
  })

  it('recreates once and restores acknowledged personal and session state', async () => {
    const { createWorker, workers } = factory()
    const onRestart = vi.fn()
    const onFatal = vi.fn()
    const client = new SpellWorkerClient({ createWorker, onRestart, onFatal })

    const loaded = client.load('en-GB', ['Keep', 'Remove'])
    workers[0].respond({ id: 1, ok: true, type: 'loaded' })
    await loaded

    const ignored = client.ignore('SessionWord')
    workers[0].respond({ id: 2, ok: true, type: 'mutated' })
    await ignored

    const added = client.addPersonal('Beta')
    workers[0].respond({ id: 3, ok: true, type: 'mutated' })
    await added

    const removed = client.removePersonal('remove')
    workers[0].respond({ id: 4, ok: true, type: 'mutated' })
    await removed

    const rejectedAdd = client.addPersonal('Ghost')
    workers[0].respond({ id: 5, ok: false, error: 'worker-failed' })
    await expect(rejectedAdd).rejects.toThrow('worker-failed')

    const outstanding = client.suggest('pending')
    workers[0].crash()

    await expect(outstanding).rejects.toThrow('worker-failed')
    expect(workers[0].terminate).toHaveBeenCalledOnce()
    expect(workers).toHaveLength(2)
    expect(workers[1].messages).toEqual([
      { id: 7, type: 'load', locale: 'en-GB', personalWords: ['Keep', 'Beta'] }
    ])

    workers[1].respond({ id: 7, ok: true, type: 'loaded' })
    await flush()
    expect(workers[1].messages).toEqual([
      { id: 7, type: 'load', locale: 'en-GB', personalWords: ['Keep', 'Beta'] },
      { id: 8, type: 'ignore', word: 'SessionWord' }
    ])
    workers[1].respond({ id: 8, ok: true, type: 'mutated' })
    await flush()

    expect(onRestart).toHaveBeenCalledOnce()
    expect(onFatal).not.toHaveBeenCalled()
  })

  it('retains session ignores when a later load replaces locale and personal words', async () => {
    const { createWorker, workers } = factory()
    const onRestart = vi.fn()
    const client = new SpellWorkerClient({ createWorker, onRestart })

    const firstLoad = client.load('en-GB', ['Old'])
    workers[0].respond({ id: 1, ok: true, type: 'loaded' })
    await firstLoad
    const ignored = client.ignore('StillIgnored')
    workers[0].respond({ id: 2, ok: true, type: 'mutated' })
    await ignored
    const secondLoad = client.load('en-US', ['New'])
    workers[0].respond({ id: 3, ok: true, type: 'loaded' })
    await secondLoad

    workers[0].crash()
    expect(workers[1].messages).toEqual([
      { id: 4, type: 'load', locale: 'en-US', personalWords: ['New'] }
    ])
    workers[1].respond({ id: 4, ok: true, type: 'loaded' })
    await flush()
    expect(workers[1].messages[1]).toEqual({ id: 5, type: 'ignore', word: 'StillIgnored' })
    workers[1].respond({ id: 5, ok: true, type: 'mutated' })
    await flush()
    expect(onRestart).toHaveBeenCalledOnce()
  })

  it('restarts from the personal words sent even if the caller mutates its array before acknowledgement', async () => {
    const { createWorker, workers } = factory()
    const client = new SpellWorkerClient({ createWorker })
    const personalWords = ['Original']

    const loading = client.load('en-GB', personalWords)
    expect(workers[0].messages[0]).toEqual({
      id: 1,
      type: 'load',
      locale: 'en-GB',
      personalWords: ['Original']
    })
    personalWords.push('AddedTooLate')
    workers[0].respond({ id: 1, ok: true, type: 'loaded' })
    await loading

    workers[0].crash()

    expect(workers[1].messages[0]).toEqual({
      id: 2,
      type: 'load',
      locale: 'en-GB',
      personalWords: ['Original']
    })
  })

  it('disables after the replacement worker crashes and invokes onFatal once', async () => {
    const { createWorker, workers } = factory()
    const onFatal = vi.fn()
    const client = new SpellWorkerClient({ createWorker, onFatal })

    workers[0].crash()
    expect(workers).toHaveLength(2)
    workers[1].crash()
    workers[1].crash()

    expect(workers[1].terminate).toHaveBeenCalledOnce()
    expect(onFatal).toHaveBeenCalledOnce()
    await expect(client.check(batch)).rejects.toThrow('worker-failed')
    expect(workers).toHaveLength(2)
  })

  it('routes an armed test failure through first-crash recovery without leaking request data', async () => {
    const { createWorker, workers } = factory()
    const onRestart = vi.fn()
    const client = new SpellWorkerClient({ createWorker, onRestart })
    const loaded = client.load('en-GB', ['PrivatePersonalWord'])
    workers[0].respond({ id: 1, ok: true, type: 'loaded' })
    await loaded

    client.failNextWorkerRequest()
    const failed = client.check(batch)

    await expect(failed).rejects.toThrow('worker-failed')
    await expect(failed).rejects.not.toThrow('mispeling')
    expect(workers[0].terminate).toHaveBeenCalledOnce()
    expect(workers[1].messages).toEqual([
      { id: 3, type: 'load', locale: 'en-GB', personalWords: ['PrivatePersonalWord'] },
    ])
    workers[1].respond({ id: 3, ok: true, type: 'loaded' })
    await flush()
    expect(onRestart).toHaveBeenCalledOnce()
  })

  it('holds only the armed completed check responses and releases them FIFO', async () => {
    const { createWorker, workers } = factory()
    const client = new SpellWorkerClient({ createWorker })
    client.delayNextChecks(2)

    const first = client.check(batch)
    const secondBatch = { ...batch, generation: 8 }
    const second = client.check(secondBatch)
    const third = client.suggest('mispeling')
    workers[0].respond({ id: 1, ok: true, type: 'checked', result: checked })
    workers[0].respond({ id: 2, ok: true, type: 'checked', result: { ...checked, generation: 8 } })
    workers[0].respond({ id: 3, ok: true, type: 'suggested', suggestions: ['misspelling'] })

    await expect(third).resolves.toEqual(['misspelling'])
    expect(client.delayedCheckCount()).toBe(2)
    expect(await Promise.race([first.then(() => 'released'), Promise.resolve('held')])).toBe('held')

    client.releaseNextCheck()
    await expect(first).resolves.toEqual(checked)
    expect(client.delayedCheckCount()).toBe(1)
    client.releaseNextCheck()
    await expect(second).resolves.toEqual({ ...checked, generation: 8 })
    expect(client.delayedCheckCount()).toBe(0)
  })

  it('discards pending and completed response holds when the worker crashes', async () => {
    const { createWorker, workers } = factory()
    const client = new SpellWorkerClient({ createWorker })
    client.delayNextChecks(2)
    const held = client.check(batch)
    workers[0].respond({ id: 1, ok: true, type: 'checked', result: checked })
    expect(client.delayedCheckCount()).toBe(1)

    workers[0].crash()

    await expect(held).rejects.toThrow('worker-failed')
    expect(client.delayedCheckCount()).toBe(0)
    const afterRestart = client.check(batch)
    workers[1].respond({ id: 2, ok: true, type: 'checked', result: checked })
    await expect(afterRestart).resolves.toEqual(checked)
  })
})
