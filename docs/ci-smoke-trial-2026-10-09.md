# CI renderer smoke trial — 2026-10-09

## Scope

Test whether software rendering resolves missing Monaco paints on GitHub-hosted Windows runners. Keep the manual-only smoke job until hosted reliability is established and automatic-gate promotion is approved. Normal app launches and existing test assertions/timeouts/retries remain unchanged.

Manual workflow inputs select `native`, `disable-gpu` (default), or `swiftshader`, and `focused` (default) or `full` scope. The corrected shared smoke launcher appends switches after the existing arguments, preserving the entry script position, file arguments, isolated user data and other launch options. SwiftShader uses Chromium's documented ANGLE switches: `--use-gl=angle --use-angle=swiftshader` ([Chromium documentation](https://chromium.googlesource.com/chromium/src/+/main/docs/gpu/swiftshader.md)). No unsafe SwiftShader or sandbox-disable switches are added.

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
