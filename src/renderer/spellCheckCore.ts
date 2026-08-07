import type {
  ResolvedSpellLocale,
  SpellBatch,
  SpellBatchResult,
  SpellDocument,
  SpellIssue,
} from '../shared/spell'
import { isSpellEligible, resolveSpellLocale } from '../shared/spellText'
import type { Settings, SpellDictionaryResult } from '../shared/types'
import { SpellScheduler } from './spellScheduler'

export interface SpellPane {
  spellSnapshot(): SpellDocument | null
  setSpellIssues(issues: SpellIssue[]): void
  clearSpellIssues(): void
  replaceSpellIssue(issue: SpellIssue, expectedVersion: number, replacement: string): boolean
}

export interface SpellWorkerPort {
  load(locale: ResolvedSpellLocale, personalWords: string[]): Promise<void>
  check(batch: SpellBatch): Promise<SpellBatchResult>
  suggest(word: string, limit?: number): Promise<string[]>
  ignore(word: string): Promise<void>
  addPersonal(word: string): Promise<void>
  syncCommittedPersonalWords(words: string[], addedWord: string): Promise<void>
  removePersonal(word: string): Promise<void>
  dispose(): void
}

export interface SpellCheckCoreDeps {
  panes: () => SpellPane[]
  allPanes: () => SpellPane[]
  worker: SpellWorkerPort
  getSettings: () => Pick<Settings, 'spellCheckEnabled' | 'spellCheckLanguage'>
  systemLocale: string
  listPersonalWords: () => Promise<string[]>
  addPersonalWord: (word: string) => Promise<SpellDictionaryResult>
  notify: (message: string, level: 'warning' | 'error') => void
}

export interface SpellIssueLookup {
  modelUri: string
  modelVersion: number
  startOffset: number
  endOffset: number
}

export interface SpellActionArgs {
  modelUri: string
  modelVersion: number
  start: number
  end: number
  word: string
  replacement?: string
}

interface IssueRegistryEntry {
  version: number
  issues: SpellIssue[]
}

interface CurrentAction {
  pane: SpellPane
  issue: SpellIssue
}

const wordKey = (word: string): string => word.toLocaleLowerCase('en')

export class SpellCheckCore {
  private readonly scheduler: SpellScheduler
  private readonly registry = new Map<string, IssueRegistryEntry>()
  private locale: ResolvedSpellLocale | null = null
  private enabled = false
  private sessionDisabled = false
  private failureNotified = false
  private disposed = false
  private loadEpoch = 0
  private loadQueue: Promise<void> = Promise.resolve()

  constructor(private readonly deps: SpellCheckCoreDeps) {
    this.scheduler = new SpellScheduler({
      snapshot: generation => this.snapshot(generation),
      check: batch => this.deps.worker.check(batch),
      apply: result => this.apply(result),
      clear: () => this.clearAll(),
      // A first worker crash rejects the in-flight call before SpellWorkerClient has restored its
      // state. Clear stale presentation now; its onRestart callback will submit a fresh snapshot.
      failed: () => this.clearAll(),
    })
    // SpellScheduler defaults to enabled, but dictionary loading is asynchronous. Keep checks
    // stopped until initialize() has loaded the boot snapshot successfully.
    this.scheduler.setEnabled(false)
  }

  async initialize(personalWords: string[]): Promise<void> {
    if (this.disposed || this.sessionDisabled) return
    const loadEpoch = ++this.loadEpoch
    if (!this.deps.getSettings().spellCheckEnabled) {
      this.enabled = false
      this.scheduler.setEnabled(false)
      return
    }
    await this.loadAndEnable(personalWords, loadEpoch)
  }

  schedule(): void { this.scheduler.schedule() }
  refreshNow(): void { this.scheduler.refreshNow() }

