# Scoped Find in Files Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add explicit, accessible include/exclude scope to Find in Files while preserving literal matching, live-buffer precedence, shared workspace exclusions, cancellation, and existing caps.

**Architecture:** A pure shared `searchScope` module normalizes the session-local fields, derives a deterministic scope path for each open buffer, and composes the glob matcher delivered by the workspace-responsiveness plan. Main applies excludes during traversal and includes before file I/O; renderer applies the same compiled scope to open buffers before matching their live content. The existing Find in Files overlay owns only session-local field state and renders an always-visible effective-scope summary.

**Tech Stack:** Electron 31, TypeScript, imperative renderer DOM, shared pure TypeScript, Vitest, Playwright Electron smoke tests.

## Global Constraints

- Execute after `2026-08-08-quality-scale-keyboard-access-1-accessible-surfaces.md`, `-2-workspace-responsiveness.md`, and `-3-search-recovery-efficiency.md` are complete and green.
- Consume `normalizePathGlobs()` / `compilePathGlobs()` from `src/shared/pathGlob.ts` and `WorkspaceFilter` from `src/shared/types.ts`; do not create a second glob implementation.
- Query matching remains literal. Scope globs select paths only and never reach the document-content matcher.
- Preserve UTF-8/UTF-16 decoding, dirty/open-buffer precedence, Windows path folding, cancellation, result caps, and truncation explanations.
- Main applies disk scope; renderer applies open-buffer scope. Neither process may reinterpret the syntax.
- No Node/Electron/filesystem imports enter `src/renderer/` or `src/shared/`.
- Scope fields are session-local. Only `Settings.workspaceExcludes` persists.
- Show All Files bypasses workspace exclusions but never bypasses explicit search include/exclude fields.
- Follow TDD and falsify each cross-cutting guard before trusting it.

---

### Task 1: Define the pure search-scope contract

**Files:**
- Create: `src/shared/searchScope.ts`
- Create: `tests/unit/searchScope.test.ts`
- Modify: `src/shared/types.ts`

**Interfaces:**
- Consumes: `normalizePathGlobs(patterns: string[]): string[]`, `compilePathGlobs(patterns: string[]): { matches(path: string): boolean; prunes(path: string): boolean }` from `src/shared/pathGlob.ts`.
- Produces: `SearchScope`, `EMPTY_SEARCH_SCOPE`, `parseScopeField()`, `scopePath()`, `compileSearchScope()`, and `describeSearchScope()` for Tasks 2-3.

- [ ] **Step 1: Add the shared types and failing normalization/path tests**

Add to `src/shared/types.ts`:

```ts
export interface SearchScope {
  includePatterns: string[]
  excludePatterns: string[]
}
```

Create `tests/unit/searchScope.test.ts` with concrete cases:

```ts
import { describe, expect, it } from 'vitest'
import {
  EMPTY_SEARCH_SCOPE,
  compileSearchScope,
  describeSearchScope,
  parseScopeField,
  scopePath,
} from '../../src/shared/searchScope'

describe('search scope', () => {
  it('normalizes comma-separated patterns and removes blanks/duplicates', () => {
    expect(parseScopeField(' src/**/*.ts, , SRC\\**\\*.TS, **/*.md '))
      .toEqual(['src/**/*.ts', '**/*.md'])
  })

  it('uses a relative path in-root, basename outside-root, and null for untitled', () => {
    expect(scopePath('C:/work', 'c:\\work\\src\\a.ts')).toBe('src/a.ts')
    expect(scopePath('C:/work', 'D:/loose/note.md')).toBe('note.md')
    expect(scopePath(null, 'D:/loose/note.md')).toBe('note.md')
    expect(scopePath('C:/work', null)).toBeNull()
  })

  it('includes untitled buffers only when include patterns are empty', () => {
    expect(compileSearchScope(EMPTY_SEARCH_SCOPE, [], false).includes(null)).toBe(true)
    expect(compileSearchScope({ includePatterns: ['**/*.md'], excludePatterns: [] }, [], false).includes(null)).toBe(false)
  })

  it('adds explicit excludes and lets show-all bypass workspace excludes only', () => {
    const scope = { includePatterns: [], excludePatterns: ['**/*.test.ts'] }
    expect(compileSearchScope(scope, ['**/dist/**'], false).includes('dist/a.ts')).toBe(false)
    expect(compileSearchScope(scope, ['**/dist/**'], true).includes('dist/a.ts')).toBe(true)
    expect(compileSearchScope(scope, ['**/dist/**'], true).includes('src/a.test.ts')).toBe(false)
  })

  it('describes the effective scope without hiding workspace exclusions', () => {
    expect(describeSearchScope(EMPTY_SEARCH_SCOPE, 6, false)).toBe('All files · excluding 6 workspace patterns')
    expect(describeSearchScope({ includePatterns: ['src/**/*.ts'], excludePatterns: ['**/*.test.ts'] }, 6, false))
      .toBe('src/**/*.ts · excluding 6 workspace patterns + 1 search pattern')
  })
})
```

