# Smoke Teardown Reliability Design

**Status:** Approved in conversation on 2026-08-08. This document records the approved design before implementation planning.

## Context

The dependency-security branch exposed a pre-existing smoke-harness failure under the repository's normal Playwright configuration. All 119 application tests completed successfully or recovered on their configured retries (115 passed and 4 flaky), but `npm run test:smoke` still exited 1 because four workers exceeded Playwright's 30-second teardown timeout outside any test. No worktree Electron process remained after the runner finished.

Cleanup is currently duplicated across the suite. Twenty smoke files contain 135 direct `rmSync` calls, normally immediately after `await app.close()` in a test-body `finally`. These paths have four structural weaknesses:

- most deletion calls have no bounded Windows retry;
- most app shutdown paths do not register and await the actual process exit;
- an exception thrown from `finally` can replace the assertion that caused teardown; and
- early failures in special cases can lose the only reference to an Electron app or manually spawned child.

This is a test-harness reliability issue, not an ordinary application runtime defect. The fix is intentionally separate from draft dependency-security PR #11 and starts from `master`.

## Goals

- Make the normal six-worker `npm run test:smoke` command exit 0 without worker teardown errors.
- Give every smoke-test Electron app, manually spawned child, and temporary directory one explicit lifecycle owner from creation onward.
- Await real process exit before deleting the paths that process used.
- Bound graceful shutdown, forced shutdown, and Windows directory-removal retries so teardown itself cannot hang indefinitely.
- Preserve a test-body assertion as the primary failure if cleanup also fails.
- Fail an otherwise passing test when its cleanup cannot complete.
- Remove all direct, duplicated smoke-test `app.close()` plus `rmSync()` teardown sequences.
- Leave application code and Playwright concurrency/retry/timeout configuration unchanged.

## Non-goals

- Changing production application shutdown, tray, or quit behavior.
- Reducing Playwright worker concurrency, increasing test or teardown timeouts, or disabling retries.
- Rewriting smoke assertions, weakening test coverage, or treating flaky retries as automatic success.
- Fixing the remaining dependency audit findings.
- Folding this change into dependency-security PR #11.
- Version bumping, packaging, tagging, releasing, or merging without a separate decision.

## Approaches considered

### Chosen: explicit automatic Playwright fixture plus a pure cleanup core

All smoke specs import `test` and `expect` from one local fixture adapter. Each test receives a `smoke` resource owner and creates resources through `smoke.tempDir()` and `smoke.launch()`. Specialized tests register a manually spawned process through `smoke.trackChild()` immediately after `spawn()`.

The fixture always runs cleanup after the test body. A separate cleanup core owns resource state, timeout behavior, retry behavior, and error aggregation so those rules can be unit-tested without launching Electron. This makes cleanup automatic while keeping every resource registration explicit in the spec that creates it.

### Rejected: shared helper called from existing `finally` blocks

A helper would reduce repeated options, but it would retain the unsafe ownership model. An app created before a later statement fails can still fall out of scope, every test author must remember the helper, and a cleanup exception thrown from `finally` can still replace the primary assertion.

### Rejected: lower worker count or larger timeout

Serial execution can avoid some timing pressure and a larger teardown budget can hide slow exits, but neither establishes resource ownership or error precedence. The normal configuration is the gate that currently fails, so the fix must make that configuration reliable.

## Architecture

### `tests/smoke/smokeCleanup.ts`: lifecycle core

`SmokeResources` is a test-only resource tracker with these responsibilities:

- `tempDir(prefix)` creates a unique directory below `tmpdir()`, validates that the prefix begins with `notes-`, and records the resolved path.
- `launch(options)` launches Electron through Playwright, records the returned application immediately, and registers its process-exit promise before returning it to the test.
- `trackChild(child)` records a manually spawned child and its exit promise immediately.
- `cleanup()` closes resources in reverse creation order, waits for process termination, then removes tracked directories in reverse creation order.

The core accepts narrow injected process, timing, and filesystem operations for unit tests. It does not know about Playwright's test result object and does not decide which error is primary. Calling `cleanup()` more than once is safe; resources already exited or removed are skipped.

### `tests/smoke/smokeTest.ts`: Playwright adapter

The adapter extends Playwright's base `test` with a per-test `smoke: SmokeResources` fixture and re-exports `expect`. The fixture creates one tracker, passes it to the test body, then always invokes cleanup.

Cleanup returns zero or more structured issues. The fixture handles them using Playwright's result state:

- if the test body has no error, cleanup issues are thrown as one `AggregateError`, so an otherwise green test fails;
- if the test body already failed, the original test error remains primary and cleanup issues are attached as a named text artifact plus a concise terminal diagnostic;
- no cleanup issue is silently discarded.

The adapter contains no application assertions and no resource-specific special cases.

### Smoke-spec migration

