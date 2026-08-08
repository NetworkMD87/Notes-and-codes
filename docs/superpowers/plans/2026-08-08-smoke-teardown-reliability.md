# Smoke Teardown Reliability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the ordinary six-worker Playwright Electron smoke run exit cleanly by giving every launched process and temporary directory an explicit, bounded, failure-safe lifecycle owner.

**Architecture:** A framework-independent `SmokeResources` core records Electron applications, manual child processes, and `notes-*` temporary directories as soon as they are created. A small Playwright fixture owns one registry per test, runs cleanup after the test body, preserves a primary test failure, and reports cleanup failures without skipping later resources.

**Tech Stack:** TypeScript, Node.js child-process/filesystem APIs, Playwright Test Electron support, Vitest, Windows `taskkill.exe` for verified PID-tree termination.

## Global Constraints

- Work only on `codex/smoke-teardown-reliability`; do not modify or fold this work into dependency PR #11.
- Do not change production shutdown behavior, `playwright.config.ts`, package manifests, worker count, test timeouts, retries, or smoke assertions.
- Keep the existing normal Playwright configuration: six workers observed locally, `fullyParallel: false`, and `retries: 2`.
- Every Electron application, manually spawned child, and temporary directory must be registered immediately with one per-test lifecycle owner.
- Process cleanup must finish before directory cleanup; resources within each category are cleaned in reverse registration order.
- Graceful process exit gets 5,000 ms; forced exit gets a further 5,000 ms.
- Windows forced shutdown may invoke `taskkill.exe /PID <verified-positive-pid> /T /F` only for a PID captured from a registered resource.
- Directory removal permits an initial attempt plus five bounded retries, delaying 100 ms only for `EBUSY`, `EPERM`, or `ENOTEMPTY`.
- Only directories returned by `smoke.tempDir(prefix)` may be removed; `prefix` must start with `notes-`, and the resolved directory must remain a strict child of `tmpdir()`.
- Cleanup must be idempotent and must aggregate failures so one failed resource never skips later resources.
- If the test body passed, any cleanup issue fails the test with an `AggregateError`. If the body failed, preserve it as primary, attach cleanup details, and print a concise diagnostic.
- A guard is accepted only after its intended branch has been deliberately falsified and observed red, then restored green.
- Delivery requires focused tests, the complete unit suite, `npm run build`, and two consecutive ordinary configured smoke runs that each exit 0.

---

## File Structure

- Create `tests/smoke/smokeCleanup.ts`: lifecycle registry, exit observation, bounded graceful/forced shutdown, safe directory removal, issue aggregation, and error-precedence classification. Runtime dependencies are narrow and injectable for deterministic unit tests.
- Create `tests/smoke/smokeTest.ts`: Playwright fixture that creates one `SmokeResources` instance per test, runs cleanup, attaches diagnostics, and re-exports `test`/`expect`.
- Create `tests/unit/smokeCleanup.test.ts`: fake processes/applications/filesystem/timing tests for every lifecycle branch and error-precedence rule.
- Modify all 20 `tests/smoke/*.spec.ts` files: import the local fixture, accept `{ smoke }`, replace direct launch/temp creation with the registry, and remove cleanup-only `try/finally` blocks.
- Preserve `tests/smoke/settingsHelper.ts`: it is assertion-only and owns no resources.
- Preserve `playwright.config.ts`, `package.json`, `package-lock.json`, and all `src/**` files.

---

### Task 1: Build and Falsify the Lifecycle Core

**Files:**
- Create: `tests/smoke/smokeCleanup.ts`
- Create: `tests/unit/smokeCleanup.test.ts`

**Interfaces:**
- Produces: `SmokeResources.tempDir(prefix: string): string`
- Produces: `SmokeResources.launch(options: ElectronLaunchOptions): Promise<ElectronApplication>`
- Produces: `SmokeResources.trackChild<T extends ChildProcess>(child: T, label?: string): T`
- Produces: `SmokeResources.cleanup(): Promise<CleanupIssue[]>`
- Produces: `classifyCleanup(issues: CleanupIssue[], bodyError: unknown): CleanupDisposition`
- Produces: `formatCleanupIssues(issues: CleanupIssue[]): string`

- [ ] **Step 1: Write the public contract and deterministic fakes**