- [ ] **Step 2: Run the focused test and verify the missing-module failure**

Run: `npm test -- searchScope`

Expected: FAIL because `src/shared/searchScope.ts` does not exist.

- [ ] **Step 3: Implement the pure contract**

Create `src/shared/searchScope.ts` with these exported shapes:

```ts
import type { SearchScope } from './types'
import { compilePathGlobs, normalizePathGlobs } from './pathGlob'

export const EMPTY_SEARCH_SCOPE: SearchScope = {
  includePatterns: [],
  excludePatterns: [],
}

export function parseScopeField(value: string): string[] {
  return normalizePathGlobs(value.split(','))
}

export function scopePath(root: string | null, filePath: string | null): string | null {
  if (!filePath) return null
  const file = filePath.replaceAll('\\', '/')
  const base = file.slice(file.lastIndexOf('/') + 1)
  if (!root) return base
  const normalizedRoot = root.replaceAll('\\', '/').replace(/\/$/, '')
  const foldedFile = file.toLocaleLowerCase('en')
  const foldedRoot = normalizedRoot.toLocaleLowerCase('en')
  return foldedFile.startsWith(foldedRoot + '/')
    ? file.slice(normalizedRoot.length + 1)
    : base
}

export function compileSearchScope(
  scope: SearchScope,
  workspaceExcludes: string[],
  showAll: boolean,
): { includes(path: string | null): boolean; traversalExcludes: string[] } {
  const includes = compilePathGlobs(scope.includePatterns)
  const explicitExcludes = compilePathGlobs(scope.excludePatterns)
  const workspaceExcludesMatcher = compilePathGlobs(showAll ? [] : workspaceExcludes)
  const traversalExcludes = normalizePathGlobs([
    ...(showAll ? [] : workspaceExcludes),
    ...scope.excludePatterns,
  ])
  return {
    traversalExcludes,
    includes: path => {
      if (path === null) return scope.includePatterns.length === 0
      if (scope.includePatterns.length > 0 && !includes.matches(path)) return false
      return !explicitExcludes.matches(path) && !workspaceExcludesMatcher.matches(path)
    },
  }
}
```

Implement `describeSearchScope()` with the exact strings asserted above and singular/plural grammar.

- [ ] **Step 4: Run unit tests and verify green**

Run: `npm test -- searchScope`

Expected: PASS.

- [ ] **Step 5: Falsify the basename rule**

Temporarily return the absolute path for an out-of-root file. Run `npm test -- searchScope` and verify the out-of-root assertion fails. Revert the break and rerun green.

- [ ] **Step 6: Commit the pure scope model**

```powershell
git add src/shared/searchScope.ts src/shared/types.ts tests/unit/searchScope.test.ts
git commit -m "feat: define find-in-files scope model"
```

---

### Task 2: Apply one scope to disk files and live buffers

**Files:**
- Modify: `src/shared/types.ts`
- Modify: `src/main/searchService.ts`
- Modify: `src/renderer/findInFilesModel.ts`
- Modify: `src/renderer/findInFiles.ts`
- Modify: `tests/unit/fsService.test.ts`
- Modify: `tests/unit/searchService.test.ts`
- Modify: `tests/unit/findInFilesModel.test.ts`

**Interfaces:**
- Consumes: `SearchScope`, `compileSearchScope()`, `scopePath()`, `WorkspaceFilter`, cancellable `walkFiles()` from Plans 2-3.
- Produces: extended `SearchRequest` and additive `searchBuffers(buffers, query, opts, root, scope, filter)` for Task 3; the original first three arguments stay in place.

