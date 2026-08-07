import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SpellScheduler, type SpellSchedulerDeps } from '../../src/renderer/spellScheduler'
import type { SpellBatch, SpellBatchResult } from '../../src/shared/spell'

interface Deferred<T> {
  promise: Promise<T>
  resolve: (value: T) => void
  reject: (error: Error) => void
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  let reject!: (error: Error) => void
  const promise = new Promise<T>((pass, fail) => { resolve = pass; reject = fail })
  return { promise, resolve, reject }
}

const document = (text: string) => ({
  modelUri: 'file:///visible.md',
  modelVersion: text.charCodeAt(0),
  languageId: 'markdown',
  text
})

const resultFor = (batch: SpellBatch): SpellBatchResult => ({
  generation: batch.generation,
  documents: batch.documents.map(({ modelUri, modelVersion }) => ({
    modelUri,
    modelVersion,
    issues: []
  }))
})

function harness(initial = 'A') {
  let visible = initial
  const calls: SpellBatch[] = []
  const checks: Array<Deferred<SpellBatchResult>> = []
  const applied: SpellBatchResult[] = []
  let cleared = 0
  let failures = 0
  const deps: SpellSchedulerDeps = {
    snapshot: generation => ({ generation, documents: visible ? [document(visible)] : [] }),
    check: batch => {
      calls.push(batch)
      const check = deferred<SpellBatchResult>()
      checks.push(check)
      return check.promise
    },
    apply: result => { applied.push(result) },
    clear: () => { cleared++ },
    failed: () => { failures++ },
    setTimer: (callback, delay) => setTimeout(callback, delay),
    clearTimer: timer => clearTimeout(timer)
  }
  return {
    scheduler: new SpellScheduler(deps),
    calls,
    checks,
    applied,
    setVisible: (text: string) => { visible = text },
    cleared: () => cleared,
    failures: () => failures
  }
}

async function flush(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
}

describe('SpellScheduler', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('debounces rapid edits for 300 ms and snapshots only the newest text', () => {
    const h = harness()

    h.scheduler.schedule()
    vi.advanceTimersByTime(200)
    h.setVisible('B')
    h.scheduler.schedule()
    vi.advanceTimersByTime(299)
    expect(h.calls).toEqual([])

    vi.advanceTimersByTime(1)
    expect(h.calls.map(batch => batch.documents[0].text)).toEqual(['B'])
  })

  it('keeps one check in flight and coalesces B then C to calls A and C', async () => {
    const h = harness()

    h.scheduler.schedule()
    vi.advanceTimersByTime(300)
    h.setVisible('B')
    h.scheduler.schedule()
    vi.advanceTimersByTime(300)
    h.setVisible('C')
    h.scheduler.schedule()
    vi.advanceTimersByTime(300)

    expect(h.calls.map(batch => batch.documents[0].text)).toEqual(['A'])
    h.checks[0].resolve(resultFor(h.calls[0]))
    await flush()

    expect(
      h.calls.map(batch => batch.documents[0].text),
      'worker calls are exactly [A, C]',
    ).toEqual(['A', 'C'])
  })

  it('does not apply an in-flight result after generation invalidation', async () => {
    const h = harness()
    h.scheduler.refreshNow()
    const firstGeneration = h.calls[0].generation

    h.setVisible('B')
    h.scheduler.invalidate()
    h.checks[0].resolve(resultFor(h.calls[0]))
    await flush()

    expect(h.applied).toEqual([])
    expect(h.calls.map(batch => batch.documents[0].text)).toEqual(['A', 'B'])
    expect(h.calls[1].generation).toBe(firstGeneration + 1)
  })

  it('disabling cancels pending work, invalidates in-flight results, and clears', async () => {
    const h = harness()
    h.scheduler.refreshNow()
    h.setVisible('B')
    h.scheduler.schedule()

    h.scheduler.setEnabled(false)
    vi.advanceTimersByTime(300)
    h.checks[0].resolve(resultFor(h.calls[0]))
    await flush()
    h.scheduler.schedule()
    vi.advanceTimersByTime(300)

    expect(h.calls.map(batch => batch.documents[0].text)).toEqual(['A'])
    expect(h.applied).toEqual([])
    expect(h.cleared()).toBe(1)
  })

  it('locale invalidation cancels a pending edit and requests a fresh visible batch', () => {
    const h = harness()
    h.scheduler.schedule()
    vi.advanceTimersByTime(200)
    h.setVisible('fresh-locale')

    h.scheduler.invalidate()

    expect(h.calls.map(batch => batch.documents[0].text)).toEqual(['fresh-locale'])
    vi.advanceTimersByTime(100)
    expect(h.calls).toHaveLength(1)
  })

  it('does not call the worker for an empty visible-document snapshot', () => {
    const h = harness('')

    h.scheduler.refreshNow()
    h.scheduler.schedule()
    vi.advanceTimersByTime(300)

    expect(h.calls).toEqual([])
  })

  it('reports a current check failure and then submits the newest pending snapshot', async () => {
    const h = harness()
    h.scheduler.refreshNow()
    h.setVisible('B')
    h.scheduler.refreshNow()

    h.checks[0].reject(new Error('check-failed'))
    await flush()

    expect(h.failures()).toBe(1)
    expect(h.calls.map(batch => batch.documents[0].text)).toEqual(['A', 'B'])
  })

  it('dispose cancels work and prevents an in-flight result from being applied', async () => {
    const h = harness()
    h.scheduler.refreshNow()
    h.scheduler.dispose()
    h.checks[0].resolve(resultFor(h.calls[0]))
    await flush()
    h.scheduler.refreshNow()

    expect(h.calls).toHaveLength(1)
    expect(h.applied).toEqual([])
    expect(h.cleared()).toBe(1)
  })
})