All 20 smoke files will use the local fixture and create every temporary profile/project directory through `smoke.tempDir()`. Every `electron.launch()` call will route through `smoke.launch()`. Direct cleanup-only `try/finally` blocks, `app.close()` calls, and `rmSync()` calls will be removed.

Tests that intentionally close or quit an app during their body retain that behavior. The tracker observes the already-recorded exit and treats later cleanup as an idempotent no-op. This covers clean quit, dirty quit, relaunching the same profile, and assertions about process exit without forking production behavior.

The second-instance test will register its manually spawned child immediately. Its normal exit assertion remains unchanged; fixture cleanup owns the exceptional path and cannot finish until the child has exited or bounded forced termination completes.

## Shutdown and deletion rules

Each Electron application and child records an exit listener as soon as it is registered, so a fast exit cannot be missed later.

For an application that is still running:

1. call `app.close()` and await the earlier of its resolution and the recorded process exit;
2. allow at most 5 seconds for graceful exit;
3. if still live, terminate only the recorded process tree;
4. on Windows, invoke `taskkill.exe /PID <verified-positive-pid> /T /F`; on other platforms use the child process's force signal;
5. allow at most 5 more seconds for the recorded exit;
6. record a cleanup issue if termination still cannot be confirmed.

Manual children follow the same recorded-exit and bounded-force rules, without calling `app.close()`.

Only directories returned by `smoke.tempDir()` may be deleted. Before deletion the cleanup core re-resolves the path, verifies that it is a strict child of the OS temporary directory, and verifies the recorded `notes-` basename prefix. Removal uses recursive force plus five bounded retries with a 100 ms retry delay for transient Windows `EBUSY`, `EPERM`, and `ENOTEMPTY` conditions. Invalid targets are never deleted and become cleanup issues.

Process cleanup completes before directory cleanup begins. One cleanup failure does not skip later resources; all issues are aggregated.

## Error and timeout behavior

- Every timeout has a descriptive issue naming the resource, PID when available, phase, and elapsed bound.
- A protocol error indicating an already-closed Electron application is accepted only when the recorded process has exited.
- A rejected `app.close()` does not abort cleanup of the remaining resources.
- Forced termination is PID-specific and only applies to processes registered by the current test.
- The fixture never kills an unverified process name globally and never scans unrelated Electron instances for termination.
- Cleanup diagnostics must not contain document contents, clipboard contents, or user paths outside the generated temporary resource names.

## Testing strategy

### Focused unit coverage

Add `tests/unit/smokeCleanup.test.ts` using injected fake applications, children, timers, and filesystem operations:

- resources are cleaned in reverse creation order and directories only after every process phase completes;
- an already-exited app or child is not closed or killed again;
- graceful application exit completes without forced termination;
- a hung `app.close()` reaches the bounded PID-specific force path and then joins exit;
- a child that fails to exit after force becomes a cleanup issue without skipping later resources;
- transient `EBUSY`, `EPERM`, and `ENOTEMPTY` removals retry and eventually succeed;
- an exhausted removal retry becomes a cleanup issue;
- a path outside `tmpdir()` or without the recorded `notes-` prefix is rejected without invoking removal;
- cleanup is idempotent;
- fixture error classification throws cleanup failure for a passing body but preserves and annotates an existing body failure.

### Falsification

- Add the focused tests before the cleanup core exists and verify they fail for the missing behavior.
- Remove the retry branch: the transient-lock tests must fail.
- Skip the recorded exit join: the hung-close test must fail.
- Throw cleanup errors unconditionally from the fixture classifier: the primary-error preservation test must fail.
- Remove manual-child registration from the second-instance migration: a focused source/behavior guard must fail.

### Full verification

Run:

1. focused cleanup unit tests;
2. complete unit suite;
3. `npm run build`;
4. the normal configured `npm run test:smoke` command twice consecutively, with `ELECTRON_RUN_AS_NODE` cleared each time;
5. after each run, verify no Electron process launched from this worktree remains;
6. `git diff --check` and independent per-task plus whole-branch review.

Both configured smoke runs must exit 0. A run with all application assertions passing but a worker teardown error is still a failure. Existing configured retries remain visible and must be reported accurately.

## Expected file impact

- `tests/smoke/smokeCleanup.ts`: pure lifecycle ownership and bounded cleanup core.
- `tests/smoke/smokeTest.ts`: automatic Playwright fixture and error-precedence adapter.
- `tests/unit/smokeCleanup.test.ts`: focused lifecycle, retry, safety, and error-precedence regressions.
- All 20 `tests/smoke/*.spec.ts` files that currently own Electron or temporary resources: migrate resource creation and remove direct cleanup duplication.

`playwright.config.ts`, application source, package manifests, and production configuration should not change.

## Delivery boundary

This work ships as a separate branch and PR based on `master`. It is ready for review only after both normal concurrent smoke runs exit 0. Dependency-security PR #11 remains draft until this cleanup fix lands or its merge gate is explicitly waived; after this cleanup branch is integrated, PR #11 must be updated and reverified against the new base before becoming merge-ready.