- [ ] **Step 1: Extend the request type and add failing disk-scope tests**

Change `SearchRequest` to carry the shared filter/scope explicitly:

```ts
export interface SearchRequest {
  root: string
  query: string
  opts: SearchOptions
  skipPaths: string[]
  filter: WorkspaceFilter
  scope: SearchScope
  searchId: number
}
```

Add focused cases to `tests/unit/searchService.test.ts` using its existing temp-directory harness:

```ts
it('applies includes before file reads and prunes explicit excludes', async () => {
  // fixture: src/a.ts, src/a.md, src/a.test.ts, dist/hidden.ts; all contain NEEDLE
  const res = await searchFiles(request({
    scope: { includePatterns: ['src/**/*.ts'], excludePatterns: ['**/*.test.ts'] },
  }))
  expect(res.files.map(file => relative(root, file.path))).toEqual(['src/a.ts'])
})
```

Instrument the injected filesystem seam already used by cancellation tests, or add a narrow read callback seam, and assert `src/a.md`, `src/a.test.ts`, and `dist/hidden.ts` are never read.

Also add a pruning assertion with `filter.showAll: true`, explicit search exclude `dist/**`, and Plan 3's `afterDirectoryRead` counter. For a root containing only `src/` and `dist/`, assert the counter observes the root plus `src/` (two directory reads), never `dist/`. This proves explicit search excludes prune traversal even while Show All bypasses workspace exclusions.

- [ ] **Step 2: Add failing live-buffer scope tests**

Extend `tests/unit/findInFilesModel.test.ts`:

```ts
it('uses relative, basename, and untitled scope paths consistently', () => {
  const buffers = [
    { filePath: 'C:/work/src/a.ts', title: 'a.ts', content: 'needle' },
    { filePath: 'D:/loose/note.md', title: 'note.md', content: 'needle' },
    { filePath: null, title: 'Untitled-1', content: 'needle' },
  ]
  expect(searchBuffers(buffers, 'needle', opts, 'C:/work', {
    includePatterns: ['**/*.md'], excludePatterns: [],
  }, { showAll: false, excludePatterns: [] }).map(result => result.title ?? result.path)).toEqual(['D:/loose/note.md'])
})
```

Add a second assertion showing untitled matches when includes are empty.

- [ ] **Step 3: Run the two focused suites and verify red**

Run: `npm test -- searchService findInFilesModel`

Expected: FAIL because `SearchRequest` and `searchBuffers` do not yet apply scope.

- [ ] **Step 4: Filter traversal and live buffers with the shared scope**

In `searchService.ts`, compile once:

```ts
const scope = compileSearchScope(req.scope, req.filter.excludePatterns, req.filter.showAll)
const walk = await walkFiles(req.root, {
  showAll: false,
  excludePatterns: scope.traversalExcludes,
}, { shouldCancel, ...walkOptions })

for (const path of walk.files) {
  const relativePath = relativeWorkspacePath(req.root, path)
  if (!scope.includes(relativePath)) continue
  // existing skip/stat/read/decode/search/cap flow follows unchanged
}
```

In `searchService.ts` (main only), derive `relativePath` with `node:path.relative(req.root, path).replace(/\\/g, '/')`, matching `fsService`'s `workspacePath` rule. Do not export the Node helper into shared/renderer code. In `findInFilesModel.ts`, apply `scope.includes(scopePath(root, buffer.filePath))` before calling the incremental content matcher.

Keep the Task 2 commit buildable before the UI exists: import `EMPTY_SEARCH_SCOPE` in `findInFiles.ts`, pass it as `scope` in the IPC request, and extend the current live-buffer call additively to `searchBuffers(buffers, query, this.opts, this.d.root(), EMPTY_SEARCH_SCOPE, this.d.filter())`. Task 3 replaces only those two compatibility values with the session-local scope.

- [ ] **Step 5: Run focused suites and verify green**

Run: `npm test -- fsService searchService findInFilesModel searchScope` followed by `npm run build`.

Expected: PASS.

- [ ] **Step 6: Falsify live-buffer scope**

