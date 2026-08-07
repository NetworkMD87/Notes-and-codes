import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  SpellCheckCore,
  type SpellActionArgs,
  type SpellCheckCoreDeps,
  type SpellPane,
  type SpellWorkerPort,
} from '../../src/renderer/spellCheckCore'
import type {
  ResolvedSpellLocale,
  SpellBatch,
  SpellBatchResult,
  SpellDocument,
  SpellIssue,
} from '../../src/shared/spell'
import type { Settings, SpellDictionaryResult } from '../../src/shared/types'

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

function document(
  modelUri: string,
  text = 'speling',
  languageId = 'plaintext',
  modelVersion = 1,
): SpellDocument {
  return { modelUri, modelVersion, languageId, text }
}

const issue = (text = 'speling', start = 0): SpellIssue => ({
  text,
  start,
  end: start + text.length,
})

class FakePane implements SpellPane {
  issues: SpellIssue[] = []
  clearCount = 0
  replaceCount = 0

  constructor(public snapshot: SpellDocument | null) {}

  spellSnapshot(): SpellDocument | null { return this.snapshot }
  setSpellIssues(issues: SpellIssue[]): void { this.issues = [...issues] }
  clearSpellIssues(): void { this.clearCount++; this.issues = [] }

  replaceSpellIssue(current: SpellIssue, expectedVersion: number, replacement: string): boolean {
    const snapshot = this.snapshot
    if (
      !snapshot ||
      snapshot.modelVersion !== expectedVersion ||
      snapshot.text.slice(current.start, current.end) !== current.text
    ) return false
    this.replaceCount++
    snapshot.text = snapshot.text.slice(0, current.start) + replacement + snapshot.text.slice(current.end)
    snapshot.modelVersion++
    return true
  }
}

class FakeWorker implements SpellWorkerPort {
  loads: Array<{ locale: ResolvedSpellLocale; personalWords: string[] }> = []
  checks: Array<{ batch: SpellBatch; result: Deferred<SpellBatchResult> }> = []
  ignored: string[] = []
  added: string[] = []
  removed: string[] = []
  disposed = false
  failLoad = false
  failCommittedSync = false
  holdLoads = false
  pendingLoads: Array<Deferred<void>> = []

  async load(locale: ResolvedSpellLocale, personalWords: string[]): Promise<void> {
    this.loads.push({ locale, personalWords: [...personalWords] })
    if (this.failLoad) throw new Error('load-failed')
    if (this.holdLoads) {
      const pending = deferred<void>()
      this.pendingLoads.push(pending)
      await pending.promise
    }
  }

  check(batch: SpellBatch): Promise<SpellBatchResult> {
    const result = deferred<SpellBatchResult>()
    this.checks.push({ batch, result })
    return result.promise
  }

  async suggest(): Promise<string[]> { return ['spelling'] }
  async ignore(word: string): Promise<void> { this.ignored.push(word) }
  async addPersonal(word: string): Promise<void> { this.added.push(word) }
  async syncCommittedPersonalWords(words: string[], addedWord: string): Promise<void> {
    this.added.push(addedWord)
    if (this.failCommittedSync) throw new Error(`worker-failed:${words.join(',')}`)
  }
  async removePersonal(word: string): Promise<void> { this.removed.push(word) }
  dispose(): void { this.disposed = true }
}

function checked(batch: SpellBatch, issues: Record<string, SpellIssue[]>): SpellBatchResult {
  return {
    generation: batch.generation,
    documents: batch.documents.map(doc => ({
      modelUri: doc.modelUri,
      modelVersion: doc.modelVersion,
      issues: issues[doc.modelUri] ?? [],
    })),
  }
}

async function flush(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
}

function actionFor(doc: SpellDocument, current = issue()): SpellActionArgs {
  return {
    modelUri: doc.modelUri,
    modelVersion: doc.modelVersion,
    start: current.start,
    end: current.end,
    word: current.text,
  }
}

