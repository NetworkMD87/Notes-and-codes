# CI renderer smoke trial — 2026-10-09

## Scope

Test whether software rendering resolves missing Monaco paints on GitHub-hosted Windows runners. Keep the manual-only smoke job until hosted reliability is established and automatic-gate promotion is approved. Production app launches remain unchanged. Test-only startup guards and a confirmed-save assertion were added; startup and highlighter-colour scopes disable retries, while focused/full scopes retain existing timeouts and retries.

Manual workflow inputs select `native`, `disable-gpu` (default), or `swiftshader`, and `startup`, `highlighter-colour`, `focused` (default) or `full` scope. The corrected shared smoke launcher appends switches after the existing arguments, preserving the entry script position, file arguments, isolated user data and other launch options. SwiftShader uses Chromium's documented ANGLE switches: `--use-gl=angle --use-angle=swiftshader` ([Chromium documentation](https://chromium.googlesource.com/chromium/src/+/main/docs/gpu/swiftshader.md)). No unsafe SwiftShader or sandbox-disable switches are added.

## Local evidence

- `npm run build`: passed, including TypeScript checking.
- `npm test -- smokeCleanup`: final normal-environment run passed 41 tests, including environment-to-launcher integration. Initial sandbox collection failed with an EPERM temporary-cache rename before any tests ran.
- `NC_SMOKE_RENDERING=disable-gpu npx playwright test tests/smoke/format-manual.spec.ts tests/smoke/highlighter.spec.ts --reporter=line`: 11 passed in 15.7 seconds, no retries reported. ELECTRON_RUN_AS_NODE was cleared for this run.
- Local coverage includes rendered formatting, focused split-pane formatting, highlight decorations/persistence and pen-cursor/CSP assertions. This does not establish hosted reliability or installed-app acceptance.

## Hosted experiment

1. Dispatch focused native and GPU-disabled runs on the same trial commit. Try SwiftShader if GPU-disabled rendering does not resolve the failures.
2. For a successful candidate, run the full suite three times on the same commit. Compare first-attempt passes, retry counts, failures, duration and cleanup issues using uploaded `results.json` and retained failure traces.
3. Investigate any repeated failure or reliance on retries before proposing an automatic push/PR gate. Three green runs support a trial conclusion, not a guarantee. Preserve negative results and retain manual-only status if reliability is insufficient.

The owner approved branch creation, staging, commit, push and trial dispatch. Published commit: `98d5985212a8b4b1064f3380870c4a85d72dad54`, branch `codex/ci-smoke-rendering-trial`.