Temporarily bypass the renderer scope check. Verify `tests/unit/findInFilesModel.test.ts` fails by returning the in-root `.ts` or untitled buffer under the `**/*.md` include. Revert and rerun green.

- [ ] **Step 7: Commit shared disk/live scope**

```powershell
git add src/shared/types.ts src/main/searchService.ts src/renderer/findInFilesModel.ts src/renderer/findInFiles.ts tests/unit/fsService.test.ts tests/unit/searchService.test.ts tests/unit/findInFilesModel.test.ts
git commit -m "feat: apply find scope to disk and live buffers"
```

---

### Task 3: Add the accessible session-local scope UI

**Files:**
- Modify: `src/renderer/findInFiles.ts`
- Modify: `src/renderer/main.ts`
- Modify: `src/renderer/index.html`
- Modify: `tests/smoke/find-in-files.spec.ts`

**Interfaces:**
- Consumes: accessible dialog primitive from Plan 1; `parseScopeField()`, `describeSearchScope()`, extended `searchBuffers()`, `SearchRequest`, `window.api.cancelSearch()`, and current `Settings.workspaceExcludes`.
- Produces: session-local `includeText`/`excludeText` state and effective-scope requests used by the existing results renderer.

- [ ] **Step 1: Write the failing accessible-scope smoke path**

Add a test to `tests/smoke/find-in-files.spec.ts` that creates this combined disk/live fixture:

```text
src/dirty.ts         -> stale disk text (open it and replace with scoped needle without saving)
src/clean.ts         -> scoped needle (open, leave clean)
src/disk-only.ts     -> scoped needle (leave closed)
src/drop.test.ts     -> scoped needle (leave closed)
docs/drop.md         -> scoped needle (leave closed)
untitled buffer      -> scoped needle
```

Drive only user-visible controls:

```ts
await win.keyboard.press('Control+Shift+F')
await win.getByRole('button', { name: 'Search scope' }).click()
await win.getByLabel('Files to include').fill('src/**/*.ts')
await win.getByLabel('Files to exclude').fill('**/*.test.ts')
await win.getByLabel('Find in files').fill('scoped needle')
await expect(win.getByText('src/**/*.ts · excluding 6 workspace patterns + 1 search pattern')).toBeVisible()
await expect(win.locator('.fif-file')).toHaveCount(3)
await expect(win.locator('.fif-file')).toContainText(['src\\dirty.ts', 'src\\clean.ts', 'src\\disk-only.ts'])
```

Before applying the include/exclude fields, search for the stale disk text and assert `src\dirty.ts` is absent, proving the dirty live buffer shadows its disk copy. With `src/**/*.ts` plus `**/*.test.ts`, assert the dirty, clean, and disk-only TypeScript results remain, while the test file, Markdown file, and untitled buffer are absent. Then clear the include field and assert the untitled buffer becomes eligible. These assertions cover all four result categories in one real two-process flow: closed disk file, dirty open file, clean open file, and untitled buffer.

Close/reopen the overlay and assert both fields retain their values for the current app session.

- [ ] **Step 2: Run the focused smoke and verify red**

Run:

```powershell
npm run build
Remove-Item env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
npx playwright test tests/smoke/find-in-files.spec.ts --grep "scopes disk and live results"
```

Expected: FAIL because the Search scope button/fields do not exist.

- [ ] **Step 3: Add scope state, controls, and summary**

Extend `FindInFilesDeps`:

```ts
workspaceExcludes: () => string[]
```

Keep fields on the `FindInFiles` instance:

```ts
private scopeExpanded = false
private includeText = ''
private excludeText = ''

private scope(): SearchScope {
  return {
    includePatterns: parseScopeField(this.includeText),
    excludePatterns: parseScopeField(this.excludeText),
  }
}
```

Build a `button` named **Search scope** with `aria-expanded`/`aria-controls`, two real labels/inputs, a concise syntax note, and an always-visible `.fif-scope-summary` using `aria-live="polite"`. Input changes must:

1. update session-local text;
2. cancel the current request;
3. reset the active row;
4. update the summary; and
5. use the existing 150 ms scheduling path.

Pass the exact same `scope` to `searchBuffers()` and `window.api.searchFiles()`. In `main.ts`, supply `workspaceExcludes: () => workspaceExcludes` from the state introduced by Plan 2.