Create these exported shapes in `tests/smoke/smokeCleanup.ts` before implementing behavior:

```ts
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

export class SmokeResources {
  constructor(ops: Partial<SmokeCleanupOps> = {})
  tempDir(prefix: string): string
  launch(options: ElectronLaunchOptions): Promise<ElectronApplication>
  trackChild<T extends ChildProcess>(child: T, label?: string): T
  cleanup(): Promise<CleanupIssue[]>
}
```

In `tests/unit/smokeCleanup.test.ts`, define a `FakeChild` with `pid`, `exitCode`, `once('exit')`, `kill()`, and an explicit `exit(code)` method; a `FakeApplication` whose `close()` behavior is configurable; a deferred-delay queue; and operation logs such as `['close:app-b', 'force:app-b', 'remove:notes-b']`.

- [ ] **Step 2: Write failing ownership, ordering, and idempotence tests**

Add Vitest cases that assert:

```ts
it('cleans processes before directories in reverse registration order', async () => {
  const { smoke, log, appA, appB, child, directories } = harness()
  smoke.trackChild(child, 'second-instance')
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
```

Also cover an already-exited application and child: neither graceful close nor force termination may run for that resource.

- [ ] **Step 3: Run the focused test and confirm the ownership tests fail**

Run:

```powershell
& 'C:\Program Files\nodejs\node.exe' 'C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js' test -- smokeCleanup
```

Expected: FAIL because the registry and ordering behavior are not implemented.

- [ ] **Step 4: Implement immediate exit observation and reverse-order cleanup**

Use a single process stack containing `{ kind, label, child, close?, exited }`. Construct `exited.promise` and install the child's one-time `exit` listener inside `launch()`/`trackChild()` before returning the resource. If `exitCode !== null` at registration, resolve it immediately.

Implement `cleanup()` with an internal cached promise:

```ts
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
```

- [ ] **Step 5: Run focused tests and confirm the base lifecycle passes**

Run the Task 1 focused command. Expected: the ownership, ordering, already-exited, and idempotence cases PASS.

- [ ] **Step 6: Write failing graceful/forced shutdown and aggregation tests**

Add cases for:

- application exits during `close()` and is never forced;
- `close()` resolves without an exit, the 5,000 ms grace expires, force termination runs, and cleanup waits for the subsequent real exit;
- manual child receives no app-close call, is forced after grace, and cleanup waits for its exit;
- a forced child never emits exit within the second 5,000 ms window, producing one issue;
- the first process fails but the next process and every directory are still attempted;
- PID `undefined`, `0`, `-1`, or non-integer never reaches `taskkill.exe` and produces a cleanup issue.

The forced/join test must hold the exit promise after force termination and assert `cleanup()` is still pending until `child.exit(1)` is called.

- [ ] **Step 7: Run the focused test and confirm the timeout/force tests fail**

Run the Task 1 focused command. Expected: FAIL in the new force/join and aggregation cases.

- [ ] **Step 8: Implement bounded graceful and forced shutdown**

Implement an injected-delay timeout race returning `true` only when the registered exit promise wins. For applications: start `close()` and observe either its rejection or process exit, allow up to 5,000 ms for confirmed exit, force only if still live, then allow another 5,000 ms for confirmed exit. For manual children: skip `close()` and use the same grace/force/join sequence.

The default Windows force implementation must validate `Number.isSafeInteger(pid) && pid > 0`, define `const execFileAsync = promisify(execFile)`, and await `execFileAsync('taskkill.exe', ['/PID', String(pid), '/T', '/F'])`. The non-Windows branch calls `child.kill('SIGKILL')` and rejects if it returns `false` while the process remains live. A close/force rejection that races with a confirmed exit is treated as recovered; a close protocol error is accepted as “already closed” only after the registered process exit is confirmed. Attach a rejection handler to `app.close()` immediately so a late rejection cannot become unhandled.

When exit still cannot be confirmed, wrap the underlying failure as `cause` in a new safe error whose visible message names only the registered label, verified PID when present, phase (`graceful` or `forced`), and 5,000 ms bound. Do not interpolate launch arguments, document contents, or an underlying error message into the visible cleanup diagnostic.

- [ ] **Step 9: Write failing directory safety and retry tests**

Add cases asserting:

