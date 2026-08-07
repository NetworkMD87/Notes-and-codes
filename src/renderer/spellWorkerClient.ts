import type {
  ResolvedSpellLocale,
  SpellBatch,
  SpellBatchResult,
  SpellWorkerRequest,
  SpellWorkerResponse
} from '../shared/spell'

type WorkerPort = Pick<Worker, 'postMessage' | 'terminate' | 'addEventListener' | 'removeEventListener'>
export type WorkerFactory = () => WorkerPort

export interface SpellWorkerClientOptions {
  createWorker?: WorkerFactory
  onRestart?: () => void
  onFatal?: () => void
  requestTimeoutMs?: number
}

type RequestBody = SpellWorkerRequest extends infer Request
  ? Request extends { id: number } ? Omit<Request, 'id'> : never
  : never

interface PendingRequest {
  resolve: (response: SpellWorkerResponse) => void
  reject: (error: Error) => void
  timer: ReturnType<typeof setTimeout>
}

export interface SpellWorkerTestHooks {
  failNextWorkerRequest(): void
  delayNextChecks(count: number): void
  delayedCheckCount(): number
  releaseNextCheck(): void
}

interface SpellTestHookTarget { __ncSpellTest?: SpellWorkerTestHooks }

const workerError = (): Error => new Error('worker-failed')
const wordKey = (word: string): string => word.toLocaleLowerCase('en')

const defaultWorkerFactory: WorkerFactory = () =>
  new Worker(new URL('./spell.worker.ts', import.meta.url), { type: 'module', name: 'spell-check' })

export class SpellWorkerClient {
  private readonly createWorker: WorkerFactory
  private readonly onRestart: () => void
  private readonly onFatal: () => void
  private readonly requestTimeoutMs: number
  private worker: WorkerPort | null = null
  private nextId = 1
  private readonly pending = new Map<number, PendingRequest>()
  private locale: ResolvedSpellLocale | null = null
  private personalWords = new Map<string, string>()
  private readonly sessionIgnores = new Map<string, string>()
  private recovery: Promise<void> | null = null
  private restarted = false
  private disabled = false
  private disposed = false
  private fatalNotified = false
  private failNext = false
  private checksToDelay = 0
  private readonly delayedChecks: SpellWorkerResponse[] = []

  private readonly messageListener = (event: MessageEvent<SpellWorkerResponse>): void => {
    const response = event.data
    if (response.ok && response.type === 'checked' && this.checksToDelay > 0) {
      this.checksToDelay--
      this.delayedChecks.push(response)
      return
    }
    this.deliver(response)
  }

  private deliver(response: SpellWorkerResponse): void {
    const request = this.pending.get(response.id)
    if (!request) return
    this.pending.delete(response.id)
    clearTimeout(request.timer)
    if (!response.ok) {
      request.reject(workerError())
      this.handleCrash()
      return
    }
    request.resolve(response)
  }

  private readonly errorListener = (): void => { this.handleCrash() }

  constructor(options: SpellWorkerClientOptions = {}) {
    this.createWorker = options.createWorker ?? defaultWorkerFactory
    this.onRestart = options.onRestart ?? (() => undefined)
    this.onFatal = options.onFatal ?? (() => undefined)
    this.requestTimeoutMs = Math.max(1, Math.min(options.requestTimeoutMs ?? 5_000, 60_000))
    try {
      this.worker = this.createWorker()
      this.attach(this.worker)
    } catch {
      this.disabled = true
      this.fatalNotified = true
      queueMicrotask(() => { if (!this.disposed) this.onFatal() })
    }
  }

  async load(locale: ResolvedSpellLocale, personalWords: string[]): Promise<void> {
    const sentPersonalWords = [...personalWords]
    await this.whenReady(() => this.sendMutation({
      type: 'load',
      locale,
      personalWords: sentPersonalWords
    }, 'loaded'))
    this.locale = locale
    this.personalWords = new Map()
    for (const word of sentPersonalWords) {
      const key = wordKey(word)
      if (!this.personalWords.has(key)) this.personalWords.set(key, word)
    }
  }

  check(batch: SpellBatch): Promise<SpellBatchResult> {
    return this.whenReady(() => this.send({ type: 'check', batch }, response => {
      if (response.ok && response.type === 'checked') return response.result
      throw this.responseError(response)
    }))
  }

  suggest(word: string, limit = 5): Promise<string[]> {
    return this.whenReady(() => this.send({ type: 'suggest', word, limit }, response => {
      if (response.ok && response.type === 'suggested') return response.suggestions
      throw this.responseError(response)
    }))
  }

  async ignore(word: string): Promise<void> {
    await this.whenReady(() => this.sendMutation({ type: 'ignore', word }, 'mutated'))
    this.sessionIgnores.set(wordKey(word), word)
  }

  async addPersonal(word: string): Promise<void> {
    await this.whenReady(() => this.sendMutation({ type: 'personal:add', word }, 'mutated'))
    const key = wordKey(word)
    if (!this.personalWords.has(key)) this.personalWords.set(key, word)
  }

  async syncCommittedPersonalWords(personalWords: string[], addedWord: string): Promise<void> {
    this.personalWords = this.wordMap(personalWords)
    await this.whenReady(() => this.sendMutation({ type: 'personal:add', word: addedWord }, 'mutated'))
  }