| Run | Rendering / scope | Result |
| --- | --- | --- |
| [37994853249](https://github.com/NetworkMD87/Notes-and-codes/actions/runs/37994853249) | Native / focused | 11 passed, 0 skipped, 0 unexpected, 0 flaky; 15.78s. Build and unit job passed. |
| [37994856228](https://github.com/NetworkMD87/Notes-and-codes/actions/runs/37994856228) | GPU disabled / focused | 11 passed, 0 skipped, 0 unexpected, 0 flaky; 15.77s. Build and unit job passed. |
| [37995089043](https://github.com/NetworkMD87/Notes-and-codes/actions/runs/37995089043) | GPU disabled / full 1 | Failed: 86 expected passes, 102 failures, 0 flaky, 0 skipped; 13,396.90s (about 3h 43m). Build/unit job passed. |
| [37995092302](https://github.com/NetworkMD87/Notes-and-codes/actions/runs/37995092302) | GPU disabled / full 2 | Failed: 85 expected passes, 102 failures, 1 flaky pass, 0 skipped; 13,378.40s (about 3h 43m). Build/unit job passed. |
| [37995095604](https://github.com/NetworkMD87/Notes-and-codes/actions/runs/37995095604) | GPU disabled / full 3 | Failed: 86 expected passes, 100 failures, 2 flaky passes, 0 skipped; 13,234.11s (about 3h 40m). Build/unit job passed. |

Both focused modes passed without retries. The historical rendering failure was not reproduced in this comparison; no causal claim for GPU disabling is supported. No release or installed-app replacement is needed. Promotion to the automatic gate is a separate owner decision.

## 2026-10-10 — Invalid full-trial evidence: launcher argument ordering

The completed full run exposes a trial-harness defect. `smokeLaunchOptions` prepends rendering flags before `out/main/index.js`, while `pickFileArg` in `src/main/fileArg.ts` assumes the unpackaged entry script is argv[1] and skips exactly the first two argv entries. The drag-reorder assertion expected `Untitled-1` but received `index.js`; other failures report extra tabs, missing untitled buffers and timeouts. The rendering experiment therefore changed startup document state, invalidating this full run as an isolated rendering comparison. This is a defect introduced by the trial, not evidence of 100 independent app regressions.

The focused tests did not establish pristine untitled startup and missed this defect; the initial static review also missed it. In run 3, no final-test errors were classified as launch or cleanup failures in the JSON summary; timeout text dominated the failures. All three full runs failed, and each log shows the unintended `index.js` tab. No reliable rendering conclusion is established. The quiet follow-up is stopped after final result collection.

No code repair or new dispatch was made during the results follow-up. The owner subsequently approved the local launcher repair and small startup check below, explicitly before any further GitHub activity.

## 2026-10-10 — Local launcher repair

Rendering switches now follow the existing launch arguments, retaining the entry script at Electron argv[1]. No application file-routing code changed.

- Falsification: the new GPU-disabled blank-startup guard failed against the old launcher because argv[1] was `--disable-gpu` rather than the entry script.
- `npm test -- smokeCleanup`: 41 passed with corrected argument-order expectations.
- `npx playwright test tests/smoke/rendering-startup.spec.ts --retries=0 --reporter=line`: 4 passed in 11.7s. Both GPU-disabled and SwiftShader modes retain the entry script position and actually apply their Chromium switches. Each mode opens exactly one blank Untitled tab or the requested file with its expected rendered content; neither opens `index.js` as a document.
- `npm run build`: passed, including TypeScript checking. Test Electron processes exited. No new hosted run, staging, commit or push performed for this repair. Hosted reliability remains unverified; failed runs above remain invalid rendering comparisons.

The owner approved staging, commit and push of the launcher repair, followed only by hosted startup qualification. A `startup` workflow scope runs the four startup checks with retries disabled, covering both rendering modes explicitly, and skips the separate broad unit-test job. The smoke job still builds/typechecks the app before launching it. Further focused/full dispatch remains unapproved. Keep smoke manual-only.

## Hosted startup qualification — passed

Repair commit `db3e5e0e1142fe0f7fea46a613adc6723167aee5` was pushed to `codex/ci-smoke-rendering-trial`. [Run 38014194401](https://github.com/NetworkMD87/Notes-and-codes/actions/runs/38014194401) passed build/typecheck and all four real Electron startup checks in 6.23s: 0 skipped, 0 failures, 0 flaky results, with retries disabled. GPU-disabled and SwiftShader modes each preserve argv entry position, apply their actual switches, and open the correct blank/requested document. The workflow rendering input is `native` because this spec explicitly tests both software modes itself. The separate broad build/unit job was skipped as intended.

This qualifies the launcher startup repair on the hosted runner; it does not establish full-suite rendering reliability. No further focused or full suite was dispatched. Next proposed step is a bounded hosted focused comparison on the corrected launcher, subject to owner approval.

## Corrected focused comparison — 2026-10-10

The owner approved committing/pushing the startup evidence and dispatching only the 11 focused checks once in each mode. Evidence commit `559dfbf` was pushed; both runs tested that same commit with the corrected launcher.

| Run | Mode | Result |
| --- | --- | --- |
| [38014468464](https://github.com/NetworkMD87/Notes-and-codes/actions/runs/38014468464) | Native | 11 first-attempt passes, 0 flaky, 0 failures, 0 skipped; 15.74s. |
| [38014470496](https://github.com/NetworkMD87/Notes-and-codes/actions/runs/38014470496) | GPU disabled | 10 first-attempt passes, 1 retry-dependent pass, 0 final failures, 0 skipped; 48.60s. |

Both build/typecheck/unit jobs passed. The GPU-disabled retry was `the active highlighter colour persists across a relaunch`: its first attempt could not find the blue Highlighter toolbar button within 30 seconds; the second attempt passed. This is a toolbar/persistence assertion, not evidence that Monaco failed to paint. No causal attribution to GPU disabling is established from one comparison.

Recommendation: retain manual-only smoke and normal rendering as the baseline; this comparison does not demonstrate a software-rendering benefit. Investigate the highlighter retry and identify a representative historical rendered-content failure before proposing broader hosted qualification. No full suites were dispatched. These notes initially awaited Git approval and were subsequently committed and pushed; the hosted highlighter result is recorded below.

## Highlighter-colour test synchronization — 2026-10-10

Saved first-attempt evidence from run 38014470496 shows the second launch booted with a yellow highlighter toolbar. The first launch displayed blue and began closing roughly 40ms after the blue UI assertion; it did not check persistence. `setHighlightColour` starts `updateSettings` asynchronously while updating chrome immediately. A save/shutdown race is the likely explanation, but the artifact lacks the settings file and IPC completion evidence, so the exact hosted cause is not proven.

At the owner's request, only `tests/smoke/highlighter.spec.ts` was changed: before closing the first launch, poll the isolated `settings.json` until `lastHighlightColour` equals `blue`. A missing file is retried; unexpected read/parse errors remain failures. Existing second-launch toolbar, mode and cursor checks remain intact. No production code was changed.

- `npm run build`: passed, including typecheck.
- Single GPU-disabled local test, retries disabled: passed in 4.8s; final restored test passed in 3.9s. No other smoke tests ran.
- Guard falsification: temporarily replace the isolated settings-update handler with a no-save response. Blue UI still appeared, but the new disk assertion failed (`Expected: blue`, `Received: undefined`). Stub removed before the final passing run.
- The first overly anchored title filter selected no tests; corrected to the unique title substring before execution.
- Test processes exited. No full suite, GitHub run, staging, commit or push occurred for this change.

This verifies restore after confirmed save locally, not very-fast user quit or hosted reliability. Proposed next step: approve publication and a single hosted rerun of this test; keep broader suites and automatic-gate promotion out of scope.

The owner subsequently approved staging, commit and push of the synchronized test and evidence, then one hosted GPU-disabled run with retries off. A `highlighter-colour` workflow scope selects only this test and skips the separate broad unit-test job; the smoke job still builds/typechecks before launch. No full suites are authorized.

## Synchronized highlighter test — hosted pass

Commit `a42a996a0470b436f8e3aa1a09b2ff425d7bb9d7` is pushed. [Run 38015857383](https://github.com/NetworkMD87/Notes-and-codes/actions/runs/38015857383) passed build/typecheck and exactly one GPU-disabled highlighter-colour test in 3.63s. Saved JSON confirms retries configured to 0, 1 expected pass, 0 failures, 0 flaky results and 0 skipped. The broad unit-test job was skipped as intended.

The test confirms blue is on disk before closing and is restored after relaunch on this hosted run. One pass does not prove the historical failure's exact cause, long-term stability or rapid user-quit durability. No other tests or full suites were dispatched. Keep smoke manual-only. The owner approved committing and pushing these final result notes; further qualification and merging the trial branch remain separate decisions.

## Rendering-mode isolation repair — 2026-10-10

Read-only branch review found that the startup spec added its explicit rendering switches before calling the shared launcher, which then added `NC_SMOKE_RENDERING` switches again. A full GPU-disabled run could therefore execute a SwiftShader-labelled startup check with both modes selected (and vice versa). The dedicated hosted startup run cleared the environment variable, so its recorded pass remains valid; no full run has qualified the corrected launcher.

At the owner's request, the shared launcher now accepts an explicit mode that overrides the environment, applying switches once. The startup spec passes its mode directly and asserts that the conflicting mode's switches are absent. The workflow's special environment-clearing workaround is removed; ordinary tests still use the selected workflow mode. No production app code changed.

- Regression evidence: new shared-launcher override checks failed against the old implementation under both environment modes, including opposite-mode selections. An initial sandbox attempt failed during Vitest cache rename (`EPERM`), before tests ran; checks then used the normal environment.
- `npm test -- smokeCleanup`: all 43 helper tests passed. Two parameterized override checks each exercise explicit GPU-disabled, SwiftShader and native modes under GPU-disabled and SwiftShader environments, asserting exact arguments with no conflicting or duplicate flags.
- `npm run build`: passed, including typecheck. The project TypeScript gate covers `src`; the changed test helpers were exercised by the focused unit/startup runs.
- With `ELECTRON_RUN_AS_NODE` cleared and `NC_SMOKE_RENDERING=disable-gpu` deliberately retained, `npx playwright test tests/smoke/rendering-startup.spec.ts --retries=0 --reporter=line,json --trace=retain-on-failure` passed all four blank/file GPU-disabled/SwiftShader checks in 6.83s. JSON reported 4 expected passes, 0 failures, 0 flaky results and 0 skipped; the SwiftShader cases rejected inherited GPU-disabled switches.

This fixes the review finding with bounded local evidence. The owner subsequently approved staging, committing and pushing the repair and evidence, with no additional tests or GitHub runs. The reviewed branch is suitable for merging as manual-only trial tooling and test synchronization; merging requires separate approval. Broader hosted reliability and rapid user-quit durability remain unverified; retain manual-only smoke.

## Bounded native full baseline — 2026-10-10

The owner authorized a workflow adjustment, commit/push, and exactly one full hosted suite with normal rendering, retries disabled, stop at the first failure, and a 30-minute limit. Add `full-bounded` alongside existing scopes: both hosted jobs have 30-minute limits for this scope; the smoke command uses `--retries=0 --max-failures=1 --workers=1 --global-timeout=1500000`. The 25-minute Playwright limit reserves reporting/cleanup time within the job limit. Queue time is outside GitHub's job timeout, and a hard job timeout may still prevent artifact upload. Existing scope behavior and manual-only smoke gating are retained.

Dispatch inputs will be `rendering=native`, `scope=full-bounded` on the trial branch after publication. Static checks passed: parse workflow YAML with the existing `js-yaml` dependency, verify bounded-run flags, both job limits, manual-only smoke condition, report path, artifact upload condition and unchanged master-only push trigger; `git diff --check` passed. No additional local build or Electron tests were run for this isolated workflow change. Record the hosted result here before any repeat; no repeats are authorized yet.

Published commit `684f98c5a9f98f26f761d14a8851162074e439d1`. Exactly one [run 38017248759](https://github.com/NetworkMD87/Notes-and-codes/actions/runs/38017248759) was dispatched at 2026-10-10 02:30:59 UTC with the approved inputs. It failed at the first Settings assertion failure; no repeats dispatched.

- Build/typecheck and the separate unit-test job passed. The smoke job finished in 6m 15s (02:31:02–02:37:17 UTC); the JSON test duration was 255.90s (4m 15.90s). Neither timeout was reached; artifact upload succeeded.
- JSON confirms 192 selected tests: 112 expected first-attempt passes, 1 unexpected failure, 79 skipped because fail-fast stopped execution, 0 flaky results, and no retries. Configuration confirms `retries=0`, `maxFailures=1`, one worker and the 1,500,000ms test limit. Logs confirm `NC_SMOKE_RENDERING: native` and the bounded command. All four explicit rendering-startup cases passed in this full-run environment.
- First failure: `Settings: Editor groups controls and stacks safely at narrow widths`, `tests/smoke/settings.spec.ts:209`. Expected `Currently using English (UK).`; the snapshot repeatedly displayed `Currently using English (US).` for the entire 30-second assertion wait.
- Source diagnosis: this isolated layout test does not select a language or set `--lang`. `DEFAULT_SETTINGS.spellCheckLanguage` is `system`; IPC returns Electron's `app.getLocale()`, and `resolveSpellLocale` maps `en-US` to English (US). The UK-specific expectation also exists on `master`. This is an environment-dependent test expectation, not evidence of missing Monaco paint or a rendering-mode regression. No code fix was made in this result review.
- The extra report-level error is the expected `Testing stopped early after 1 maximum allowed failures.` message, not a second failing test. No smoke-cleanup issues or cleanup attachments were reported.
- Downloaded JSON, failure snapshot and trace are retained in ignored `.superpowers/ci-smoke-trial/38017248759/artifact/`; failure logs are retained beside that directory. The snapshot and source establish the locale mismatch without running another test.

The first bounded full baseline is not clean and cannot qualify hosted reliability; 79 tests remain unexecuted. Recommended next action: approve making the Settings layout test's language deterministic and validate only that test before another full attempt. No repeats, additional local tests, PR or merge were performed. These outcome notes are local and uncommitted; the workflow adjustment is already pushed. Retain manual-only smoke.

## Settings layout locale pinned — local check, 2026-10-10

The owner authorized fixing the Settings test's language, running only that test locally and updating evidence, with no full suite or GitHub run. The final change in `tests/smoke/settings.spec.ts` adds `--lang=en-GB` to this test's isolated app launch and asserts `app.getLocale() === 'en-GB'` and the language select remains `system` (Follow Windows). Existing resolved-language, grouping, accessibility, default-width and narrow-width layout assertions remain intact. Production settings defaults and source are unchanged.

- Initial local attempt seeded `spellCheckLanguage: 'en-GB'` with a US app locale. The explicit preference and app-locale assertions passed, but the resolved-language label was absent: `settingsPanel.ts` deliberately renders it only for Follow Windows. This attempt failed; the seeded preference/US locale were removed. The failed JSON, snapshot and trace are retained in ignored `.superpowers/ci-smoke-trial/settings-explicit-language-local/explicit-preference-*` files.
- Corrected fixture preserves Follow Windows and pins the app's UK locale, using the existing locale-test launch pattern. With `ELECTRON_RUN_AS_NODE` cleared and `NC_SMOKE_RENDERING=native`, `npx playwright test tests/smoke/settings.spec.ts -g 'Settings: Editor groups controls and stacks safely at narrow widths' --retries=0 --workers=1 --reporter=line,json --trace=retain-on-failure` passed exactly one test in 4.59s (3.35s test body). JSON confirms retries configured to 0, 1 expected pass, 0 failures, 0 flaky results and 0 skipped. Results are retained in ignored `.superpowers/ci-smoke-trial/settings-explicit-language-local/results.json`.
- `git diff --check` passed. Used the current built app from the previously passing build; no production source changed, so no build or unit rerun was needed. Both one-test attempts exited, with no task-owned Electron/test processes left; pre-existing Codex helpers were preserved.

The hosted mismatch is addressed in the local fixture and the complete layout check passes locally. Hosted verification of the changed test remains outstanding, as do the 79 unexecuted full-suite checks and repeatability qualification. No other smoke test, full suite, GitHub run, staging, commit or push was performed. The test and evidence changes remain local and uncommitted. Recommended next action: approve publication and a hosted check of only this Settings test before another full attempt; keep smoke manual-only.

## Settings layout — targeted hosted qualification, 2026-10-10

The owner subsequently approved adding a single-test workflow option, committing/pushing the Settings test and accumulated evidence notes, then exactly one hosted check with normal rendering and retries disabled. New `settings-layout` scope selects only the layout test by file and unique title, uses `--retries=0 --workers=1`, skips the separate broad unit-test job, retains build/typecheck in the smoke job, and limits that job to 30 minutes. It retains JSON, failure traces and the always-run artifact upload. No full suite is authorized.

Static YAML/settings-only selection checks and `git diff --check` passed; no additional local test or build was run. Dispatch after publication with `rendering=native`, `scope=settings-layout`; inspect the report before recommending further work.

Published commit `71adbf7fedb609d81f49c2afecb5a09ead8eb7ea`, including the locale-pinned test, workflow option and prior full-run/local evidence. Exactly one [run 38018338823](https://github.com/NetworkMD87/Notes-and-codes/actions/runs/38018338823) was dispatched at 2026-10-10 02:48:58 UTC on that commit with `rendering=native`, `scope=settings-layout`.

- Build/typecheck and the smoke job passed; the separate broad unit-test job was skipped as intended. The smoke job completed in 1m 40s, including setup and build.
- Saved JSON confirms exactly `Settings: Editor groups controls and stacks safely at narrow widths`: 1 expected first-attempt pass, 0 failures, 0 flaky results, 0 skipped, one worker, retries configured to 0 and no retry attempts. Report duration 3.87s (2.66s test body). Logs confirm `NC_SMOKE_RENDERING: native` and the single-test command.
- App-locale (`en-GB`), Follow Windows (`system`), UK resolved-language label, default and narrow-width layout assertions all passed. No cleanup issues, errors or attachments were reported; artifact upload succeeded. JSON and logs are retained in ignored `.superpowers/ci-smoke-trial/38018338823/`.

The original Settings failure is resolved and hosted-qualified for this targeted check. No other tests, full suite, repeat, PR or merge was dispatched/performed. Full-suite completion and repeatability remain outstanding. Recommended next action: approve one `native`/`full-bounded` attempt, inspect its result before any repeat, and retain manual-only smoke. The owner subsequently approved staging, committing and pushing these final outcome notes and the reconciled roadmap; the test, workflow and earlier evidence were already pushed.

The owner deferred the next full-suite attempt to a later session after today because the current time window is ending. It is now the roadmap's next task: obtain run approval, dispatch one bounded native full suite, inspect the result, and decide separately about repeats. No more tests or GitHub runs are authorized on 2026-10-10; no automatic follow-up, merge or gate promotion is authorized now. The full negative-evidence history above is preserved while the roadmap summarizes current status.