- `tempDir('scratch-')` throws before `makeTempDir` is called;
- a fake `makeTempDir` result equal to `tmpdir()`, outside `tmpdir()`, or whose basename does not start with `notes-` is rejected and never recorded;
- `EBUSY`, `EPERM`, and `ENOTEMPTY` each retry after 100 ms and eventually succeed;
- a non-transient `EACCES` error is reported immediately;
- six consecutive transient failures produce one directory issue after the initial attempt plus five retries;
- invalid directory state cannot delete anything and does not prevent cleanup of later valid directories.

- [ ] **Step 10: Run the focused test and confirm the safety/retry tests fail**

Run the Task 1 focused command. Expected: FAIL in the new validation and retry cases.

- [ ] **Step 11: Implement strict directory validation and retry removal**

Before creation require `prefix.startsWith('notes-')`. Resolve each returned path, calculate `relative(resolve(tmpdir()), resolvedPath)`, and accept only a non-empty relative path that is not absolute, does not equal `..`, does not start with `..` plus the platform separator, and whose basename starts with `notes-`.

On cleanup call `removeDir(path)` once and retry at most five times only when `(error as NodeJS.ErrnoException).code` is `EBUSY`, `EPERM`, or `ENOTEMPTY`, awaiting `delay(100)` before each retry. Record the last error as a `CleanupIssue` after exhaustion.

- [ ] **Step 12: Write failing error-precedence tests**

Add cases for `classifyCleanup`:

```ts
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
```

- [ ] **Step 13: Implement cleanup formatting and precedence classification**

`formatCleanupIssues()` must produce a stable heading plus one line per issue (`kind`, safe label, safe wrapper-error message). Application labels are generated from the verified PID, directory labels use `basename(path)`, and the manual-child label is the caller-supplied constant such as `second-instance`; never print launch arguments or a raw `cause` message. `classifyCleanup()` returns `{}` for no issues, `{ diagnostic, throwError: new AggregateError(issues.map(i => i.error), diagnostic) }` when `bodyError === undefined`, and `{ diagnostic }` when a body error already exists.

- [ ] **Step 14: Falsify and restore the three load-bearing guards**

Perform these local mutations one at a time without committing them:

1. Change the transient-code set so `EBUSY` is not retried. Run the focused test and observe the retry case FAIL; restore.
2. Return immediately after force termination without awaiting the exit promise. Run the focused test and observe the pending-until-exit case FAIL; restore.
3. Make `classifyCleanup()` always return `throwError`. Run the focused test and observe the primary-preservation case FAIL; restore.

Run the focused test once more. Expected: PASS after all three restorations.

- [ ] **Step 15: Type-check and commit the lifecycle core**

Run:

```powershell
& 'C:\Program Files\nodejs\node.exe' 'C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js' run typecheck
git diff --check
git add tests/smoke/smokeCleanup.ts tests/unit/smokeCleanup.test.ts
git commit -m "test: add bounded smoke resource cleanup"
```

Expected: focused tests and type-check PASS; diff check prints nothing.

---

### Task 2: Add the Per-Test Playwright Fixture

**Files:**
- Create: `tests/smoke/smokeTest.ts`
- Modify: `tests/unit/smokeCleanup.test.ts`

**Interfaces:**
- Consumes: `SmokeResources`, `classifyCleanup`, and `formatCleanupIssues` from Task 1.
- Produces: `test` extended with fixture `{ smoke: SmokeResources }`.
- Produces: re-exported Playwright `expect`.

- [ ] **Step 1: Add a failing fixture-precedence seam test**

Extract and test this fixture-finalization function from `smokeTest.ts`:

```ts
export async function reportCleanup(
  issues: CleanupIssue[],
  bodyError: unknown,
  attach: (name: string, body: string) => Promise<void>,
  writeDiagnostic: (message: string) => void,
): Promise<void>
```

Test that a clean body plus one issue attaches `smoke-cleanup.txt`, emits a diagnostic, and rejects with `AggregateError`; a failed body plus one issue attaches/emits but resolves; and no issues performs none of those actions.

- [ ] **Step 2: Run the focused test and confirm the fixture seam fails**

Run the Task 1 focused command. Expected: FAIL because `reportCleanup` does not exist.

- [ ] **Step 3: Implement the fixture and error-preserving teardown**

