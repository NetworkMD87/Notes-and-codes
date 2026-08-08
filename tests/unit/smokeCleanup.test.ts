import type { ChildProcess } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import {
  classifyCleanup,
  execFileWithTimeout,
  formatCleanupIssues,
  SmokeResources,
  type CleanupIssue,
  type ElectronLaunchOptions,
} from '../smoke/smokeCleanup'
import { reportCleanup } from '../smoke/smokeTest'

const playwrightDouble = vi.hoisted(() => {
  const state: { application?: unknown } = {}
  const electron = {
    async launch(this: unknown): Promise<unknown> {
      if (this !== electron) throw new TypeError('Playwright launch receiver was lost')
      return state.application
    },
  }
  return { electron, state }
})

vi.mock('@playwright/test', async importOriginal => ({
  ...await importOriginal<typeof import('@playwright/test')>(),
  _electron: playwrightDouble.electron,
}))

class FakeChild {
  pid: number | undefined
  exitCode: number | null = null
  private exitListeners: Array<(code: number | null) => void> = []

  constructor(pid: number | undefined) { this.pid = pid }

  once(event: 'exit', listener: (code: number | null) => void): this {
    if (event === 'exit') this.exitListeners.push(listener)
    return this
  }

  kill(): boolean { return true }

  exit(code: number): void {
    if (this.exitCode !== null) return
    this.exitCode = code
    for (const listener of this.exitListeners.splice(0)) listener(code)
  }
}

class FakeApplication {
  readonly child: FakeChild
  private exitsOnClose = false
  private closeFailure?: Error
  private closeWait?: Promise<void>

  constructor(private readonly name: string, pid: number, private readonly log: string[]) {
    this.child = new FakeChild(pid)
  }

  process(): ChildProcess { return this.child as unknown as ChildProcess }

  async close(): Promise<void> {
    this.log.push(`close:${this.name}`)
    if (this.closeFailure) throw this.closeFailure
    if (this.exitsOnClose) this.child.exit(0)
    await this.closeWait
  }

  exitOnClose(): void { this.exitsOnClose = true }
  waitDuringClose(promise: Promise<void>): void { this.closeWait = promise }
  rejectOnClose(error = new Error('close failed')): void { this.closeFailure = error }
}

interface Deferred {
  promise: Promise<void>
  resolve: () => void
}

function deferred(): Deferred {
  let resolve!: () => void
  const promise = new Promise<void>(done => { resolve = done })
  return { promise, resolve }
}

class DeferredDelays {
  hold = false
  readonly pending: Deferred[] = []
  readonly calls: number[] = []

  delay(ms: number): Promise<void> {
    this.calls.push(ms)
    const next = deferred()
    this.pending.push(next)
    if (!this.hold) next.resolve()
    return next.promise
  }

  releaseNext(): void {
    const next = this.pending.shift()
    if (!next) throw new Error('No pending delay')
    next.resolve()
  }
}

class Directories {
  private readonly values: string[] = []
  makeCalls = 0

  returnNext(name: string): void { this.values.push(join(tmpdir(), name)) }
  returnPath(path: string): void { this.values.push(path) }
  make(): string {
    this.makeCalls++
    const next = this.values.shift()
    if (!next) throw new Error('No test directory configured')
    return next
  }
}

class Removals {
  readonly calls: string[] = []
  readonly failures: Error[] = []

  fail(code: string): void {
    const error = new Error(`remove failed: ${code}`) as NodeJS.ErrnoException
    error.code = code
    this.failures.push(error)
  }

  remove(path: string): void {
    this.calls.push(path)
    const failure = this.failures.shift()
    if (failure) throw failure
  }
}