  async applySettings(): Promise<void> {
    if (this.disposed || this.sessionDisabled) return
    const loadEpoch = ++this.loadEpoch
    const settings = this.deps.getSettings()
    if (!settings.spellCheckEnabled) {
      this.enabled = false
      this.scheduler.setEnabled(false)
      this.clearAll()
      return
    }

    const nextLocale = resolveSpellLocale(settings.spellCheckLanguage, this.deps.systemLocale)
    if (this.enabled && nextLocale === this.locale) return
    let personalWords: string[]
    try {
      personalWords = await this.deps.listPersonalWords()
    } catch {
      if (loadEpoch === this.loadEpoch) {
        this.disableForSession('Spell check is unavailable for this session.')
      }
      return
    }
    await this.loadAndEnable(personalWords, loadEpoch)
  }

  async personalWordsChanged(personalWords: string[]): Promise<void> {
    if (this.disposed || this.sessionDisabled || !this.deps.getSettings().spellCheckEnabled) return
    await this.loadAndEnable(personalWords, ++this.loadEpoch)
  }

  workerRestarted(): void {
    if (!this.disposed && !this.sessionDisabled && this.enabled) {
      this.warnOnce('Spell check restarted after a worker failure.')
      this.scheduler.invalidate()
    }
  }

  workerFailed(): void {
    this.disableForSession('Spell check is unavailable for this session.')
  }

  currentIssue(target: SpellIssueLookup): SpellIssue | null {
    if (this.disposed || this.sessionDisabled) return null
    const entry = this.registry.get(target.modelUri)
    if (!entry || entry.version !== target.modelVersion) return null
    const collapsed = target.startOffset === target.endOffset
    return entry.issues.find(current => collapsed
      ? current.start <= target.startOffset && current.end > target.startOffset
      : current.start < target.endOffset && current.end > target.startOffset
    ) ?? null
  }

  async suggestions(target: SpellActionArgs): Promise<string[]> {
    const current = this.currentAction(target)
    if (!current) return []
    try {
      return await this.deps.worker.suggest(current.issue.text, 5)
    } catch {
      return []
    }
  }

  replace(target: SpellActionArgs): boolean {
    if (typeof target.replacement !== 'string') return false
    const current = this.currentAction(target)
    if (!current) return false
    const replaced = current.pane.replaceSpellIssue(current.issue, target.modelVersion, target.replacement)
    if (replaced) this.registry.delete(target.modelUri)
    return replaced
  }

  async ignore(target: SpellActionArgs): Promise<void> {
    const current = this.currentAction(target)
    if (!current) return
    try {
      await this.deps.worker.ignore(current.issue.text)
    } catch {
      this.deps.notify('Could not ignore that word.', 'error')
      return
    }
    this.removeWord(current.issue.text)
  }

  async add(target: SpellActionArgs): Promise<void> {
    const current = this.currentAction(target)
    if (!current) return
    let result: SpellDictionaryResult
    try {
      result = await this.deps.addPersonalWord(current.issue.text)
    } catch {
      this.deps.notify('Could not add that word to the personal dictionary.', 'error')
      return
    }
    if (!result.ok) {
      this.deps.notify('Could not add that word to the personal dictionary.', 'error')
      return
    }
    try {
      await this.deps.worker.syncCommittedPersonalWords(result.words, current.issue.text)
    } catch {
      // Persistence already succeeded. The worker client has recorded result.words as its
      // authoritative restart snapshot, so presentation must reflect the committed state even
      // while the bounded worker recovery path reloads it.
    }
    this.removeWord(current.issue.text)
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.scheduler.dispose()
    this.registry.clear()
    this.deps.worker.dispose()
  }

  private async loadAndEnable(personalWords: string[], loadEpoch: number): Promise<void> {
    if (loadEpoch !== this.loadEpoch) return
    const locale = resolveSpellLocale(
      this.deps.getSettings().spellCheckLanguage,
      this.deps.systemLocale,
    )
    this.enabled = false
    this.scheduler.setEnabled(false)
    this.clearAll()
    const load = this.loadQueue.then(() => this.deps.worker.load(locale, [...personalWords]))
    this.loadQueue = load.catch(() => undefined)
    try {
      await load
    } catch {
      if (loadEpoch === this.loadEpoch) {
        this.disableForSession('Spell check is unavailable for this session.')
      }
      return
    }
    if (
      loadEpoch !== this.loadEpoch ||
      this.disposed ||
      this.sessionDisabled ||
      !this.deps.getSettings().spellCheckEnabled
    ) return
    this.locale = locale
    this.enabled = true
    this.scheduler.setEnabled(true)
  }