- [ ] **Step 4: Style without changing the overlay hierarchy**

Add compact `.fif-scope-toggle`, `.fif-scope`, `.fif-scope-field`, `.fif-scope-help`, and `.fif-scope-summary` rules using existing panel, muted, border, radius, and focus-visible tokens. Do not add new colours or a second floating surface.

- [ ] **Step 5: Run the focused smoke and related unit suites**

Run:

```powershell
npm test -- searchScope findInFilesModel searchService chromeCss
npm run build
Remove-Item env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
npx playwright test tests/smoke/find-in-files.spec.ts --grep "scopes disk and live results"
```

Expected: PASS.

- [ ] **Step 6: Falsify the summary/scope connection**

Temporarily omit `scope` from both the IPC request and live-buffer call while leaving the summary visible. Verify the smoke test fails because excluded results appear despite the claimed scope. Then temporarily clear `skipPaths` and verify the stale disk text for `src\dirty.ts` appears, proving the live-content precedence assertion can fail. Revert both breaks and rerun green.

- [ ] **Step 7: Commit the scope UI**

```powershell
git add src/renderer/findInFiles.ts src/renderer/main.ts src/renderer/index.html tests/smoke/find-in-files.spec.ts
git commit -m "feat: add scoped find in files"
```

---

### Task 4: Guard loose tabs, untitled buffers, and settings invalidation end to end

**Files:**
- Modify: `tests/smoke/find-in-files.spec.ts`
- Modify: `tests/smoke/settings.spec.ts`
- Modify: `src/renderer/main.ts` only if the Plan 2 settings invalidation hook is not already wired to Find in Files.

**Interfaces:**
- Consumes: final scoped Find UI and Plan 2's workspace-exclusion update callback.
- Produces: cross-process regression coverage for the scope-path and invalidation contracts.

- [ ] **Step 1: Add a no-folder/open-buffer scope smoke test**

Seed a session with one file-backed Markdown tab and one untitled tab, with no folder restored. Search a shared marker with include `*.md`; assert only the Markdown tab appears. Clear the include; assert both tabs appear. This is the assertion that proves the basename/untitled rule, rather than merely proving open tabs are searchable.

- [ ] **Step 2: Add a workspace-exclusion invalidation smoke test**

Open a fixture containing `generated/hidden.txt`, confirm it appears in Quick Open/Find in Files, then add `**/generated/**` through Settings ▸ Folder. Without causing a filesystem event, reopen/search and assert the file disappears and the scope summary's workspace-pattern count updates.

- [ ] **Step 3: Run the focused smoke tests and verify red if either hook is absent**

Run:

```powershell
npm run build
Remove-Item env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
npx playwright test tests/smoke/find-in-files.spec.ts tests/smoke/settings.spec.ts --grep "scope|workspace exclusion"
```

Expected before the final wiring: FAIL on the exact loose-tab eligibility or stale-index assertion. After wiring: PASS.

- [ ] **Step 4: Complete only the missing invalidation wiring**

If Plan 2 already emits a workspace-filter change callback, ensure it calls a public `findInFiles.workspaceChanged()` method that cancels the request, updates the summary, and schedules a rerun only while the overlay is open. Do not introduce a second settings listener.

- [ ] **Step 5: Falsify settings invalidation**

Temporarily remove the workspace-filter change callback. Verify the settings smoke still updates persisted settings but fails because the old result remains visible/indexed. Revert and rerun green.

- [ ] **Step 6: Run the complete scoped-search slice gate**

Run:

```powershell
npm test -- searchScope findInFilesModel searchService fsService
npm run typecheck
npm run build
Remove-Item env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
npx playwright test tests/smoke/find-in-files.spec.ts tests/smoke/settings.spec.ts
git diff --check
```

Expected: all commands PASS with the smoke suite's normal configured retries.

- [ ] **Step 7: Commit the edge guards**

```powershell
git add tests/smoke/find-in-files.spec.ts tests/smoke/settings.spec.ts src/renderer/main.ts
git commit -m "test: guard scoped search edge paths"
```

---

## Slice completion

Request a fresh code review for the scoped-search slice. Confirm every review finding is fixed and the focused slice gate remains green. Do not bump the version or release this slice independently; return to the umbrella plan for whole-pass verification.