Create `tests/smoke/smokeTest.ts` with this shape:

```ts
import { test as base, expect } from '@playwright/test'
import {
  SmokeResources,
  classifyCleanup,
  type CleanupIssue,
} from './smokeCleanup'

export { expect }
export const test = base.extend<{ smoke: SmokeResources }>({
  smoke: async ({}, use, testInfo) => {
    const smoke = new SmokeResources()
    let bodyError: unknown
    try {
      await use(smoke)
    } catch (error) {
      bodyError = error
      throw error
    } finally {
      const issues = await smoke.cleanup()
      await reportCleanup(
        issues,
        bodyError,
        async (name, body) => testInfo.attach(name, { body, contentType: 'text/plain' }),
        message => console.error(message),
      )
    }
  },
})
```

`reportCleanup()` uses `classifyCleanup`, attaches the diagnostic as `smoke-cleanup.txt`, writes one concise diagnostic, and throws only `disposition.throwError`.

- [ ] **Step 4: Run focused tests and type-check**

Run the Task 1 focused command, then `npm run typecheck` using the explicit Node/npm command. Expected: PASS.

- [ ] **Step 5: Commit the fixture adapter**

```powershell
git diff --check
git add tests/smoke/smokeTest.ts tests/unit/smokeCleanup.test.ts
git commit -m "test: own smoke resources per test"
```

---

### Task 3: Migrate the Straight-Line Smoke Specs

**Files:**
- Modify: `tests/smoke/change-conflicts.spec.ts`
- Modify: `tests/smoke/close-safety.spec.ts`
- Modify: `tests/smoke/find-in-files.spec.ts`
- Modify: `tests/smoke/focus.spec.ts`
- Modify: `tests/smoke/format-manual.spec.ts`
- Modify: `tests/smoke/help.spec.ts`
- Modify: `tests/smoke/overlay-dismiss.spec.ts`
- Modify: `tests/smoke/overwrite-warning.spec.ts`
- Modify: `tests/smoke/palette.spec.ts`
- Modify: `tests/smoke/startup-open.spec.ts`
- Modify: `tests/smoke/tabs.spec.ts`
- Modify: `tests/smoke/toast.spec.ts`

**Interfaces:**
- Consumes: `test`, `expect`, and fixture `smoke` from `./smokeTest`.
- Consumes: `smoke.tempDir()` and `smoke.launch()` from Task 1.
- Produces: the same smoke assertions with fixture-owned teardown.

- [ ] **Step 1: Migrate imports and test signatures**

In each listed file, replace:

```ts
import { test, expect, _electron as electron } from '@playwright/test'
```

with:

```ts
import { test, expect } from './smokeTest'
```

Retain type-only Playwright imports such as `Page` when used. Change every lifecycle-owning callback from `async () =>` to `async ({ smoke }) =>`.

- [ ] **Step 2: Replace temporary directory creation and Electron launch**

For every `notes-*` temporary directory, replace:

```ts
const userDataDir = mkdtempSync(join(tmpdir(), 'notes-smoke-'))
const app = await electron.launch({ args: ['out/main/index.js', `--user-data-dir=${userDataDir}`] })
```

with:

```ts
const userDataDir = smoke.tempDir('notes-smoke-')
const app = await smoke.launch({ args: ['out/main/index.js', `--user-data-dir=${userDataDir}`] })
```

Use the file's existing prefix verbatim. Register project/fixture directories through `smoke.tempDir()` as well. Remove `mkdtempSync`, `rmSync`, `tmpdir`, and `_electron` imports only when no non-cleanup use remains.

- [ ] **Step 3: Remove cleanup-only finally blocks without moving assertions**

Delete `try/finally` wrappers whose `finally` contains only `app.close()` and `rmSync(...)`, leaving their test-body assertions in the same order. If a `finally` contains a semantic action needed by the test, retain that action and remove only fixture-owned close/removal calls.

- [ ] **Step 4: Verify the migration surface is clean for this batch**

Run:

```powershell
rg -n "_electron|electron\.launch|mkdtempSync|rmSync|tmpdir" tests/smoke/change-conflicts.spec.ts tests/smoke/close-safety.spec.ts tests/smoke/find-in-files.spec.ts tests/smoke/focus.spec.ts tests/smoke/format-manual.spec.ts tests/smoke/help.spec.ts tests/smoke/overlay-dismiss.spec.ts tests/smoke/overwrite-warning.spec.ts tests/smoke/palette.spec.ts tests/smoke/startup-open.spec.ts tests/smoke/tabs.spec.ts tests/smoke/toast.spec.ts
```

Expected: no matches, except a type-only Playwright import if a file needs one (the type-only import must not include `_electron`).

- [ ] **Step 5: Build and run the migrated smoke subset**

Run:

```powershell
& 'C:\Program Files\nodejs\node.exe' 'C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js' run build
Remove-Item env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
& 'C:\Program Files\nodejs\node.exe' .\node_modules\@playwright\test\cli.js test tests/smoke/change-conflicts.spec.ts tests/smoke/close-safety.spec.ts tests/smoke/find-in-files.spec.ts tests/smoke/focus.spec.ts tests/smoke/format-manual.spec.ts tests/smoke/help.spec.ts tests/smoke/overlay-dismiss.spec.ts tests/smoke/overwrite-warning.spec.ts tests/smoke/palette.spec.ts tests/smoke/startup-open.spec.ts tests/smoke/tabs.spec.ts tests/smoke/toast.spec.ts
```

Expected: command exits 0 with no teardown diagnostics.

- [ ] **Step 6: Commit the straight-line migration**

```powershell
git diff --check
git add tests/smoke/change-conflicts.spec.ts tests/smoke/close-safety.spec.ts tests/smoke/find-in-files.spec.ts tests/smoke/focus.spec.ts tests/smoke/format-manual.spec.ts tests/smoke/help.spec.ts tests/smoke/overlay-dismiss.spec.ts tests/smoke/overwrite-warning.spec.ts tests/smoke/palette.spec.ts tests/smoke/startup-open.spec.ts tests/smoke/tabs.spec.ts tests/smoke/toast.spec.ts
git commit -m "test: migrate smoke specs to resource fixture"
```

---

### Task 4: Migrate Relaunch and Shared-Directory Specs

**Files:**
- Modify: `tests/smoke/app.spec.ts`
- Modify: `tests/smoke/highlighter.spec.ts`
- Modify: `tests/smoke/settings.spec.ts`
- Modify: `tests/smoke/sidebar.spec.ts`
- Modify: `tests/smoke/spell-check.spec.ts`

**Interfaces:**
- Consumes: the Task 1 registry and Task 2 fixture.
- Produces: relaunch tests whose earlier applications are observed after intentional close/quit and whose shared directories remain registered until final fixture teardown.

- [ ] **Step 1: Migrate all helper launch functions to accept the registry**

Where a file has a helper, change it from direct Electron launch to an explicit registry parameter:

```ts
async function launch(smoke: SmokeResources, userDataDir: string, filePath?: string) {
  const args = ['out/main/index.js', `--user-data-dir=${userDataDir}`]
  if (filePath) args.push(filePath)
  const app = await smoke.launch({ args })
  return { app, win: await app.firstWindow() }
}
```

Import `type SmokeResources` from `./smokeCleanup`. Apply this to every specialized spell-check launcher while preserving its exact environment and arguments.

- [ ] **Step 2: Migrate temporary directories, launches, and ordinary teardown**

Apply the Task 3 transformation to every test in the five files. Keep all file-writing/setup operations after `smoke.tempDir()` and before launch. Remove direct cleanup-only `try/finally` blocks.

- [ ] **Step 3: Preserve intentional close/relaunch semantics**

Keep deliberate mid-test actions such as:

```ts
await app1.close()
const app2 = await smoke.launch({ args: ['out/main/index.js', `--user-data-dir=${userDataDir}`] })
```

The first application's exit observer remains registered and final cleanup treats it as already exited. Do not move the second launch earlier or delete persistence assertions between launches.

For `quitDirtyApp`, keep the pre-registered exit promise and `window.api.quitNow()` behavior; only ensure the app came from `smoke.launch()`. This explicitly tests app-driven dirty quit while final cleanup remains a no-op for that exited app.

- [ ] **Step 4: Verify no direct lifecycle ownership remains in this batch**

Run:

```powershell
rg -n "_electron|electron\.launch|mkdtempSync|rmSync|tmpdir" tests/smoke/app.spec.ts tests/smoke/highlighter.spec.ts tests/smoke/settings.spec.ts tests/smoke/sidebar.spec.ts tests/smoke/spell-check.spec.ts
```

Expected: no direct lifecycle matches. Type-only imports from `@playwright/test` may remain for `Page`/`ElectronApplication`.

- [ ] **Step 5: Build and run the relaunch/shared-directory subset**

Run `npm run build` with the explicit npm command, clear `ELECTRON_RUN_AS_NODE`, and run these five files through Playwright's CLI. Expected: exit 0 with no cleanup diagnostic.

- [ ] **Step 6: Commit the relaunch/shared-directory migration**

```powershell
git diff --check
git add tests/smoke/app.spec.ts tests/smoke/highlighter.spec.ts tests/smoke/settings.spec.ts tests/smoke/sidebar.spec.ts tests/smoke/spell-check.spec.ts
git commit -m "test: track smoke relaunch lifecycles"
```

---

### Task 5: Migrate Multi-Process and App-Driven Exit Specs

**Files:**
- Modify: `tests/smoke/clean-quit.spec.ts`
- Modify: `tests/smoke/hotkey-conflict.spec.ts`
- Modify: `tests/smoke/startup-window.spec.ts`
- Modify: `tests/unit/smokeCleanup.test.ts`

**Interfaces:**
- Consumes: `smoke.trackChild()` for the manually spawned second Electron process.
- Produces: explicit lifecycle coverage for two-app conflicts, clean quit/relaunch, and real single-instance handoff.

- [ ] **Step 1: Migrate clean quit without weakening the flush assertion**

Use `smoke.tempDir()` and `smoke.launch()` for both applications. Keep `cleanQuitViaMenu`, create `const closed = app1.waitForEvent('close')` before clicking Exit, await `closed`, then launch app2 against the same registered directory and assert two restored tabs. Remove the nested cleanup-only `finally` blocks.

- [ ] **Step 2: Migrate the two-application hotkey conflict**

Register both directories and both applications through the fixture. Preserve `liveEnv`, the registration delay, stderr capture, responsiveness assertions, and conditional toast assertion. Remove direct `appB`/`appA` close calls and directory removals from `finally`; fixture reverse order closes B before A.

- [ ] **Step 3: Register the real second-instance child immediately**

In `startup-window.spec.ts`, replace direct app/directory ownership and wrap the spawn expression at creation:

```ts
const second = smoke.trackChild(
  spawn(
    electronPath as unknown as string,
    ['out/main/index.js', `--user-data-dir=${userDataDir}`, notePath],
    { env: process.env, stdio: ['ignore', 'pipe', 'pipe'] },
  ),
  'second-instance',
)
```

Keep stdout/stderr capture and the existing explicit 30-second exit assertion. Delete the fire-and-forget `second.kill()` and `rmSync(...maxRetries...)` fallback: the tracker now observes a normal exit or performs bounded force-and-join teardown.

- [ ] **Step 4: Add and falsify the manual-child ownership guard**

Add a focused source guard to `tests/unit/smokeCleanup.test.ts` that reads `tests/smoke/startup-window.spec.ts`, proves there is exactly one manual `spawn(` call, and proves it is immediately wrapped by the lifecycle owner:

```ts
it('registers the real second-instance process at creation', () => {
  const source = readFileSync(
    join(process.cwd(), 'tests/smoke/startup-window.spec.ts'),
    'utf8',
  )
  expect(source.match(/\bspawn\(/g)).toHaveLength(1)
  expect(source).toMatch(/smoke\.trackChild\(\s*spawn\(/)
})
```

Temporarily remove only the `smoke.trackChild(...)` wrapper while leaving `spawn(...)`; run the focused unit command and observe this guard FAIL. Restore the wrapper and observe PASS. Then temporarily make the registered child hang after spawn and run the special spec to confirm the fixture forces and joins it instead of ending in a worker teardown timeout; restore the real exit path before continuing.

- [ ] **Step 5: Verify all smoke specs use the lifecycle owner**

Run:

```powershell
rg -n "_electron|electron\.launch|mkdtempSync|rmSync|tmpdir" tests/smoke -g "*.spec.ts"
rg -n "\bspawn\(" tests/smoke -g "*.spec.ts"
```