function harness() {
  const log: string[] = []
  const appA = new FakeApplication('app-a', 101, log)
  const appB = new FakeApplication('app-b', 102, log)
  const child = new FakeChild(103)
  const directories = new Directories()
  const removals = new Removals()
  const delays = new DeferredDelays()
  const apps = [appA, appB]
  const names = new Map<unknown, string>([
    [appA.child, 'app-a'], [appB.child, 'app-b'], [child, 'second-instance'],
  ])
  const smoke = new SmokeResources({
    launchElectron: async (_options: ElectronLaunchOptions) => apps.shift() as unknown as Awaited<ReturnType<SmokeResources['launch']>>,
    makeTempDir: () => directories.make(),
    removeDir: path => {
      log.push(`remove:${path.split(/[\\/]/).pop()}`)
      removals.remove(path)
    },
    forceTerminate: async process => { log.push(`force:${names.get(process)}`) },
    delay: ms => delays.delay(ms),
  })
  return { smoke, log, appA, appB, child, directories, removals, delays }
}

async function flush(): Promise<void> {
  for (let index = 0; index < 8; index++) await Promise.resolve()
}

function issue(kind: CleanupIssue['kind'], label: string): CleanupIssue {
  return { kind, label, error: new Error(`Could not clean ${label}`) }
}

