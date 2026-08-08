import { _electron as electron, type ElectronApplication } from '@playwright/test'
import { execFile } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, isAbsolute, join, relative, resolve } from 'node:path'
import { promisify } from 'node:util'

export type ElectronLaunchOptions = Parameters<typeof electron.launch>[0]
export type CleanupKind = 'application' | 'child' | 'directory'

export interface CleanupIssue {
  kind: CleanupKind
  label: string
  error: Error
}

export interface CleanupDisposition {
  diagnostic?: string
  throwError?: AggregateError
}

export interface SmokeCleanupOps {
  launchElectron(options: ElectronLaunchOptions): Promise<ElectronApplication>
  makeTempDir(prefixPath: string): string
  removeDir(path: string): void
  forceTerminate(child: ChildProcess, pid: number): Promise<void>
  delay(ms: number): Promise<void>
}

interface ExitObservation {
  done: boolean
  promise: Promise<void>
}

interface TrackedProcess {
  kind: 'application' | 'child'
  label: string
  child: ChildProcess
  pid?: number
  close?: () => Promise<void>
  exited: ExitObservation
}

const execFileAsync = promisify(execFile)

export class SmokeResources {
  private readonly ops: SmokeCleanupOps
  private readonly processes: TrackedProcess[] = []
  private readonly directories: string[] = []
  private cleanupPromise?: Promise<CleanupIssue[]>

  constructor(ops: Partial<SmokeCleanupOps> = {}) {
    this.ops = {
      launchElectron: options => electron.launch(options),
      makeTempDir: mkdtempSync,
      removeDir: path => rmSync(path, { recursive: true, force: true }),
      forceTerminate: defaultForceTerminate,
      delay: ms => new Promise(resolveDelay => {
        const timer = setTimeout(resolveDelay, ms)
        timer.unref()
      }),
      ...ops,
    }
  }

  tempDir(prefix: string): string {
    if (!prefix.startsWith('notes-')) throw new Error('Smoke temp directory prefixes must start with notes-')
    const path = this.ops.makeTempDir(join(tmpdir(), prefix))
    if (!isSafeTempDirectory(path)) throw new Error('Smoke temp directory must be a notes-* child of the system temp directory')
    this.directories.push(path)
    return path
  }

  async launch(options: ElectronLaunchOptions): Promise<ElectronApplication> {
    const app = await this.ops.launchElectron(options)
    const child = app.process()
    const pid = registeredPid(child.pid)
    this.processes.push({
      kind: 'application',
      label: applicationLabel(pid),
      child,
      pid,
      close: () => app.close(),
      exited: observeExit(child),
    })
    return app
  }

  trackChild<T extends ChildProcess>(child: T, label?: string): T {
    const pid = registeredPid(child.pid)
    this.processes.push({ kind: 'child', label: label ?? childLabel(pid), child, pid, exited: observeExit(child) })
    return child
  }

  cleanup(): Promise<CleanupIssue[]> {
    if (!this.cleanupPromise) this.cleanupPromise = this.runCleanup()
    return this.cleanupPromise
  }

  private async runCleanup(): Promise<CleanupIssue[]> {
    const issues: CleanupIssue[] = []
    for (const process of [...this.processes].reverse()) {
      const issue = await this.cleanupProcess(process)
      if (issue) issues.push(issue)
    }
    for (const directory of [...this.directories].reverse()) {
      const issue = await this.cleanupDirectory(directory)
      if (issue) issues.push(issue)
    }
    return issues
  }

  private async cleanupProcess(process: TrackedProcess): Promise<CleanupIssue | undefined> {
    if (process.exited.done) return undefined
    let closeError: unknown
    let closeDone = !process.close
    let closeSettled = Promise.resolve()
    if (process.close) {
      try {
        closeSettled = process.close().then(
          () => { closeDone = true },
          error => { closeError = error; closeDone = true },
        )
      } catch (error) {
        closeError = error
        closeDone = true
      }
    }

    await Promise.resolve()
    const gracefulExit = process.exited.done && closeDone
      ? true
      : await Promise.race([
        Promise.all([process.exited.promise, closeSettled]).then(() => true),
        this.ops.delay(5_000).then(() => false),
      ])
    if (gracefulExit || process.exited.done) return undefined

    const pid = process.pid
    if (!isValidPid(pid)) {
      return cleanupIssue(process.kind, process.label, shutdownFailure(process, 'forced', closeError ?? new Error('Invalid process identifier')))
    }

    let forceError: unknown
    const force = Promise.resolve().then(() => this.ops.forceTerminate(process.child, pid))
    void force.catch(error => { forceError = error })
    if (await this.waitForExit(process.exited)) return undefined

    return cleanupIssue(process.kind, process.label, shutdownFailure(process, 'forced', forceError ?? closeError))
  }

