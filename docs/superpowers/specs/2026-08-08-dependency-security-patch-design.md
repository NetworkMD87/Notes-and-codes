# Production Dependency Security Patch Design

**Status:** Approved in conversation on 2026-08-08. This document records the approved design before implementation planning.

## Context

The current lockfile resolves two production-path packages with published security advisories:

- `dompurify@3.4.10`; the current application usage does not reach the vulnerable `IN_PLACE` hook pattern, but the installed version is below the upstream patched release `3.4.13`.
- `linkify-it@5.0.1`, reached through MarkdownIt's enabled `linkify` option. Repeated contiguous `mailto:` input can trigger quadratic processing in Markdown preview and export. Upstream patches this in `5.0.2`.

The full `npm audit` also reports development/build dependency advisories. Those packages are outside this focused production-path patch and need separate, larger upgrades. The known smoke-test cleanup race is likewise separate: it can make test teardown unreliable on Windows, but it does not affect ordinary application use.

Work has a hard four-and-a-half-hour limit. The implementation therefore reserves the final 45 minutes for verification evidence, packaging, review, and PR handoff.

## Goals

- Resolve DOMPurify to at least `3.4.13` and linkify-it to at least `5.0.2`.
- Preserve the current Markdown rendering, sanitization, preview, and export behavior.
- Add a deterministic regression guard that fails if the lockfile later resolves either vulnerable version.
- Complete the repository's build, unit, Electron smoke, packaging, and audit checks within the timebox.
- Publish a focused PR with exact verification results.

## Non-goals

- `npm audit fix` or unrelated automatic dependency changes.
- Electron, Vite, Vitest, electron-builder, or other development-toolchain upgrades.
- Reworking Markdown rendering or disabling automatic linkification.
- Fixing the concurrent smoke-test cleanup issue.
- Version bumping, tagging, releasing, or merging without a separate decision.

## Approaches considered

### Chosen: focused patched resolutions plus a lockfile guard

Raise DOMPurify's declared minimum to `^3.4.13`, declare a transitive override of `linkify-it` to `^5.0.2`, and regenerate the lockfile/install tree with npm. The override makes the transitive security floor intentional and visible rather than relying only on today's lockfile resolution.

A unit test will read `package-lock.json`, following the repository's existing dependency-asset test precedent, and assert that the installed DOMPurify and linkify-it versions meet their respective patched minimums. This test must fail against the current vulnerable lockfile before the dependency update is applied.

This is the smallest change that closes the reachable advisory while retaining the current major versions and application behavior.

### Rejected for this timebox: broader Electron and build-toolchain upgrades

Electron and several build-only dependencies have advisories or deprecations, but their supported upgrade paths cross major versions and require broader compatibility and packaging work. Combining them with the reachable Markdown fix would make it unlikely that the result could be fully verified in four and a half hours.

### Rejected as the first priority: smoke-test cleanup hardening

Adding consistent retry-based cleanup and stronger child-process teardown would improve harness reliability. It does not close the production Markdown processing exposure, so it remains follow-up work after the dependency patch is safely delivered.

## Dependency changes

- Change `dependencies.dompurify` from `^3.4.10` to `^3.4.13`.
- Add `overrides.linkify-it` as `^5.0.2`.
- Regenerate only the dependency metadata and installed modules required by those constraints.
- Review the resulting `package-lock.json` diff for unexpected package movement before testing.

No renderer, main-process, preload, IPC, or application-behavior source file should change unless verification reveals a directly related compatibility problem.

## Regression guard

Add a focused unit test under `tests/unit/` that parses the root lockfile entries for `node_modules/dompurify` and `node_modules/linkify-it`. It will compare numeric semantic-version components against the patched floors and produce a clear failure naming the resolved vulnerable version.

The guard is intentionally based on the resolved install graph rather than only `package.json`: DOMPurify's declaration and linkify-it's transitive constraint are not proof of what npm actually installs and packages.

Falsification sequence:

1. Add and run the guard against the current lockfile; it must fail for both current resolutions.
2. Apply the dependency update and rerun it; it must pass.
3. Temporarily lower either asserted lockfile entry locally and confirm the corresponding assertion fails, then restore the generated lockfile.

Timing-based performance thresholds are excluded because machine load would make them flaky. The advisory is closed by enforcing the upstream patched resolutions.

## Verification and delivery

Run checks in this order so inexpensive failures surface first:

1. Focused dependency regression test.
2. Review the package and lockfile diff, then run `npm audit --omit=dev` and record the exact result.
3. `npm run typecheck` and `npm test`.
4. `npm run build`.
5. `npm run test:smoke` with `ELECTRON_RUN_AS_NODE` cleared and the repository's configured retries retained.
6. `npm run package`.
7. `git diff --check`, focused independent review, and final Git status inspection.

The full audit may continue to report known development/build findings; those must be reported separately rather than described as production-cleaning failures. No automatic audit remediation will be used.

If a directly related regression is found, fix only what is required for these patched versions and rerun the affected gate plus all later gates. If the hard stop arrives before all evidence is green, publish only a draft PR and record the exact incomplete or failing check. Do not begin a second dependency-upgrade stream inside the remaining buffer.

## Expected file impact

- `package.json`: patched minimum and transitive override.
- `package-lock.json`: regenerated resolved versions and integrity metadata.
- `tests/unit/dependencySecurity.test.ts`: deterministic vulnerable-resolution guard.

## Delivery boundary

This branch delivers the focused dependency patch and verification evidence only. Electron/toolchain modernization and smoke-test cleanup hardening remain separately scoped follow-ups. Release bookkeeping is not part of this change and, if later requested, must use the repository release checklist.