function harness(panes: FakePane[]) {
  const worker = new FakeWorker()
  let visible = [...panes]
  const settings: Pick<Settings, 'spellCheckEnabled' | 'spellCheckLanguage'> = {
    spellCheckEnabled: true,
    spellCheckLanguage: 'system',
  }
  let personalWords = ['Codex']
  let addResult: SpellDictionaryResult = { ok: true, words: ['Codex'] }
  const notifications: Array<{ message: string; level: 'warning' | 'error' }> = []
  const deps: SpellCheckCoreDeps = {
    panes: () => visible,
    allPanes: () => panes,
    worker,
    getSettings: () => settings,
    systemLocale: 'en-US',
    listPersonalWords: async () => [...personalWords],
    addPersonalWord: async () => addResult,
    notify: (message, level) => { notifications.push({ message, level }) },
  }
  const core = new SpellCheckCore(deps)
  return {
    core,
    worker,
    settings,
    notifications,
    setVisible: (next: FakePane[]) => { visible = next },
    setPersonalWords: (next: string[]) => { personalWords = next },
    setAddResult: (next: SpellDictionaryResult) => { addResult = next },
  }
}

describe('SpellCheckCore', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('submits only visible eligible snapshots and clears omitted panes', async () => {
    const plain = new FakePane(document('inmemory://plain'))
    const typescript = new FakePane(document('file:///code.ts', 'speling', 'typescript'))
    const hidden = new FakePane(document('inmemory://hidden', 'speling', 'markdown'))
    plain.issues = typescript.issues = hidden.issues = [issue()]
    const h = harness([plain, typescript, hidden])
    h.setVisible([plain, typescript])

    await h.core.initialize(['Codex'])

    expect(h.worker.checks).toHaveLength(1)
    expect(h.worker.checks[0].batch.documents).toEqual([plain.snapshot])
    expect(typescript.issues).toEqual([])
    expect(hidden.issues).toEqual([])
  })

  it.each([
    ['URI', document('inmemory://second', 'new text', 'plaintext', 7)],
    ['monotonic version', document('inmemory://first', 'new text', 'plaintext', 8)],
  ])('rejects a stale result when the model %s changes', async (_label, replacement) => {
    const pane = new FakePane(document('inmemory://first', 'speling', 'plaintext', 7))
    const h = harness([pane])
    await h.core.initialize([])
    const first = h.worker.checks[0]

    pane.snapshot = replacement
    first.result.resolve(checked(first.batch, { 'inmemory://first': [issue()] }))
    await flush()

    expect(pane.issues).toEqual([])
    expect(h.core.currentIssue({
      modelUri: 'inmemory://first',
      modelVersion: 7,
      startOffset: 1,
      endOffset: 1,
    })).toBeNull()
  })

  it('serializes overlapping dictionary loads and enables only the latest request', async () => {
    const pane = new FakePane(document('inmemory://load-order', 'first'))
    const h = harness([pane])
    h.worker.holdLoads = true

    const initial = h.core.initialize([])
    await flush()
    expect(h.worker.loads).toEqual([{ locale: 'en-US', personalWords: [] }])

    h.settings.spellCheckLanguage = 'en-GB'
    pane.snapshot = document('inmemory://load-order', 'second', 'plaintext', 2)
    const changed = h.core.applySettings()
    await flush()

    expect(h.worker.loads).toHaveLength(1)
    h.worker.pendingLoads[0].resolve(undefined)
    await flush()
    expect(h.worker.loads).toEqual([
      { locale: 'en-US', personalWords: [] },
      { locale: 'en-GB', personalWords: ['Codex'] },
    ])
    expect(h.worker.checks).toEqual([])

    h.worker.pendingLoads[1].resolve(undefined)
    await Promise.all([initial, changed])

    expect(h.worker.checks).toHaveLength(1)
    expect(h.worker.checks[0].batch.documents[0]).toEqual(pane.snapshot)
  })

  it('clears all panes and registry entries immediately when disabled', async () => {
    const a = new FakePane(document('inmemory://a'))
    const b = new FakePane(document('inmemory://b', 'Speling', 'markdown'))
    const h = harness([a, b])
    await h.core.initialize([])
    const check = h.worker.checks[0]
    check.result.resolve(checked(check.batch, {
      'inmemory://a': [issue()],
      'inmemory://b': [issue('Speling')],
    }))
    await flush()

    h.settings.spellCheckEnabled = false
    await h.core.applySettings()

    expect(a.issues).toEqual([])
    expect(b.issues).toEqual([])
    expect(h.core.currentIssue({
      modelUri: 'inmemory://a', modelVersion: 1, startOffset: 1, endOffset: 1,
    })).toBeNull()
  })

  it('refuses a replacement after the model text or version changes', async () => {
    const doc = document('inmemory://replace')
    const pane = new FakePane(doc)
    const h = harness([pane])
    await h.core.initialize([])
    const check = h.worker.checks[0]
    check.result.resolve(checked(check.batch, { [doc.modelUri]: [issue()] }))
    await flush()
    const action = actionFor(doc)

    pane.snapshot = document(doc.modelUri, 'changed', 'plaintext', doc.modelVersion + 1)

    expect(h.core.replace({ ...action, replacement: 'spelling' })).toBe(false)
    expect(pane.replaceCount).toBe(0)
  })

  it('does not treat the half-open issue end as part of a collapsed pointer lookup', async () => {
    const doc = document('inmemory://boundary', 'speling next')
    const pane = new FakePane(doc)
    const h = harness([pane])
    await h.core.initialize([])
    const check = h.worker.checks[0]
    check.result.resolve(checked(check.batch, { [doc.modelUri]: [issue()] }))
    await flush()

    expect(h.core.currentIssue({
      modelUri: doc.modelUri,
      modelVersion: doc.modelVersion,
      startOffset: 7,
      endOffset: 7,
    })).toBeNull()
  })

  it('ignores every matching issue case-insensitively across pane registries', async () => {
    const aDoc = document('inmemory://a', 'speling here')
    const bDoc = document('inmemory://b', 'Speling there', 'markdown')
    const a = new FakePane(aDoc)
    const b = new FakePane(bDoc)
    const h = harness([a, b])
    await h.core.initialize([])
    const check = h.worker.checks[0]
    check.result.resolve(checked(check.batch, {
      [aDoc.modelUri]: [issue('speling')],
      [bDoc.modelUri]: [issue('Speling')],
    }))
    await flush()

    await h.core.ignore(actionFor(aDoc))

    expect(h.worker.ignored).toEqual(['speling'])
    expect(a.issues).toEqual([])
    expect(b.issues).toEqual([])
  })

  it('updates the worker and registries only after personal-word persistence succeeds', async () => {
    const doc = document('inmemory://add')
    const pane = new FakePane(doc)
    const h = harness([pane])
    h.setAddResult({ ok: true, words: ['speling'] })
    await h.core.initialize([])
    const check = h.worker.checks[0]
    check.result.resolve(checked(check.batch, { [doc.modelUri]: [issue()] }))
    await flush()

    await h.core.add(actionFor(doc))

    expect(h.worker.added).toEqual(['speling'])
    expect(pane.issues).toEqual([])
    expect(h.notifications).toEqual([])
  })

  it('keeps committed dictionary state authoritative when live worker synchronization fails', async () => {
    const doc = document('inmemory://committed-add')
    const pane = new FakePane(doc)
    const h = harness([pane])
    h.setAddResult({ ok: true, words: ['Codex', 'speling'] })
    h.worker.failCommittedSync = true
    await h.core.initialize(['Codex'])
    const check = h.worker.checks[0]
    check.result.resolve(checked(check.batch, { [doc.modelUri]: [issue()] }))
    await flush()

    await h.core.add(actionFor(doc))

    expect(h.worker.added).toEqual(['speling'])
    expect(pane.issues).toEqual([])
    expect(h.notifications).toEqual([])
  })

  it('keeps issues and emits one error when personal-word persistence fails', async () => {
    const doc = document('inmemory://add-failure')
    const pane = new FakePane(doc)
    const h = harness([pane])
    h.setAddResult({ ok: false, words: [] })
    await h.core.initialize([])
    const check = h.worker.checks[0]
    check.result.resolve(checked(check.batch, { [doc.modelUri]: [issue()] }))
    await flush()

    await h.core.add(actionFor(doc))

    expect(h.worker.added).toEqual([])
    expect(pane.issues).toEqual([issue()])
    expect(h.notifications).toHaveLength(1)
    expect(h.notifications[0].level).toBe('error')
  })

  it('reloads a changed locale with current personal words and checks fresh visible text', async () => {
    const pane = new FakePane(document('inmemory://locale', 'first'))
    const h = harness([pane])
    await h.core.initialize(['Codex'])
    h.worker.checks[0].result.resolve(checked(h.worker.checks[0].batch, {}))
    await flush()
    h.settings.spellCheckLanguage = 'en-GB'
    h.setPersonalWords(['Codex', 'Monaco'])
    pane.snapshot = document('inmemory://locale', 'second', 'plaintext', 2)

    await h.core.applySettings()

    expect(h.worker.loads).toEqual([
      { locale: 'en-US', personalWords: ['Codex'] },
      { locale: 'en-GB', personalWords: ['Codex', 'Monaco'] },
    ])
    expect(h.worker.checks.at(-1)?.batch.documents[0].text).toBe('second')
  })

  it('a dictionary load failure disables only this session and warns once', async () => {
    const pane = new FakePane(document('inmemory://load'))
    pane.issues = [issue()]
    const h = harness([pane])
    h.worker.failLoad = true

    await h.core.initialize([])
    h.core.schedule()
    vi.advanceTimersByTime(300)
    h.core.workerFailed()

    expect(h.settings.spellCheckEnabled).toBe(true)
    expect(h.worker.checks).toEqual([])
    expect(pane.issues).toEqual([])
    expect(h.notifications).toHaveLength(1)
    expect(h.notifications[0].level).toBe('warning')
    expect(h.notifications[0].message).not.toContain('speling')
  })

  it.each(['', '   \r\n\t'])('does not submit %j text for dictionary correctness or suggestions', async text => {
    const pane = new FakePane(document('inmemory://blank', text))
    const h = harness([pane])

    await h.core.initialize([])
    h.core.schedule()
    vi.advanceTimersByTime(300)

    expect(h.worker.checks).toEqual([])
  })

  it('clears prior issues when a visible document becomes whitespace without worker work', async () => {
    const pane = new FakePane(document('inmemory://blank-after-issue'))
    const h = harness([pane])
    await h.core.initialize([])
    const first = h.worker.checks[0]
    first.result.resolve(checked(first.batch, { 'inmemory://blank-after-issue': [issue()] }))
    await flush()
    expect(pane.issues).toEqual([issue()])

    pane.snapshot = document('inmemory://blank-after-issue', '  \n\t', 'plaintext', 2)
    h.core.refreshNow()

    expect(h.worker.checks).toHaveLength(1)
    expect(pane.issues).toEqual([])
    expect(h.core.currentIssue({
      modelUri: 'inmemory://blank-after-issue',
      modelVersion: 1,
      startOffset: 1,
      endOffset: 1,
    })).toBeNull()
  })

  it('submits only a newly captured batch after the first worker failure recovers', async () => {
    const pane = new FakePane(document('inmemory://recovery', 'first', 'plaintext', 1))
    const h = harness([pane])
    await h.core.initialize([])
    const failed = h.worker.checks[0]

    pane.snapshot = document('inmemory://recovery', 'newly captured', 'plaintext', 2)
    failed.result.reject(new Error('worker-failed'))
    await flush()
    h.core.workerRestarted()

    expect(h.worker.checks.map(check => check.batch.documents[0].text)).toEqual([
      'first',
      'newly captured',
    ])
    expect(pane.issues).toEqual([])
    expect(h.notifications).toEqual([{
      message: 'Spell check restarted after a worker failure.',
      level: 'warning',
    }])
  })

  it('ignores an in-flight result after spell check is disabled', async () => {
    const pane = new FakePane(document('inmemory://disable'))
    const h = harness([pane])
    await h.core.initialize([])
    const late = h.worker.checks[0]

    h.settings.spellCheckEnabled = false
    await h.core.applySettings()
    late.result.resolve(checked(late.batch, { 'inmemory://disable': [issue()] }))
    await flush()

    expect(pane.issues).toEqual([])
  })

  it('ignores an old-locale result after a locale switch', async () => {
    const pane = new FakePane(document('inmemory://locale-late'))
    const h = harness([pane])
    await h.core.initialize([])
    const oldLocale = h.worker.checks[0]

    h.settings.spellCheckLanguage = 'en-GB'
    const switched = h.core.applySettings()
    oldLocale.result.resolve(checked(oldLocale.batch, { 'inmemory://locale-late': [issue()] }))
    await switched
    await flush()

    expect(pane.issues).toEqual([])
  })

  it('ignores an in-flight result after controller disposal', async () => {
    const pane = new FakePane(document('inmemory://disposed'))
    const h = harness([pane])
    await h.core.initialize([])
    const late = h.worker.checks[0]

    h.core.dispose()
    late.result.resolve(checked(late.batch, { 'inmemory://disposed': [issue()] }))
    await flush()

    expect(pane.issues).toEqual([])
  })
})