  private snapshot(generation: number): SpellBatch {
    const visible = new Set(this.deps.panes())
    const documents: SpellDocument[] = []
    const currentUris = new Set<string>()

    for (const pane of this.deps.allPanes()) {
      const current = pane.spellSnapshot()
      if (!current) {
        pane.clearSpellIssues()
        continue
      }
      if (!visible.has(pane) || !isSpellEligible(current.languageId)) {
        pane.clearSpellIssues()
        this.registry.delete(current.modelUri)
        continue
      }
      if (!/\S/.test(current.text)) {
        pane.clearSpellIssues()
        this.registry.delete(current.modelUri)
        continue
      }
      documents.push(current)
      currentUris.add(current.modelUri)
    }

    for (const uri of this.registry.keys()) {
      if (!currentUris.has(uri)) this.registry.delete(uri)
    }
    return { generation, documents }
  }

  private apply(result: SpellBatchResult): void {
    const visible = new Set(this.deps.panes())
    const returned = new Map(result.documents.map(document => [document.modelUri, document]))
    const appliedUris = new Set<string>()

    for (const pane of this.deps.allPanes()) {
      const current = pane.spellSnapshot()
      if (!current || !visible.has(pane) || !isSpellEligible(current.languageId)) {
        pane.clearSpellIssues()
        if (current) this.registry.delete(current.modelUri)
        continue
      }
      const document = returned.get(current.modelUri)
      if (!document || document.modelVersion !== current.modelVersion) {
        pane.clearSpellIssues()
        this.registry.delete(current.modelUri)
        continue
      }
      pane.setSpellIssues(document.issues)
      this.registry.set(current.modelUri, {
        version: current.modelVersion,
        issues: [...document.issues],
      })
      appliedUris.add(current.modelUri)
    }

    for (const uri of this.registry.keys()) {
      if (!appliedUris.has(uri)) this.registry.delete(uri)
    }
  }

  private currentAction(target: SpellActionArgs): CurrentAction | null {
    const entry = this.registry.get(target.modelUri)
    if (!entry || entry.version !== target.modelVersion) return null
    const issue = entry.issues.find(current => (
      current.start === target.start &&
      current.end === target.end &&
      current.text === target.word
    ))
    if (!issue) return null

    for (const pane of this.deps.allPanes()) {
      const snapshot = pane.spellSnapshot()
      if (
        snapshot?.modelUri === target.modelUri &&
        snapshot.modelVersion === target.modelVersion &&
        snapshot.text.slice(target.start, target.end) === target.word
      ) return { pane, issue }
    }
    return null
  }

  private removeWord(word: string): void {
    const target = wordKey(word)
    for (const [uri, entry] of this.registry) {
      const issues = entry.issues.filter(current => wordKey(current.text) !== target)
      if (issues.length) this.registry.set(uri, { version: entry.version, issues })
      else this.registry.delete(uri)
    }

    for (const pane of this.deps.allPanes()) {
      const snapshot = pane.spellSnapshot()
      if (!snapshot) { pane.clearSpellIssues(); continue }
      const entry = this.registry.get(snapshot.modelUri)
      if (entry?.version === snapshot.modelVersion) pane.setSpellIssues(entry.issues)
      else pane.clearSpellIssues()
    }
  }

  private clearAll(): void {
    this.registry.clear()
    for (const pane of this.deps.allPanes()) pane.clearSpellIssues()
  }

  private disableForSession(message: string): void {
    if (this.disposed || this.sessionDisabled) return
    this.sessionDisabled = true
    this.enabled = false
    this.scheduler.setEnabled(false)
    this.clearAll()
    this.warnOnce(message)
  }

  private warnOnce(message: string): void {
    if (this.failureNotified) return
    this.failureNotified = true
    this.deps.notify(message, 'warning')
  }
}