Expected: the first command has no matches. The second command has exactly the startup-window spawn, directly nested inside `smoke.trackChild(...)`.

- [ ] **Step 6: Build and run the three special specs**

Run `npm run build`, clear `ELECTRON_RUN_AS_NODE`, and run `clean-quit.spec.ts`, `hotkey-conflict.spec.ts`, and `startup-window.spec.ts`. Expected: exit 0 with no cleanup diagnostic or worker teardown timeout.

- [ ] **Step 7: Commit the special lifecycle migration**

```powershell
git diff --check
git add tests/smoke/clean-quit.spec.ts tests/smoke/hotkey-conflict.spec.ts tests/smoke/startup-window.spec.ts tests/unit/smokeCleanup.test.ts
git commit -m "test: join smoke subprocess teardown"
```

---

### Task 6: Full Verification, Review, and Draft PR

**Files:**
- Verify: all files changed in Tasks 1-5
- Preserve: `playwright.config.ts`, `package.json`, `package-lock.json`, `src/**`

**Interfaces:**
- Consumes: the completed cleanup fixture and all migrated smoke specs.
- Produces: a reviewed branch and separate PR whose two normal smoke runs both exit 0.

- [ ] **Step 1: Run focused and complete unit tests**

```powershell
& 'C:\Program Files\nodejs\node.exe' 'C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js' test -- smokeCleanup
& 'C:\Program Files\nodejs\node.exe' 'C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js' test
```

Expected: both commands exit 0.

- [ ] **Step 2: Run the primary build gate**

```powershell
& 'C:\Program Files\nodejs\node.exe' 'C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js' run build
```

Expected: TypeScript and electron-vite build exit 0.

- [ ] **Step 3: Run the ordinary configured smoke suite twice consecutively**

For each run, use the package script without worker/retry/timeout overrides:

```powershell
Remove-Item env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
& 'C:\Program Files\nodejs\node.exe' 'C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js' run test:smoke
```

Expected for run 1 and run 2 independently: exit 0, zero failed tests, and no worker teardown timeout. A retry-recovered Monaco jitter may be reported as flaky, but a teardown error, non-zero exit, or orphaned Electron process fails the gate.

- [ ] **Step 4: Verify no repository-launched Electron remains after each smoke run**

After each run, inspect live Electron processes and their command lines. Expected: no process whose command line references this worktree's `out/main/index.js` or a `notes-*` test profile remains. Do not terminate unrelated user Electron applications.

- [ ] **Step 5: Audit the final diff and unchanged boundaries**

```powershell
git diff --check
git diff --name-only master...HEAD
git diff -- playwright.config.ts package.json package-lock.json src
rg -n "_electron|electron\.launch|mkdtempSync|rmSync|tmpdir" tests/smoke -g "*.spec.ts"
```

Expected: diff check is empty; changed paths are the two helpers, one unit test, 20 smoke specs, and plan/spec docs only; protected config/manifests/app-source diff is empty; no direct lifecycle matches remain in specs.

- [ ] **Step 6: Request two-stage review and resolve every finding**

Run a specification-compliance review against `docs/superpowers/specs/2026-08-08-smoke-teardown-reliability-design.md`, then a code-quality review focused on Windows process exit races, path safety, error precedence, and test assertion preservation. For each finding, reproduce or inspect it, patch it with a focused regression when applicable, rerun the affected focused gate, and repeat review until both reviewers approve.

- [ ] **Step 7: Re-run affected gates after review changes**

If review changes lifecycle code or any smoke spec, rerun focused units, all units, build, and both consecutive full smoke runs. The last two full runs—not earlier superseded runs—must each exit 0.

- [ ] **Step 8: Publish a separate draft PR**

Push `codex/smoke-teardown-reliability` and open a draft PR describing the same-test Windows handle race, the centralized lifecycle owner, explicit child exit joining, primary-error preservation, and exact verification results for both smoke runs. Do not merge, release, or modify dependency PR #11 in this task.

- [ ] **Step 9: Record the dependency PR follow-up**

After this cleanup PR is ready, state that dependency PR #11 still needs its branch updated with the cleanup fix (after the cleanup PR lands) and its full gates rerun before it can leave draft. Do not claim the earlier non-zero smoke command was retroactively green.
