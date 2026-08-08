# Production Dependency Security Patch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enforce patched production resolutions for DOMPurify and linkify-it, prove the vulnerable lockfile cannot return, and deliver a fully verified focused PR.

**Architecture:** Keep application code unchanged. Express the direct DOMPurify floor and transitive linkify-it floor in `package.json`, let npm regenerate the lockfile/install tree, and add a Vitest guard that compares the resolved lockfile versions with the patched minimums. Validate behavior through the existing complete unit, build, Electron smoke, and packaging gates.

**Tech Stack:** npm lockfile v3, TypeScript, Vitest, Electron, Playwright, electron-builder, PowerShell.

## Global Constraints

- DOMPurify must resolve to at least `3.4.13`.
- linkify-it must resolve to at least `5.0.2`.
- Do not run `npm audit fix` or make unrelated automatic dependency changes.
- Do not upgrade Electron, Vite, Vitest, electron-builder, or the wider toolchain in this branch.
- Preserve current Markdown rendering, sanitization, preview, and export behavior.
- Do not fix the concurrent smoke-test cleanup issue in this branch.
- Keep the final 45 minutes of the four-and-a-half-hour limit for packaging, review, and PR handoff.
- If verification is incomplete at the hard stop, publish only a draft PR with the exact incomplete or failing check.

---

## File structure

- `package.json`: declares the direct DOMPurify security floor and the transitive linkify-it override.
- `package-lock.json`: records the exact dependency graph that npm will install and package.
- `tests/unit/dependencySecurity.test.ts`: owns the resolved-version security regression guard; it contains no application behavior.

No source file under `src/` should change unless a directly related compatibility failure proves it necessary.

### Task 1: Enforce and guard the patched dependency resolutions

**Files:**
- Create: `tests/unit/dependencySecurity.test.ts`
- Modify: `package.json`
- Modify: `package-lock.json`

**Interfaces:**
- Consumes: lockfile-v3 `packages: Record<string, { version?: string }>` entries at `node_modules/dompurify` and `node_modules/linkify-it`.
- Produces: a Vitest regression that rejects a resolved version below the package's patched minimum.

- [ ] **Step 1: Add the failing lockfile regression test**

Create `tests/unit/dependencySecurity.test.ts` with:

```typescript
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const lock = JSON.parse(readFileSync(resolve(process.cwd(), 'package-lock.json'), 'utf8')) as {
  packages: Record<string, { version?: string }>
}

function numericVersion(version: string): [number, number, number] {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version)
  if (!match) throw new Error(`Expected a stable numeric package version, received ${version}`)
  return [Number(match[1]), Number(match[2]), Number(match[3])]
}

function compareVersions(leftVersion: string, rightVersion: string): number {
  const left = numericVersion(leftVersion)
  const right = numericVersion(rightVersion)
  for (let index = 0; index < left.length; index += 1) {
    const difference = left[index] - right[index]
    if (difference !== 0) return difference
  }
  return 0
}

describe('production dependency security floors', () => {
  it.each([
    { packageName: 'dompurify', patchedMinimum: '3.4.13' },
    { packageName: 'linkify-it', patchedMinimum: '5.0.2' },
  ])('$packageName resolves at or above $patchedMinimum', ({ packageName, patchedMinimum }) => {
    const version = lock.packages[`node_modules/${packageName}`]?.version
    expect(version, `${packageName} must be present in package-lock.json`).toBeTypeOf('string')
    expect(
      compareVersions(version as string, patchedMinimum),
      `${packageName}@${version} is below patched minimum ${patchedMinimum}`,
    ).toBeGreaterThanOrEqual(0)
  })
})
```

- [ ] **Step 2: Run the focused test and verify both vulnerable resolutions fail**

Run:

```powershell
npm test -- dependencySecurity
```

Expected: FAIL with two failed cases, naming `dompurify@3.4.10` below `3.4.13` and `linkify-it@5.0.1` below `5.0.2`. If either case passes before the lockfile changes, inspect the current lockfile and update the evidence before proceeding.

- [ ] **Step 3: Declare the minimum patched versions**

Apply this minimal `package.json` change:

```diff
   "dependencies": {
@@
-    "dompurify": "^3.4.10",
+    "dompurify": "^3.4.13",
@@
-  "allowScripts": {
+  "overrides": {
+    "linkify-it": "^5.0.2"
+  },
+  "allowScripts": {
```

- [ ] **Step 4: Regenerate the lockfile and installed dependency tree**

Run:

```powershell
npm install
```

Expected: npm resolves DOMPurify to `3.4.13` or newer and linkify-it to `5.0.2` or newer without changing the requested major versions.

- [ ] **Step 5: Inspect the dependency diff and installed graph**

Run:

```powershell
git diff -- package.json package-lock.json
npm ls dompurify linkify-it
```

Expected: `package.json` contains only the two intended constraint changes; lockfile movement is limited to their resolution metadata and root constraint metadata; `npm ls` reports patched versions with no invalid or extraneous dependency errors.