describe('SmokeResources', () => {
  it('kills and rejects a helper subprocess that exceeds the exec bound', async () => {
    const startedAt = Date.now()
    let failure: unknown

    try {
      await execFileWithTimeout(process.execPath, ['-e', 'setInterval(() => undefined, 1_000)'], 100)
    } catch (error) {
      failure = error
    }

    expect(failure).toMatchObject({ killed: true, signal: 'SIGTERM' })
    expect(Date.now() - startedAt).toBeLessThan(2_000)
  })

  it('registers the real second-instance process at creation', () => {
    const source = readFileSync(
      join(process.cwd(), 'tests/smoke/startup-window.spec.ts'),
      'utf8',
    )
    expect(source.match(/\bspawn\(/g)).toHaveLength(1)
    expect(source).toMatch(/smoke\.trackChild\(\s*spawn\(/)
  })

  it('preserves the Playwright receiver when using the default launcher', async () => {
    const log: string[] = []
    const app = new FakeApplication('default-launch', 100, log)
    playwrightDouble.state.application = app
    const smoke = new SmokeResources()

    await expect(smoke.launch({ args: ['app'] })).resolves.toBe(app)
    app.child.exit(0)
  })

  it('cleans processes before directories in reverse registration order', async () => {
    const { smoke, log, appA, appB, child, directories } = harness()
    smoke.trackChild(child as unknown as ChildProcess, 'second-instance')
    await smoke.launch({ args: ['app-a'] })
    await smoke.launch({ args: ['app-b'] })
    directories.returnNext('notes-a-123')
    smoke.tempDir('notes-a-')
    directories.returnNext('notes-b-456')
    smoke.tempDir('notes-b-')
    appA.exitOnClose(); appB.exitOnClose(); child.exit(0)

    expect(await smoke.cleanup()).toEqual([])
    expect(log).toEqual([
      'close:app-b', 'close:app-a',
      'remove:notes-b-456', 'remove:notes-a-123',
    ])
  })

  it('is a no-op when cleanup is called twice', async () => {
    const { smoke, appA, log } = harness()
    await smoke.launch({ args: ['app-a'] })
    appA.exitOnClose()
    await smoke.cleanup()
    await smoke.cleanup()
    expect(log.filter(entry => entry === 'close:app-a')).toHaveLength(1)
  })

  it('does not close or force resources already exited at registration', async () => {
    const { smoke, appA, child, log } = harness()
    appA.child.exit(0)
    child.exit(0)
    await smoke.launch({ args: ['app-a'] })
    smoke.trackChild(child as unknown as ChildProcess, 'second-instance')

    expect(await smoke.cleanup()).toEqual([])
    expect(log).toEqual([])
  })

  it('does not force an application that exits during close', async () => {
    const { smoke, appA, log } = harness()
    await smoke.launch({ args: ['app-a'] })
    appA.exitOnClose()

    expect(await smoke.cleanup()).toEqual([])
    expect(log).toEqual(['close:app-a'])
  })

  it('holds directories for close settlement or the single graceful bound after application exit', async () => {
    const { smoke, appA, directories, delays, log } = harness()
    const close = deferred()
    await smoke.launch({ args: ['app-a'] })
    directories.returnNext('notes-after-close-123')
    smoke.tempDir('notes-after-close-')
    appA.exitOnClose()
    appA.waitDuringClose(close.promise)
    delays.hold = true

    let complete = false
    const cleaning = smoke.cleanup().then(issues => { complete = true; return issues })
    await flush()
    expect(appA.child.exitCode).toBe(0)
    expect(complete).toBe(false)
    expect(log).toEqual(['close:app-a'])

    delays.releaseNext()
    expect(await cleaning).toEqual([])
    expect(log).toEqual(['close:app-a', 'remove:notes-after-close-123'])
    close.resolve()
  })

  it('forces a live application after grace and waits for its real exit', async () => {
    const { smoke, appA, delays, log } = harness()
    await smoke.launch({ args: ['app-a'] })
    delays.hold = true

    let complete = false
    const cleaning = smoke.cleanup().then(issues => { complete = true; return issues })
    await flush()
    delays.releaseNext()
    await flush()
    expect(log).toEqual(['close:app-a', 'force:app-a'])
    expect(complete).toBe(false)

    appA.child.exit(1)
    expect(await cleaning).toEqual([])
  })

  it('forces a manual child after grace and waits for its real exit', async () => {
    const { smoke, child, delays, log } = harness()
    smoke.trackChild(child as unknown as ChildProcess, 'second-instance')
    delays.hold = true

    let complete = false
    const cleaning = smoke.cleanup().then(issues => { complete = true; return issues })
    await flush()
    delays.releaseNext()
    await flush()
    expect(log).toEqual(['force:second-instance'])
    expect(complete).toBe(false)

    child.exit(1)
    expect(await cleaning).toEqual([])
  })

  it('reports one issue when a forced child never exits', async () => {
    const { smoke, child, delays } = harness()
    smoke.trackChild(child as unknown as ChildProcess, 'second-instance')
    delays.hold = true

    const cleaning = smoke.cleanup()
    await flush()
    delays.releaseNext()
    await flush()
    delays.releaseNext()

    expect(await cleaning).toMatchObject([{ kind: 'child', label: 'second-instance' }])
  })

  it('bounds a hung force attempt and continues with directories', async () => {
    const log: string[] = []
    const child = new FakeChild(201)
    const delays = new DeferredDelays()
    delays.hold = true
    const directory = join(tmpdir(), 'notes-after-force-123')
    const smoke = new SmokeResources({
      makeTempDir: () => directory,
      removeDir: path => { log.push(`remove:${path.split(/[\\/]/).pop()}`) },
      forceTerminate: async () => {
        log.push('force:hung-child')
        await new Promise<void>(() => undefined)
      },
      delay: ms => delays.delay(ms),
    })
    smoke.trackChild(child as unknown as ChildProcess, 'hung-child')
    smoke.tempDir('notes-after-force-')

    const cleaning = smoke.cleanup()
    await flush()
    delays.releaseNext()
    await flush()
    expect(log).toEqual(['force:hung-child'])
    delays.releaseNext()

    expect(await cleaning).toMatchObject([{ kind: 'child', label: 'hung-child' }])
    expect(log).toEqual(['force:hung-child', 'remove:notes-after-force-123'])
  })

  it('uses the PID captured at child registration for force and diagnostics', async () => {
    const { delays } = harness()
    const child = new FakeChild(301)
    const forcedPids: number[] = []
    const resources = new SmokeResources({
      forceTerminate: async (_child, pid) => { forcedPids.push(pid) },
      delay: ms => delays.delay(ms),
    })
    resources.trackChild(child as unknown as ChildProcess, 'pid-snapshot')
    child.pid = 999

    const issues = await resources.cleanup()
    expect(forcedPids).toEqual([301])
    expect(issues[0].error.message).toContain('PID 301')
    expect(issues[0].error.message).not.toContain('999')
  })

  it('continues cleanup after a process failure', async () => {
    const { smoke, appA, appB, directories, log } = harness()
    await smoke.launch({ args: ['app-a'] })
    await smoke.launch({ args: ['app-b'] })
    appA.exitOnClose()
    appB.rejectOnClose()
    directories.returnNext('notes-a-123')
    smoke.tempDir('notes-a-')

    expect(await smoke.cleanup()).toHaveLength(1)
    expect(log).toEqual(['close:app-b', 'force:app-b', 'close:app-a', 'remove:notes-a-123'])
  })

  it.each([undefined, 0, -1, 1.5])('rejects unsafe PID %s without taskkill', async pid => {
    const { smoke, log } = harness()
    smoke.trackChild(new FakeChild(pid) as unknown as ChildProcess, 'invalid-child')

    expect(await smoke.cleanup()).toMatchObject([{ kind: 'child', label: 'invalid-child' }])
    expect(log).not.toContain('force:undefined')
  })

  it('rejects a non-notes temp prefix before creating a directory', () => {
    const { smoke, directories } = harness()

    expect(() => smoke.tempDir('scratch-')).toThrow('notes-')
    expect(directories.makeCalls).toBe(0)
  })

  it.each([
    tmpdir(),
    join(tmpdir(), '..', 'notes-outside-123'),
    join(tmpdir(), 'scratch-123'),
  ])('rejects unsafe temp directory result %s without recording it', unsafePath => {
    const { smoke, directories, log } = harness()
    directories.returnPath(unsafePath)

    expect(() => smoke.tempDir('notes-safe-')).toThrow()
    expect(directories.makeCalls).toBe(1)
    expect(log).toEqual([])
  })

  it.each(['EBUSY', 'EPERM', 'ENOTEMPTY'])('retries transient directory removal error %s', async code => {
    const { smoke, directories, removals, delays } = harness()
    directories.returnNext('notes-retry-123')
    smoke.tempDir('notes-retry-')
    removals.fail(code)
    removals.fail(code)

    expect(await smoke.cleanup()).toEqual([])
    expect(removals.calls).toHaveLength(3)
    expect(delays.calls).toEqual([100, 100])
  })

  it('reports non-transient directory removal errors immediately', async () => {
    const { smoke, directories, removals, delays } = harness()
    directories.returnNext('notes-denied-123')
    smoke.tempDir('notes-denied-')
    removals.fail('EACCES')

    expect(await smoke.cleanup()).toMatchObject([{ kind: 'directory', label: 'notes-denied-123' }])
    expect(removals.calls).toHaveLength(1)
    expect(delays.calls).toEqual([])
  })

  it('reports a directory issue after the initial removal attempt plus five transient retries', async () => {
    const { smoke, directories, removals, delays } = harness()
    directories.returnNext('notes-busy-123')
    smoke.tempDir('notes-busy-')
    for (let attempt = 0; attempt < 6; attempt++) removals.fail('EBUSY')

    expect(await smoke.cleanup()).toMatchObject([{ kind: 'directory', label: 'notes-busy-123' }])
    expect(removals.calls).toHaveLength(6)
    expect(delays.calls).toEqual([100, 100, 100, 100, 100])
  })

  it('does not let a rejected directory prevent cleanup of a later valid directory', async () => {
    const { smoke, directories, log } = harness()
    directories.returnPath(tmpdir())
    expect(() => smoke.tempDir('notes-invalid-')).toThrow()
    directories.returnNext('notes-valid-123')
    smoke.tempDir('notes-valid-')

    expect(await smoke.cleanup()).toEqual([])
    expect(log).toEqual(['remove:notes-valid-123'])
  })
})

describe('cleanup classification', () => {
  it('fails an otherwise passing test with all cleanup causes', () => {
    const issues = [issue('application', 'app-a'), issue('directory', 'notes-a')]
    const result = classifyCleanup(issues, undefined)
    expect(result.throwError).toBeInstanceOf(AggregateError)
    expect(result.throwError?.errors).toHaveLength(2)
    expect(result.diagnostic).toContain('app-a')
    expect(result.diagnostic).toContain('notes-a')
  })

  it('preserves an existing body failure while returning cleanup diagnostics', () => {
    const result = classifyCleanup([issue('directory', 'notes-a')], new Error('primary'))
    expect(result.throwError).toBeUndefined()
    expect(result.diagnostic).toContain('notes-a')
  })

  it('formats cleanup issues in a stable, line-oriented diagnostic', () => {
    expect(formatCleanupIssues([issue('child', 'second-instance')])).toBe(
      'Smoke cleanup issues:\n- child second-instance: Could not clean second-instance',
    )
  })
})

describe('cleanup reporting', () => {
  it('fails a clean body after attaching and reporting cleanup issues', async () => {
    const attachments: Array<{ name: string; body: string }> = []
    const diagnostics: string[] = []

    await expect(reportCleanup(
      [issue('directory', 'notes-a')],
      undefined,
      async (name, body) => { attachments.push({ name, body }) },
      message => { diagnostics.push(message) },
    )).rejects.toBeInstanceOf(AggregateError)

    expect(attachments).toEqual([{
      name: 'smoke-cleanup.txt',
      body: 'Smoke cleanup issues:\n- directory notes-a: Could not clean notes-a',
    }])
    expect(diagnostics).toEqual(['Smoke cleanup issues:\n- directory notes-a: Could not clean notes-a'])
  })

  it('preserves a body failure after attaching and reporting cleanup issues', async () => {
    const attachments: Array<{ name: string; body: string }> = []
    const diagnostics: string[] = []

    await expect(reportCleanup(
      [issue('child', 'second-instance')],
      new Error('body failed'),
      async (name, body) => { attachments.push({ name, body }) },
      message => { diagnostics.push(message) },
    )).resolves.toBeUndefined()

    expect(attachments).toEqual([{
      name: 'smoke-cleanup.txt',
      body: 'Smoke cleanup issues:\n- child second-instance: Could not clean second-instance',
    }])
    expect(diagnostics).toEqual(['Smoke cleanup issues:\n- child second-instance: Could not clean second-instance'])
  })

  it('preserves a body failure and reports diagnostics when attachment fails', async () => {
    const diagnostics: string[] = []

    await expect(reportCleanup(
      [issue('child', 'second-instance')],
      new Error('body failed'),
      async () => { throw new Error('attachment unavailable') },
      message => { diagnostics.push(message) },
    )).resolves.toBeUndefined()

    expect(diagnostics).toEqual([
      'Smoke cleanup issues:\n- child second-instance: Could not clean second-instance\n' +
      'Smoke cleanup attachment failed: attachment unavailable',
    ])
  })

  it('includes attachment failure with cleanup causes when the body is clean', async () => {
    const cleanup = issue('directory', 'notes-a')
    const attachmentFailure = new Error('attachment unavailable')
    const diagnostics: string[] = []
    let thrown: unknown

    try {
      await reportCleanup(
        [cleanup],
        undefined,
        async () => { throw attachmentFailure },
        message => { diagnostics.push(message) },
      )
    } catch (error) {
      thrown = error
    }

    expect(thrown).toBeInstanceOf(AggregateError)
    expect((thrown as AggregateError).errors).toEqual([cleanup.error, attachmentFailure])
    expect(diagnostics).toEqual([
      'Smoke cleanup issues:\n- directory notes-a: Could not clean notes-a\n' +
      'Smoke cleanup attachment failed: attachment unavailable',
    ])
  })

  it('does nothing when cleanup has no issues', async () => {
    const attachments: Array<{ name: string; body: string }> = []
    const diagnostics: string[] = []

    await expect(reportCleanup(
      [],
      undefined,
      async (name, body) => { attachments.push({ name, body }) },
      message => { diagnostics.push(message) },
    )).resolves.toBeUndefined()

    expect(attachments).toEqual([])
    expect(diagnostics).toEqual([])
  })
})