  private async waitForExit(exited: ExitObservation): Promise<boolean> {
    if (exited.done) return true
    return Promise.race([
      exited.promise.then(() => true),
      this.ops.delay(5_000).then(() => false),
    ])
  }

  private async cleanupDirectory(path: string): Promise<CleanupIssue | undefined> {
    let lastError: unknown
    for (let attempt = 0; attempt <= 5; attempt++) {
      try {
        this.ops.removeDir(path)
        return undefined
      } catch (error) {
        lastError = error
        if (!isTransientDirectoryError(error) || attempt === 5) break
        await this.ops.delay(100)
      }
    }
    return cleanupIssue('directory', basename(path), directoryFailure(path, lastError))
  }
}

export function classifyCleanup(issues: CleanupIssue[], bodyError: unknown): CleanupDisposition {
  if (issues.length === 0) return {}
  const diagnostic = formatCleanupIssues(issues)
  if (bodyError !== undefined) return { diagnostic }
  return { diagnostic, throwError: new AggregateError(issues.map(issue => issue.error), diagnostic) }
}

export function formatCleanupIssues(issues: CleanupIssue[]): string {
  return [
    'Smoke cleanup issues:',
    ...issues.map(issue => `- ${issue.kind} ${issue.label}: ${issue.error.message}`),
  ].join('\n')
}

function observeExit(child: ChildProcess): ExitObservation {
  let done = child.exitCode !== null
  let resolveExit!: () => void
  const promise = new Promise<void>(resolvePromise => { resolveExit = resolvePromise })
  if (done) resolveExit()
  else child.once('exit', () => { done = true; resolveExit() })
  return { get done() { return done }, promise }
}

function applicationLabel(pid: number | undefined): string {
  return isValidPid(pid) ? `application-${pid}` : 'application'
}

function childLabel(pid: number | undefined): string {
  return isValidPid(pid) ? `child-${pid}` : 'child'
}

function cleanupIssue(kind: CleanupKind, label: string, error: unknown): CleanupIssue {
  return { kind, label, error: error instanceof Error ? error : new Error('Cleanup operation failed') }
}

async function defaultForceTerminate(child: ChildProcess, pid: number): Promise<void> {
  if (!isValidPid(pid)) throw new Error('Invalid process identifier')
  if (process.platform === 'win32') {
    await execFileAsync('taskkill.exe', ['/PID', String(pid), '/T', '/F'])
    return
  }
  if (!child.kill('SIGKILL') && child.exitCode === null) throw new Error('Could not terminate process')
}

function isValidPid(pid: number | undefined): pid is number {
  return Number.isSafeInteger(pid) && pid > 0
}

function registeredPid(pid: number | undefined): number | undefined {
  return isValidPid(pid) ? pid : undefined
}

function shutdownFailure(process: TrackedProcess, phase: 'graceful' | 'forced', cause: unknown): Error {
  const pid = process.pid === undefined ? '' : ` (PID ${process.pid})`
  return new Error(
    `Smoke cleanup could not confirm ${process.label}${pid} exited during ${phase} shutdown within 5000 ms`,
    { cause },
  )
}

function isSafeTempDirectory(path: string): boolean {
  const temp = resolve(tmpdir())
  const resolvedPath = resolve(path)
  const child = relative(temp, resolvedPath)
  const parentPrefix = `..${process.platform === 'win32' ? '\\' : '/'}`
  return child !== '' &&
    !isAbsolute(child) &&
    child !== '..' &&
    !child.startsWith(parentPrefix) &&
    basename(resolvedPath).startsWith('notes-')
}

function isTransientDirectoryError(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException).code
  return code === 'EBUSY' || code === 'EPERM' || code === 'ENOTEMPTY'
}

function directoryFailure(path: string, cause: unknown): Error {
  return new Error(`Smoke cleanup could not remove directory ${basename(path)} after bounded retries`, { cause })
}