If npm moves unrelated packages, do not accept the churn. Recreate the lockfile update with the current npm version using only these two constraints, then repeat this inspection.

- [ ] **Step 6: Run the focused test and verify the patched graph passes**

Run:

```powershell
npm test -- dependencySecurity
```

Expected: PASS, 2 tests passed.

- [ ] **Step 7: Falsify the completed guard once more**

Temporarily change only the lockfile's `node_modules/dompurify.version` from the resolved patched version to `3.4.12`, leaving all other generated metadata untouched. Run:

```powershell
npm test -- dependencySecurity
```

Expected: FAIL only the DOMPurify case with `dompurify@3.4.12 is below patched minimum 3.4.13`.

Restore the generated DOMPurify version exactly, rerun the same command, and expect both cases to pass. Confirm `git diff -- package-lock.json` no longer contains the temporary falsification.

- [ ] **Step 8: Verify the production audit result**

Run:

```powershell
npm audit --omit=dev
```

Expected: exit 0 with 0 production vulnerabilities. If npm reports any production advisory, capture its package, path, severity, and patched range; do not apply automatic remediation.

- [ ] **Step 9: Commit the independently testable dependency fix**

Run:

```powershell
git add package.json package-lock.json tests/unit/dependencySecurity.test.ts
git commit -m "fix: patch markdown security dependencies"
```

Expected: one focused commit containing only the two manifests and the regression test.

### Task 2: Complete verification, review, and PR delivery

**Files:**
- Verify: `package.json`
- Verify: `package-lock.json`
- Verify: `tests/unit/dependencySecurity.test.ts`
- Verify without modification: `src/renderer/markdownRender.ts`
- Verify without modification: `src/renderer/markdownPreview.ts`

**Interfaces:**
- Consumes: Task 1's patched lockfile and passing dependency-security test.
- Produces: full verification evidence and a focused GitHub PR targeting `master`.

- [ ] **Step 1: Run the fast type and unit gates**

Run:

```powershell
npm run typecheck
npm test
```

Expected: both commands exit 0; the complete Vitest suite, including the new two-case guard, passes.

- [ ] **Step 2: Build the production bundles**

Run:

```powershell
npm run build
```

Expected: TypeScript checking and all electron-vite main, preload, and renderer builds exit 0.

- [ ] **Step 3: Run the complete Electron smoke suite**

Run in the same PowerShell process:

```powershell
Remove-Item env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
npm run test:smoke
```

Expected: all Playwright Electron smoke tests pass using the repository's configured retries. Report a cleanup-only failure separately from an application assertion, and retry only as permitted by the existing test configuration.

- [ ] **Step 4: Build the distributable artifacts**

Run:

```powershell
npm run package
```

Expected: build succeeds and electron-builder creates the NSIS installer, portable executable, and unpacked application under `dist/`. If Windows symlink privilege blocks packaging, preserve the successful build evidence and report that environmental blocker exactly.

- [ ] **Step 5: Run final repository and audit checks**

Run:

```powershell
git diff --check master...HEAD
npm audit
git status --short --branch
```

Expected: no whitespace errors; the full audit may still exit nonzero only for separately scoped development/build findings; the worktree contains no task-related uncommitted changes. Preserve the user's untracked `.agents/` and `AGENTS.md` files untouched.

- [ ] **Step 6: Perform focused and whole-branch reviews**

Review `master...HEAD` for:

- enforcement of both exact patched minimums;
- absence of unrelated dependency churn;
- a guard that demonstrably failed before the update and passed afterward;
- no application-code or runtime-behavior changes;
- accurate distinction between production audit status and remaining development/build warnings; and
- complete command evidence for typecheck, unit, build, smoke, and packaging gates.

Resolve every in-scope finding, rerun the affected check and every later check, and commit any correction as a separate focused commit.

- [ ] **Step 7: Push and create the focused PR**

Run:

```powershell
git push -u origin codex/dependency-security-patch
$dependencyPatchPrBody = @'
## Summary
- raise DOMPurify to its patched production floor
- override transitive linkify-it to its patched floor
- guard both resolved versions in the unit suite

## Verification
- npm audit --omit=dev
- npm run typecheck
- npm test
- npm run build
- npm run test:smoke
- npm run package
- git diff --check master...HEAD

## Remaining scope
- existing development/build dependency audit warnings are unchanged and require separate major-version work
- existing concurrent smoke-cleanup reliability issue is unchanged
'@
gh pr create --base master --head codex/dependency-security-patch --title "fix: patch Markdown security dependencies" --body $dependencyPatchPrBody
```

Expected: branch push succeeds and GitHub returns the new PR URL. If any required verification is incomplete at the hard stop, add `--draft` to the PR command and replace the corresponding verification bullet with the exact incomplete or failing result.

- [ ] **Step 8: Report the outcome without overstating audit closure**

Report the PR URL, commit SHAs, exact resolved versions, each verification result, production audit result, full-audit development/build warning count, packaging artifact result, and any retry or environmental blocker. State explicitly that no automatic dependency remediation was applied.
