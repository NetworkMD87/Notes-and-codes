# CI renderer smoke trial — 2026-10-09

## Scope

Test whether software rendering resolves missing Monaco paints on GitHub-hosted Windows runners. Keep the manual-only smoke job until hosted reliability is established and automatic-gate promotion is approved. Normal app launches and existing test assertions/timeouts/retries remain unchanged.

Manual workflow inputs select `native`, `disable-gpu` (default), or `swiftshader`, and `focused` (default) or `full` scope. The shared smoke launcher prepends switches before the application entry point, preserving file arguments, isolated user data and other launch options. SwiftShader uses Chromium's documented ANGLE switches: `--use-gl=angle --use-angle=swiftshader` ([Chromium documentation](https://chromium.googlesource.com/chromium/src/+/main/docs/gpu/swiftshader.md)). No unsafe SwiftShader or sandbox-disable switches are added.

## Local evidence

- `npm run build`: passed, including TypeScript checking.
- `npm test -- smokeCleanup`: final normal-environment run passed 41 tests, including environment-to-launcher integration. Initial sandbox collection failed with an EPERM temporary-cache rename before any tests ran.
- `NC_SMOKE_RENDERING=disable-gpu npx playwright test tests/smoke/format-manual.spec.ts tests/smoke/highlighter.spec.ts --reporter=line`: 11 passed in 15.7 seconds, no retries reported. ELECTRON_RUN_AS_NODE was cleared for this run.
- Local coverage includes rendered formatting, focused split-pane formatting, highlight decorations/persistence and pen-cursor/CSP assertions. This does not establish hosted reliability or installed-app acceptance.

## Hosted experiment — pending publication approval

1. Dispatch focused native and GPU-disabled runs on the same trial commit. Try SwiftShader if GPU-disabled rendering does not resolve the failures.
2. For a successful candidate, run the full suite three times on the same commit. Compare first-attempt passes, retry counts, failures, duration and cleanup issues using uploaded `results.json` and retained failure traces.
3. Investigate any repeated failure or reliance on retries before proposing an automatic push/PR gate. Three green runs support a trial conclusion, not a guarantee. Preserve negative results and retain manual-only status if reliability is insufficient.

No hosted runs have occurred for this change. No release or installed-app replacement is needed. Publication and workflow dispatch require the owner’s bounded Git/GitHub approval; promotion to the automatic gate is a separate decision.