  async removePersonal(word: string): Promise<void> {
    await this.whenReady(() => this.sendMutation({ type: 'personal:remove', word }, 'mutated'))
    this.personalWords.delete(wordKey(word))
  }

  failNextWorkerRequest(): void { this.failNext = true }

  delayNextChecks(count: number): void {
    this.checksToDelay = Math.max(0, Math.trunc(count))
  }

  delayedCheckCount(): number { return this.delayedChecks.length }

  releaseNextCheck(): void {
    const response = this.delayedChecks.shift()
    if (response) this.deliver(response)
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    if (this.worker) {
      this.detach(this.worker)
      this.worker.terminate()
      this.worker = null
    }
    this.checksToDelay = 0
    this.delayedChecks.length = 0
    this.rejectPending()
  }

  private whenReady<T>(operation: () => Promise<T>): Promise<T> {
    if (this.disabled || this.disposed) return Promise.reject(workerError())
    return this.recovery ? this.recovery.then(operation) : operation()
  }

  private sendMutation(
    request: RequestBody,
    expected: 'loaded' | 'mutated'
  ): Promise<void> {
    return this.send(request, response => {
      if (response.ok && response.type === expected) return
      throw this.responseError(response)
    })
  }

  private send<T>(request: RequestBody, read: (response: SpellWorkerResponse) => T): Promise<T> {
    if (this.disabled || this.disposed) return Promise.reject(workerError())
    const id = this.nextId++
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        const pending = this.pending.get(id)
        if (!pending) return
        clearTimeout(timer)
        this.pending.delete(id)
        pending.reject(workerError())
        this.handleCrash()
      }, this.requestTimeoutMs)
      this.pending.set(id, {
        resolve: response => {
          try { resolve(read(response)) } catch (error) {
            reject(error instanceof Error ? error : workerError())
            this.handleCrash()
          }
        },
        reject,
        timer,
      })
      if (this.failNext) {
        this.failNext = false
        this.handleCrash()
      } else {
        try {
          this.worker!.postMessage({ ...request, id } as SpellWorkerRequest)
        } catch {
          clearTimeout(timer)
          this.pending.delete(id)
          reject(workerError())
          this.handleCrash()
        }
      }
    })
  }

  private responseError(response: SpellWorkerResponse): Error {
    return new Error(response.ok ? 'worker-failed' : response.error)
  }

  private handleCrash(): void {
    if (this.disabled || this.disposed) return
    if (this.worker) {
      this.detach(this.worker)
      this.worker.terminate()
      this.worker = null
    }
    this.checksToDelay = 0
    this.delayedChecks.length = 0
    this.rejectPending()

    if (this.restarted) {
      this.disableFatally(true)
      return
    }

    this.restarted = true
    try {
      const worker = this.createWorker()
      this.worker = worker
      this.attach(worker)
    } catch {
      this.disableFatally()
      return
    }

    const recovery = this.restoreSnapshot()
    this.recovery = recovery
    void recovery.then(() => {
      if (this.recovery === recovery) this.recovery = null
      if (!this.disabled && !this.disposed) this.onRestart()
    }).catch(() => this.disableFatally())
  }

  private async restoreSnapshot(): Promise<void> {
    if (this.locale) {
      await this.sendMutation({
        type: 'load',
        locale: this.locale,
        personalWords: [...this.personalWords.values()]
      }, 'loaded')
    }
    for (const word of this.sessionIgnores.values()) {
      await this.sendMutation({ type: 'ignore', word }, 'mutated')
    }
  }

  private disableFatally(workerStopped = false): void {
    if (this.disabled || this.disposed) return
    this.disabled = true
    this.recovery = null
    if (!workerStopped) {
      if (this.worker) {
        this.detach(this.worker)
        this.worker.terminate()
        this.worker = null
      }
    }
    this.rejectPending()
    if (!this.fatalNotified) {
      this.fatalNotified = true
      this.onFatal()
    }
  }

  private rejectPending(): void {
    const requests = [...this.pending.values()]
    this.pending.clear()
    for (const request of requests) {
      clearTimeout(request.timer)
      request.reject(workerError())
    }
  }

  private wordMap(words: string[]): Map<string, string> {
    const result = new Map<string, string>()
    for (const word of words) {
      const key = wordKey(word)
      if (!result.has(key)) result.set(key, word)
    }
    return result
  }

  private attach(worker: WorkerPort): void {
    worker.addEventListener('message', this.messageListener as EventListener)
    worker.addEventListener('error', this.errorListener)
  }

  private detach(worker: WorkerPort): void {
    worker.removeEventListener('message', this.messageListener as EventListener)
    worker.removeEventListener('error', this.errorListener)
  }
}

export function exposeSpellTestHooks(
  search: URLSearchParams,
  client: SpellWorkerClient,
  target: SpellTestHookTarget,
): void {
  if (search.get('nc-headless') !== '1') return
  target.__ncSpellTest = {
    failNextWorkerRequest: () => client.failNextWorkerRequest(),
    delayNextChecks: count => client.delayNextChecks(count),
    delayedCheckCount: () => client.delayedCheckCount(),
    releaseNextCheck: () => client.releaseNextCheck(),
  }
}
