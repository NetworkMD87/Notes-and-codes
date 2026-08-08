# Workspace Exclusions & Responsiveness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every workspace traversal one persisted exclusion model, keep folder refresh work single-flight, and make Quick Open deterministic and responsive at the 20,000-file cap.

**Architecture:** A pure `src/shared/pathGlob.ts` module is the sole interpreter for normalized workspace-relative globs. A typed `WorkspaceFilter` crosses the guarded IPC boundary into root-aware `readDir`/`walkFiles`; `FolderMode` snapshots that filter and its root through a one-active/one-dirty scheduler, then publishes a cached immutable Quick Open candidate set only while the snapshot is current. The benchmark and smoke fixture use the same deterministic 20,000-file generator.

**Tech Stack:** TypeScript 5.5, Electron 31 main/preload/sandboxed-renderer split, Vitest 2, Playwright Electron, Node filesystem APIs in main/tests only. No new runtime dependency.

**Spec:** `docs/superpowers/specs/2026-08-08-quality-scale-keyboard-access-design.md` sections B, E, and delivery slice 3.

## Global Constraints

- This is delivery slice 3 of the bundled v1.19.0 pass; do not bump the version, edit release bookkeeping, tag, package, publish, or merge in this plan.
- No `node:*`, Electron, filesystem, `Buffer`, or OS access enters `src/renderer/`.
- Every IPC edit stays consistent in `Api`, preload, and `registerIpc`, and handlers use the local guarded `handle` wrapper.
- The only supported pattern syntax is `*`, `?`, and a complete `**` segment. Braces, character classes, leading negation, and escape syntax are literal.
- `**` matches zero or more complete segments. A terminal `/**` matches the directory node itself and all descendants, enabling pre-descent pruning.
- Patterns and candidate paths are workspace-relative with `/` separators. Leading `/`, blank lines, and duplicate patterns are removed during normalization. This Windows-first app compares globs case-insensitively in both processes.
- Default exclusions are exactly `**/.git/**`, `**/node_modules/**`, `**/dist/**`, `**/out/**`, `**/build/**`, and `**/coverage/**`.
- Show All Files bypasses all workspace exclusions for sidebar reads, Quick Open indexing, and Find in Files; it does not delete or rewrite the saved list.
- Keep the current 20,000-file cap and truncation note. No unbounded concurrency, worker thread, glob package, or `.gitignore` parser.
- Preserve literal Find in Files matching, encoding detection, dirty-buffer precedence, path folding, and result caps. This plan changes only its workspace filter input; it does not add scope UI or cancellation.
- Tests under `tests/` are not included by `tsconfig.json`; `npm run build` remains the primary source type/API gate.
- Smoke tests use isolated `--user-data-dir` profiles. Clear `ELECTRON_RUN_AS_NODE` in the same PowerShell command before every Playwright invocation.
- Every cross-cutting guard is falsified before it is trusted. Revert each deliberate break immediately after observing the named red assertion.

## Stable Cross-Slice Interfaces

Later search-efficiency and scoped-search plans consume these names unchanged:

```ts
// src/shared/pathGlob.ts
export const DEFAULT_WORKSPACE_EXCLUDES: readonly string[]
export function normalizePathGlobs(patterns: string[]): string[]
export function compilePathGlobs(patterns: string[]): {
  matches(relativePath: string): boolean
  prunes(relativeDir: string): boolean
}

// src/shared/types.ts
export interface WorkspaceFilter {
  showAll: boolean
  excludePatterns: string[]
}

// src/main/fsService.ts
export interface WalkFilesOptions { maxFiles?: number }
export function readDir(root: string, path: string, filter: WorkspaceFilter): Promise<DirEntry[]>
export function walkFiles(root: string, filter: WorkspaceFilter, internalOptions?: WalkFilesOptions): Promise<WalkResult>
```

`SearchRequest.filter: WorkspaceFilter` replaces `SearchRequest.showAll`. The cancellation slice may extend `WalkFilesOptions` with an injected cancellation predicate, but it must not change the positional `root, filter, internalOptions?` contract.

## File Structure

| File | Responsibility | Change |
|---|---|---|
| `src/shared/pathGlob.ts` | Defaults, normalization, limited glob compilation, subtree-pruning decision | Create |
| `src/shared/types.ts` | `WorkspaceFilter`, persisted `workspaceExcludes`, updated search/directory API contracts | Modify |
| `src/main/settingsStore.ts` | Corrupt-safe normalization of old/new exclusion settings | Modify |
| `src/main/fsService.ts` | Root-relative filter application in lazy reads and recursive walks | Modify |
| `src/main/searchService.ts` | Consume `SearchRequest.filter` through the shared walk | Modify |
| `src/main/ipc.ts` | Guarded root/path/filter directory handlers | Modify |
| `src/preload/index.ts` | Typed root/path/filter bridges | Modify |
| `src/renderer/fuzzy.ts` | Immutable candidate cache and bounded deterministic ranking | Modify |
| `src/renderer/quickOpen.ts` | Query cached candidates rather than raw paths | Modify |
| `src/renderer/refreshScheduler.ts` | Pure one-active/one-dirty generation scheduler | Create |
| `src/renderer/folderMode.ts` | Snapshot root/filter, coalesce refresh, publish current tree/index only | Modify |
| `src/renderer/settingsPanel.ts` | Folder exclusion textarea/help/restore-defaults UI | Modify |
| `src/renderer/main.ts` | Persist filter state and trigger immediate folder/search invalidation | Modify |
| `src/renderer/findInFiles.ts` | Send `WorkspaceFilter`; no scope or cancellation changes | Modify |
| `src/renderer/index.html` | Existing Settings visual language for exclusion editor | Modify |
| `tests/helpers/largeWorkspace.ts` | Deterministic disk fixture shared by benchmark and smoke | Create |
| `vitest.benchmark.config.ts` | Isolate expensive local benchmark from `npm test` | Create |
| `tests/benchmark/workspaceResponsiveness.test.ts` | Walk/refresh/query timing plus reference checksum | Create |
| `tests/unit/pathGlob.test.ts` | Glob contract | Create |
| `tests/unit/refreshScheduler.test.ts` | Coalescing, invalidation, failure completion | Create |
| `tests/unit/fuzzy.test.ts` | Cache and bounded/full-sort equivalence | Modify |
| `tests/unit/fsService.test.ts` | Root-aware exclusions and Show All bypass | Modify |
| `tests/unit/settingsStore.test.ts` | Defaults, legacy migration, normalization | Modify |
| `tests/smoke/workspace-responsiveness.spec.ts` | Settings refresh, Show All bypass, 20k Quick Open | Create |
| `package.json` | `benchmark:workspace` command | Modify |

---

### Task 1: Shared limited-glob contract and persisted defaults

**Files:**
- Create: `src/shared/pathGlob.ts`
- Modify: `src/shared/types.ts` (`WorkspaceFilter`, `Settings`, `DEFAULT_SETTINGS`)
- Modify: `src/main/settingsStore.ts`
- Create: `tests/unit/pathGlob.test.ts`
- Modify: `tests/unit/settingsStore.test.ts`

**Interfaces:**
- Consumes: persisted `SettingsStore` merge/atomic-write behavior.
- Produces: `DEFAULT_WORKSPACE_EXCLUDES`, `normalizePathGlobs()`, `compilePathGlobs()`, `WorkspaceFilter`, and `Settings.workspaceExcludes`. Task 2 moves search to the filter; Task 5 atomically migrates the directory bridge and its renderer caller.

- [ ] **Step 1: Write the failing glob tests**

Create `tests/unit/pathGlob.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_WORKSPACE_EXCLUDES,
  compilePathGlobs,
  normalizePathGlobs,
} from '../../src/shared/pathGlob'

describe('normalizePathGlobs', () => {
  it('removes blanks/leading slashes, normalizes separators, and folds duplicates', () => {
    expect(normalizePathGlobs([
      '', ' /src\\**\\*.ts ', 'SRC/**/*.TS', '/dist/**', 'dist/**',
    ])).toEqual(['src/**/*.ts', 'dist/**'])
  })

  it('exposes the exact product defaults', () => {
    expect(DEFAULT_WORKSPACE_EXCLUDES).toEqual([
      '**/.git/**', '**/node_modules/**', '**/dist/**',
      '**/out/**', '**/build/**', '**/coverage/**',
    ])
  })
})

describe('compilePathGlobs', () => {
  it('keeps star and question mark inside one path segment', () => {
    const glob = compilePathGlobs(['src/*.ts', 'notes/file?.md'])
    expect(glob.matches('src/a.ts')).toBe(true)
    expect(glob.matches('src/deep/a.ts')).toBe(false)
    expect(glob.matches('notes/file1.md')).toBe(true)
    expect(glob.matches('notes/file10.md')).toBe(false)
  })

  it('gives globstar zero-segment and deep-segment semantics', () => {
    const glob = compilePathGlobs(['src/**/*.ts'])
    expect(glob.matches('src/a.ts')).toBe(true)
    expect(glob.matches('src/lib/a.ts')).toBe(true)
    expect(glob.matches('src/lib/deep/a.ts')).toBe(true)
    expect(glob.matches('other/a.ts')).toBe(false)
  })

  it('matches terminal globstar at the directory node and prunes its subtree', () => {
    const glob = compilePathGlobs(['**/node_modules/**'])
    expect(glob.matches('node_modules')).toBe(true)
    expect(glob.prunes('node_modules')).toBe(true)
    expect(glob.prunes('packages/app/node_modules')).toBe(true)
    expect(glob.matches('packages/app/node_modules/pkg/index.js')).toBe(true)
    expect(glob.prunes('packages/app/src')).toBe(false)
  })

  it('treats braces, classes, negation, and backslash escape syntax literally', () => {
    const glob = compilePathGlobs(['{src,test}/**', '[ab].ts', '!secret/**', 'literal\\*.ts'])
    expect(glob.matches('src/a.ts')).toBe(false)
    expect(glob.matches('a.ts')).toBe(false)
    expect(glob.matches('secret/a.ts')).toBe(false)
    expect(glob.matches('!secret/a.ts')).toBe(true)
    expect(glob.matches('literal/name.ts')).toBe(true) // backslash normalized as a separator
  })

  it('matches Windows paths and casing consistently', () => {
    const glob = compilePathGlobs(['SRC/**/GENERATED?.TS'])
    expect(glob.matches('src\\generated1.ts')).toBe(true)
    expect(glob.matches('Src\\deep\\GeneratedA.ts')).toBe(true)
  })
})
```

- [ ] **Step 2: Run the glob test and verify red**

Run: `npm test -- pathGlob`

Expected: FAIL because `src/shared/pathGlob.ts` cannot be resolved.

- [ ] **Step 3: Implement the shared matcher**

Create `src/shared/pathGlob.ts`:

```ts
export const DEFAULT_WORKSPACE_EXCLUDES = [
  '**/.git/**',
  '**/node_modules/**',
  '**/dist/**',
  '**/out/**',
  '**/build/**',
  '**/coverage/**',
] as const

function normalizePath(value: string): string {
  return value.trim()
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .replace(/\/{2,}/g, '/')
    .replace(/\/+$/, '')
}

export function normalizePathGlobs(patterns: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const value of patterns) {
    const pattern = normalizePath(value)
    if (!pattern) continue
    const key = pattern.toLocaleLowerCase('en-US')
    if (seen.has(key)) continue
    seen.add(key)
    out.push(pattern)
  }
  return out
}

function segmentMatcher(segment: string): RegExp {
  let source = '^'
  for (const char of segment) {
    if (char === '*') source += '[^/]*'
    else if (char === '?') source += '[^/]'
    else source += char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  }
  return new RegExp(source + '$', 'i')
}

interface CompiledPattern {
  segments: Array<'**' | RegExp>
  terminalGlobStar: boolean
}

function matchesSegments(pattern: CompiledPattern, path: string): boolean {
  const segments = normalizePath(path).split('/').filter(Boolean)
  const memo = new Map<string, boolean>()
  const visit = (patternIndex: number, pathIndex: number): boolean => {
    const key = `${patternIndex}:${pathIndex}`
    const known = memo.get(key)
    if (known !== undefined) return known
    const part = pattern.segments[patternIndex]
    let result: boolean
    if (part === undefined) result = pathIndex === segments.length
    else if (part === '**') {
      result = visit(patternIndex + 1, pathIndex) ||
        (pathIndex < segments.length && visit(patternIndex, pathIndex + 1))
    } else {
      result = pathIndex < segments.length && part.test(segments[pathIndex]) &&
        visit(patternIndex + 1, pathIndex + 1)
    }
    memo.set(key, result)
    return result
  }
  return visit(0, 0)
}

export function compilePathGlobs(patterns: string[]): {
  matches(relativePath: string): boolean
  prunes(relativeDir: string): boolean
} {
  const compiled: CompiledPattern[] = normalizePathGlobs(patterns).map(pattern => {
    const raw = pattern.split('/')
    return {
      segments: raw.map(segment => segment === '**' ? '**' : segmentMatcher(segment)),
      terminalGlobStar: raw.at(-1) === '**',
    }
  })
  return {
    matches: relativePath => compiled.some(pattern => matchesSegments(pattern, relativePath)),
    prunes: relativeDir => compiled.some(pattern =>
      pattern.terminalGlobStar && matchesSegments(pattern, relativeDir)),
  }
}
```

- [ ] **Step 4: Add the shared settings/filter types**

In `src/shared/types.ts`, import the default near the top and add the filter interface:

```ts
import { DEFAULT_WORKSPACE_EXCLUDES } from './pathGlob'

export interface WorkspaceFilter {
  showAll: boolean
  excludePatterns: string[]
}

```

Add `workspaceExcludes: string[]` immediately after `showAllFiles` in `Settings` and add this default immediately after `showAllFiles: false`:

```ts
  workspaceExcludes: string[]

  workspaceExcludes: [...DEFAULT_WORKSPACE_EXCLUDES],

```

- [ ] **Step 5: Write failing settings migration tests**

Append to `tests/unit/settingsStore.test.ts`:

```ts
  it('defaults workspace exclusions for a settings file written before the field existed', async () => {
    writeFileSync(join(dir, 'settings.json'), JSON.stringify({ themeId: 'nord' }))
    const settings = await new SettingsStore(dir).load()
    expect(settings.workspaceExcludes).toEqual(DEFAULT_SETTINGS.workspaceExcludes)
    expect(settings.workspaceExcludes).not.toBe(DEFAULT_SETTINGS.workspaceExcludes)
  })

  it('normalizes persisted workspace exclusions and permits an empty list', async () => {
    const store = new SettingsStore(dir)
    await store.update({ workspaceExcludes: [' /SRC\\** ', 'src/**', '', '/dist/**'] })
    expect((await store.load()).workspaceExcludes).toEqual(['SRC/**', 'dist/**'])
    await store.update({ workspaceExcludes: [] })
    expect((await store.load()).workspaceExcludes).toEqual([])
  })

  it('falls back to defaults when workspaceExcludes has the wrong persisted type', async () => {
    writeFileSync(join(dir, 'settings.json'), JSON.stringify({ workspaceExcludes: 'dist/**' }))
    expect((await new SettingsStore(dir).load()).workspaceExcludes)
      .toEqual(DEFAULT_SETTINGS.workspaceExcludes)
  })
```

Run: `npm test -- settingsStore`

Expected: FAIL because legacy loads share the default array and invalid/duplicate values are not normalized.

- [ ] **Step 6: Normalize settings at the store boundary**

In `src/main/settingsStore.ts`, import `normalizePathGlobs` and route `load`, `save`, and `update` through this helper:

```ts
import { normalizePathGlobs } from '../shared/pathGlob'

function normalizeSettings(value: unknown): Settings {
  const stored = value && typeof value === 'object' ? value as Partial<Settings> : {}
  const rawExcludes = Array.isArray(stored.workspaceExcludes)
    ? stored.workspaceExcludes.filter((item): item is string => typeof item === 'string')
    : DEFAULT_SETTINGS.workspaceExcludes
  return {
    ...DEFAULT_SETTINGS,
    ...stored,
    workspaceExcludes: normalizePathGlobs(rawExcludes),
  }
}
```

Use `normalizeSettings(JSON.parse(raw))` in `load()`, `normalizeSettings(undefined)` in its catch, `normalizeSettings(s)` before `atomicWrite` in `save()`, and `normalizeSettings({ ...(await this.load()), ...partial })` in `update()`.

- [ ] **Step 7: Run, falsify, and commit**

Run: `npm test -- pathGlob settingsStore`

Expected: PASS.

Falsify zero-segment `**`: temporarily remove `visit(patternIndex + 1, pathIndex)` from the globstar branch. Run `npm test -- pathGlob`. Expected: RED because `src/**/*.ts` no longer matches `src/a.ts`. Revert and rerun to PASS.

Run: `npm run typecheck`

Expected: PASS; Task 1 adds settings data without changing any active call signature.

Commit:

```powershell
git add src/shared/pathGlob.ts src/shared/types.ts src/main/settingsStore.ts tests/unit/pathGlob.test.ts tests/unit/settingsStore.test.ts
git commit -m "feat(workspace): define shared exclusion contract"
```

---

### Task 2: Root-aware traversal and disk-search integration

**Files:**
- Modify: `src/main/fsService.ts`
- Modify: `src/main/searchService.ts`
- Modify: `src/main/ipc.ts` (temporary compatibility adapter)
- Modify: `src/shared/types.ts` (`SearchRequest.filter`)
- Modify: `src/renderer/findInFiles.ts`
- Modify: `src/renderer/main.ts`
- Modify: `tests/unit/fsService.test.ts`
- Modify: `tests/unit/searchService.test.ts`

**Interfaces:**
- Consumes: `WorkspaceFilter`, `compilePathGlobs()`, and the new `Api` methods from Task 1.
- Produces: `WalkFilesOptions { maxFiles?: number }`, main-service `readDir(root, path, filter)`, and `walkFiles(root, filter, internalOptions?)`. `SearchRequest.filter` is honored for disk search without adding scope fields or cancellation. The existing directory IPC adapter remains temporarily compatible until Task 5 can migrate all three bridge layers and `FolderMode` in one green commit.

- [ ] **Step 1: Replace the old ignore-set tests with root-relative filter tests**

In `tests/unit/fsService.test.ts`, replace imports/usages of `shouldIgnore` and the old boolean signatures. Define:

```ts
import type { WorkspaceFilter } from '../../src/shared/types'

const DEFAULT_FILTER: WorkspaceFilter = {
  showAll: false,
  excludePatterns: ['**/.git/**', '**/node_modules/**', '**/dist/**'],
}
```

Replace the `shouldIgnore` block and directory/walk assertions with:

```ts
describe('workspace filtering', () => {
  it('filters a lazy directory read relative to the workspace root', async () => {
    mkdirSync(join(dir, 'src')); mkdirSync(join(dir, 'dist'))
    writeFileSync(join(dir, 'keep.txt'), ''); writeFileSync(join(dir, 'drop.log'), '')
    const filter = { ...DEFAULT_FILTER, excludePatterns: ['dist/**', '*.log'] }
    expect((await readDir(dir, dir, filter)).map(entry => entry.name))
      .toEqual(['src', 'keep.txt'])
  })

  it('prunes excluded directory nodes before descending', async () => {
    mkdirSync(join(dir, 'packages', 'app', 'node_modules'), { recursive: true })
    mkdirSync(join(dir, 'packages', 'app', 'src'), { recursive: true })
    writeFileSync(join(dir, 'packages', 'app', 'node_modules', 'drop.js'), '')
    writeFileSync(join(dir, 'packages', 'app', 'src', 'keep.ts'), '')
    const result = await walkFiles(dir, DEFAULT_FILTER)
    expect(result.files).toEqual([join(dir, 'packages', 'app', 'src', 'keep.ts')])
    expect(result.truncated).toBe(false)
  })

  it('Show All bypasses the complete exclusion list', async () => {
    mkdirSync(join(dir, 'dist')); writeFileSync(join(dir, 'dist', 'visible.js'), '')
    const filter = { ...DEFAULT_FILTER, showAll: true }
    expect((await readDir(dir, dir, filter)).map(entry => entry.name)).toContain('dist')
    expect((await walkFiles(dir, filter)).files).toContain(join(dir, 'dist', 'visible.js'))
  })

  it('caps files without counting excluded entries as truncation', async () => {
    mkdirSync(join(dir, 'dist')); writeFileSync(join(dir, 'dist', 'ignored.js'), '')
    for (const name of ['a.txt', 'b.txt', 'c.txt']) writeFileSync(join(dir, name), '')
    const result = await walkFiles(dir, DEFAULT_FILTER, { maxFiles: 2 })
    expect(result.files).toHaveLength(2)
    expect(result.truncated).toBe(true)
  })
})
```

Run: `npm test -- fsService`

Expected: FAIL because the old functions accept `(path, showAll, max)` and only know two hard-coded directory names.

- [ ] **Step 2: Implement one compiled filter per call**

Replace the filtering portion of `src/main/fsService.ts` with:

```ts
import { promises as fs } from 'node:fs'
import { join, relative } from 'node:path'
import { compilePathGlobs } from '../shared/pathGlob'
import type { DirEntry, WalkResult, WorkspaceFilter } from '../shared/types'

const MAX_INDEX_FILES = 20000
export interface WalkFilesOptions { maxFiles?: number }

function matcherFor(filter: WorkspaceFilter): ReturnType<typeof compilePathGlobs> {
  return compilePathGlobs(filter.showAll ? [] : filter.excludePatterns)
}

function workspacePath(root: string, path: string): string {
  return relative(root, path).replace(/\\/g, '/')
}

export async function readDir(
  root: string,
  path: string,
  filter: WorkspaceFilter,
): Promise<DirEntry[]> {
  try {
    const matcher = matcherFor(filter)
    const entries = await fs.readdir(path, { withFileTypes: true })
    const out: DirEntry[] = []
    for (const entry of entries) {
      const absolutePath = join(path, entry.name)
      const relativePath = workspacePath(root, absolutePath)
      if (matcher.matches(relativePath) || (entry.isDirectory() && matcher.prunes(relativePath))) continue
      out.push({ name: entry.name, path: absolutePath, isDir: entry.isDirectory() })
    }
    out.sort((a, b) => a.isDir === b.isDir
      ? a.name.localeCompare(b.name)
      : a.isDir ? -1 : 1)
    return out
  } catch {
    return []
  }
}

export async function walkFiles(
  root: string,
  filter: WorkspaceFilter,
  internalOptions: WalkFilesOptions = {},
): Promise<WalkResult> {
  const matcher = matcherFor(filter)
  const maxFiles = internalOptions.maxFiles ?? MAX_INDEX_FILES
  const files: string[] = []
  let truncated = false
  async function walk(path: string): Promise<void> {
    let entries
    try { entries = await fs.readdir(path, { withFileTypes: true }) } catch { return }
    entries.sort((a, b) => a.name.localeCompare(b.name))
    for (const entry of entries) {
      const absolutePath = join(path, entry.name)
      const relativePath = workspacePath(root, absolutePath)
      if (matcher.matches(relativePath) || (entry.isDirectory() && matcher.prunes(relativePath))) continue
      if (files.length >= maxFiles) { truncated = true; return }
      if (entry.isDirectory()) await walk(absolutePath)
      else files.push(absolutePath)
      if (truncated) return
    }
  }
  await walk(root)
  return { files, truncated }
}
```

- [ ] **Step 3: Update disk search without changing search UX**

In `src/shared/types.ts`, replace `SearchRequest.showAll` with:

```ts
filter: WorkspaceFilter
```

Keep the current directory IPC signature buildable for this task by adapting it in `src/main/ipc.ts`:

```ts
handle('dir:read', (_e, path: string, showAll: boolean) =>
  readDir(path, path, { showAll, excludePatterns: [] }))
handle('dir:walk', (_e, root: string, showAll: boolean) =>
  walkFiles(root, { showAll, excludePatterns: [] }))
```

In `src/main/searchService.ts`, replace the walk call with:

```ts
const walk = await walkFiles(req.root, req.filter)
```

In `src/renderer/findInFiles.ts`, change `FindInFilesDeps.showAll` to:

```ts
filter: () => WorkspaceFilter
```

and send `filter: this.d.filter()` in `SearchRequest`. In `src/renderer/main.ts`, temporarily wire the current state until Task 5 adds the persisted list:

```ts
filter: () => ({ showAll: showAllFiles, excludePatterns: [] }),
```

Update `tests/unit/searchService.test.ts` request factories from `showAll: false` to:

```ts
filter: { showAll: false, excludePatterns: ['**/dist/**'] },
```

Add a search-service assertion that a matching file under `dist` is absent with the filter and present with `{ showAll: true, excludePatterns: ['**/dist/**'] }`.

- [ ] **Step 4: Run, falsify Show All, and commit**

Run: `npm test -- pathGlob fsService searchService`

Expected: PASS.

Run: `npm run typecheck`

Expected: PASS; the temporary IPC adapter keeps `FolderMode` buildable while disk search already consumes the real filter.

Falsify Show All: temporarily change `matcherFor` to always compile `filter.excludePatterns`. Run `npm test -- fsService searchService`. Expected: RED in both Show All assertions because `dist/visible.js` stays excluded. Revert and rerun to PASS.

Commit:

```powershell
git add src/shared/types.ts src/main/fsService.ts src/main/searchService.ts src/main/ipc.ts src/renderer/findInFiles.ts src/renderer/main.ts tests/unit/fsService.test.ts tests/unit/searchService.test.ts
git commit -m "feat(workspace): apply exclusions across filesystem traversal"
```

---

### Task 3: Immutable Quick Open candidates and bounded top-50 ranking

**Files:**
- Modify: `src/renderer/fuzzy.ts`
- Modify: `src/renderer/quickOpen.ts`
- Modify: `src/renderer/folderMode.ts` (candidate-only bridge; refresh rewrite remains Task 5)
- Modify: `tests/unit/fuzzy.test.ts`

**Interfaces:**
- Consumes: a workspace root and absolute file paths from `walkFiles`.
- Produces: `QuickOpenCandidate`, `buildQuickOpenCandidates(root, files)`, and `rankFileCandidates(query, candidates, limit?)`. `QuickOpenDeps.candidates()` replaces `files()`.

- [ ] **Step 1: Write cache and bounded-equivalence tests**

Replace the `rankFiles` tests in `tests/unit/fuzzy.test.ts` with:

```ts
import {
  buildQuickOpenCandidates,
  fuzzyMatch,
  rankFileCandidates,
  rankFileCandidatesReference,
} from '../../src/renderer/fuzzy'

describe('Quick Open candidates', () => {
  const files = ['C:\\p\\src\\main.ts', 'C:\\p\\src\\manager.ts', 'C:\\p\\readme.md']
  const candidates = buildQuickOpenCandidates('C:\\p', files)

  it('caches display and normalized name/path once per index generation', () => {
    expect(candidates[0]).toEqual({
      path: 'C:\\p\\src\\main.ts',
      name: 'main.ts',
      lowerName: 'main.ts',
      lowerRelativePath: 'src/main.ts',
    })
  })

  it('prefers filename matches but can find a relative-path match', () => {
    expect(rankFileCandidates('main', candidates)[0].name).toBe('main.ts')
    expect(rankFileCandidates('src', candidates).map(item => item.name))
      .toEqual(['main.ts', 'manager.ts'])
  })

  it('is deterministic when enumeration order changes', () => {
    const forward = rankFileCandidates('m', candidates).map(item => item.path)
    const reverse = rankFileCandidates('m', [...candidates].reverse()).map(item => item.path)
    expect(reverse).toEqual(forward)
  })

  it('bounded top 50 equals the first 50 of a full reference ordering', () => {
    const many = buildQuickOpenCandidates('C:\\p', Array.from({ length: 20_000 }, (_, index) =>
      `C:\\p\\pkg-${String(index % 200).padStart(3, '0')}\\file-${String(index).padStart(5, '0')}.ts`))
    const bounded = rankFileCandidates('f19', many, 50).map(item => item.path)
    const reference = rankFileCandidatesReference('f19', many, 50).map(item => item.path)
    expect(bounded).toEqual(reference)
  })
})
```

Run: `npm test -- fuzzy`

Expected: FAIL because the candidate builder/ranker exports do not exist.

- [ ] **Step 2: Implement the cached candidate shape and bounded insertion**

In `src/renderer/fuzzy.ts`, move the current scoring loop into a normalized helper so candidate strings are not lowercased again on every query, retain the public `fuzzyMatch` contract, and replace raw-file ranking with:

```ts
function fuzzyMatchNormalized(query: string, text: string): number | null {
  if (!query) return 0
  let queryIndex = 0
  let score = 0
  let previous = -1
  for (let textIndex = 0; textIndex < text.length && queryIndex < query.length; textIndex++) {
    if (text[textIndex] === query[queryIndex]) {
      score += textIndex === previous + 1 ? 2 : 1
      if (textIndex < 10) score += 1
      previous = textIndex
      queryIndex++
    }
  }
  return queryIndex === query.length ? score : null
}

export function fuzzyMatch(query: string, text: string): number | null {
  return fuzzyMatchNormalized(
    query.toLocaleLowerCase('en-US'),
    text.toLocaleLowerCase('en-US'),
  )
}

export interface QuickOpenCandidate {
  path: string
  name: string
  lowerName: string
  lowerRelativePath: string
}

export interface RankedFile extends QuickOpenCandidate { score: number }

function normalizedPath(path: string): string { return path.replace(/\\/g, '/') }

export function buildQuickOpenCandidates(root: string, files: string[]): QuickOpenCandidate[] {
  const normalizedRoot = normalizedPath(root).replace(/\/+$/, '')
  const rootKey = normalizedRoot.toLocaleLowerCase('en-US') + '/'
  return files.map(path => {
    const absolute = normalizedPath(path)
    const absoluteKey = absolute.toLocaleLowerCase('en-US')
    const relativePath = absoluteKey.startsWith(rootKey)
      ? absolute.slice(normalizedRoot.length + 1)
      : absolute.split('/').at(-1) ?? absolute
    const name = relativePath.split('/').at(-1) ?? relativePath
    return {
      path,
      name,
      lowerName: name.toLocaleLowerCase('en-US'),
      lowerRelativePath: relativePath.toLocaleLowerCase('en-US'),
    }
  })
}

interface ScoredCandidate extends RankedFile {
  filenameMatch: boolean
  relativeScore: number
}

function compareRank(a: ScoredCandidate, b: ScoredCandidate): number {
  return Number(b.filenameMatch) - Number(a.filenameMatch) ||
    b.score - a.score || b.relativeScore - a.relativeScore ||
    a.name.length - b.name.length || a.lowerName.localeCompare(b.lowerName) ||
    a.lowerRelativePath.localeCompare(b.lowerRelativePath) || a.path.localeCompare(b.path)
}

export function rankFileCandidates(
  query: string,
  candidates: readonly QuickOpenCandidate[],
  limit = 50,
): RankedFile[] {
  if (limit <= 0) return []
  const normalizedQuery = query.toLocaleLowerCase('en-US')
  const best: ScoredCandidate[] = []
  for (const candidate of candidates) {
    const nameScore = fuzzyMatchNormalized(normalizedQuery, candidate.lowerName)
    const pathScore = fuzzyMatchNormalized(normalizedQuery, candidate.lowerRelativePath)
    if (nameScore === null && pathScore === null) continue
    const ranked: ScoredCandidate = {
      ...candidate,
      filenameMatch: nameScore !== null,
      score: nameScore ?? pathScore!,
      relativeScore: pathScore ?? -1,
    }
    let index = 0
    while (index < best.length && compareRank(best[index], ranked) <= 0) index++
    if (index < limit) best.splice(index, 0, ranked)
    if (best.length > limit) best.pop()
  }
  return best.map(({ filenameMatch: _filenameMatch, relativeScore: _relativeScore, ...item }) => item)
}

/** Full-sort oracle used only by correctness tests and the local benchmark. */
export function rankFileCandidatesReference(
  query: string,
  candidates: readonly QuickOpenCandidate[],
  limit = 50,
): RankedFile[] {
  const normalizedQuery = query.toLocaleLowerCase('en-US')
  const scored: ScoredCandidate[] = []
  for (const candidate of candidates) {
    const nameScore = fuzzyMatchNormalized(normalizedQuery, candidate.lowerName)
    const pathScore = fuzzyMatchNormalized(normalizedQuery, candidate.lowerRelativePath)
    if (nameScore === null && pathScore === null) continue
    scored.push({
      ...candidate,
      filenameMatch: nameScore !== null,
      score: nameScore ?? pathScore!,
      relativeScore: pathScore ?? -1,
    })
  }
  scored.sort(compareRank)
  return scored.slice(0, limit)
    .map(({ filenameMatch: _filenameMatch, relativeScore: _relativeScore, ...item }) => item)
}
```

The product ranker never retains more than 50. The full-sort oracle is never called by renderer UI code.

- [ ] **Step 3: Query candidates in `QuickOpen`**

In `src/renderer/quickOpen.ts`, import `QuickOpenCandidate` and `rankFileCandidates`, change the dependency, and update `refresh()`:

```ts
export interface QuickOpenDeps {
  candidates: () => readonly QuickOpenCandidate[]
  truncated: () => boolean
  openFile: (path: string) => void
}

private refresh(): void {
  this.results = rankFileCandidates(this.input.value, this.d.candidates(), 50)
    .map(result => result.path)
  this.active = 0
  this.renderList()
}
```

In `src/renderer/folderMode.ts`, make the minimal candidate-only migration needed to keep this task buildable:

```ts
private index: QuickOpenCandidate[] = []

// QuickOpen constructor dependency
candidates: () => this.index,

private async reindex(): Promise<void> {
  const root = this.model.root
  if (!root) return
  const result = await window.api.walkFiles(root, this.showAll)
  if (this.model.root !== root) return
  this.index = buildQuickOpenCandidates(root, result.files)
  this.indexTruncated = result.truncated
}
```

Import `buildQuickOpenCandidates` and `QuickOpenCandidate`. Task 5 later replaces the refresh lifecycle, not this candidate contract.

- [ ] **Step 4: Run, falsify bounded ordering, and commit**

Run: `npm test -- fuzzy`

Expected: PASS.

Run: `npm run build`

Expected: PASS with `FolderMode` and `QuickOpenDeps` on the same candidate interface.

Falsify the bounded guard: temporarily return the first 50 matching candidates rather than inserting by `compareRank`. Run `npm test -- fuzzy`. Expected: RED at `bounded top 50 equals the first 50 of a full reference ordering`. Revert and rerun to PASS.

Commit:

```powershell
git add src/renderer/fuzzy.ts src/renderer/quickOpen.ts src/renderer/folderMode.ts tests/unit/fuzzy.test.ts
git commit -m "perf(quick-open): cache candidates and bound ranking"
```

---

### Task 4: One-active/one-dirty generation scheduler

**Files:**
- Create: `src/renderer/refreshScheduler.ts`
- Create: `tests/unit/refreshScheduler.test.ts`

**Interfaces:**
- Consumes: injected synchronous snapshot and asynchronous refresh function.
- Produces: `RefreshScheduler<T>` with `request(): Promise<void>`, `invalidate(): void`, and `whenIdle(): Promise<void>`. Each run receives `{ snapshot, isCurrent }`.

- [ ] **Step 1: Write scheduler tests with controlled promises**

Create `tests/unit/refreshScheduler.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'
import { RefreshScheduler, type RefreshRun } from '../../src/renderer/refreshScheduler'

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void
  return { promise: new Promise<void>(done => { resolve = done }), resolve }
}

describe('RefreshScheduler', () => {
  it('runs one active job and exactly one follow-up with the newest snapshot', async () => {
    let snapshot = 'root-a:first'
    const first = deferred(); const second = deferred()
    const runs: RefreshRun<string>[] = []
    const scheduler = new RefreshScheduler(() => snapshot, async run => {
      runs.push(run)
      await (runs.length === 1 ? first.promise : second.promise)
    })
    void scheduler.request()
    snapshot = 'root-a:second'; void scheduler.request()
    snapshot = 'root-a:newest'; const idle = scheduler.request()
    expect(runs).toHaveLength(1)
    expect(runs[0].snapshot).toBe('root-a:first')
    expect(runs[0].isCurrent()).toBe(false)
    first.resolve()
    await vi.waitFor(() => expect(runs).toHaveLength(2))
    expect(runs[1].snapshot).toBe('root-a:newest')
    second.resolve(); await idle
    expect(runs).toHaveLength(2)
  })

  it('invalidates an active completion without scheduling another run', async () => {
    const gate = deferred()
    let current!: () => boolean
    const scheduler = new RefreshScheduler(() => 'root-a', async run => {
      current = run.isCurrent; await gate.promise
    })
    const idle = scheduler.request()
    scheduler.invalidate()
    expect(current()).toBe(false)
    gate.resolve(); await idle
  })

  it('continues with the dirty follow-up after a failed run', async () => {
    let value = 1
    const error = vi.fn()
    const seen: number[] = []
    const gate = deferred()
    const scheduler = new RefreshScheduler(() => value, async run => {
      seen.push(run.snapshot)
      if (run.snapshot === 1) { await gate.promise; throw new Error('walk failed') }
    }, error)
    void scheduler.request()
    value = 2; const idle = scheduler.request()
    gate.resolve(); await idle
    expect(seen).toEqual([1, 2])
    expect(error).toHaveBeenCalledOnce()
  })
})
```

Run: `npm test -- refreshScheduler`

Expected: FAIL because the module does not exist.

- [ ] **Step 2: Implement the scheduler**

Create `src/renderer/refreshScheduler.ts`:

```ts
export interface RefreshRun<T> {
  snapshot: T
  isCurrent: () => boolean
}

export class RefreshScheduler<T> {
  private generation = 0
  private running = false
  private dirty = false
  private waiters: Array<() => void> = []

  constructor(
    private snapshot: () => T,
    private run: (run: RefreshRun<T>) => Promise<void>,
    private onError: (error: unknown) => void = error => console.error('workspace refresh failed', error),
  ) {}

  request(): Promise<void> {
    this.generation++
    this.dirty = true
    void this.drain()
    return this.whenIdle()
  }

  invalidate(): void {
    this.generation++
    this.dirty = false
    if (!this.running) this.resolveWaiters()
  }

  whenIdle(): Promise<void> {
    if (!this.running && !this.dirty) return Promise.resolve()
    return new Promise(resolve => this.waiters.push(resolve))
  }

  private async drain(): Promise<void> {
    if (this.running) return
    this.running = true
    try {
      while (this.dirty) {
        this.dirty = false
        const generation = this.generation
        const snapshot = this.snapshot()
        try {
          await this.run({ snapshot, isCurrent: () => generation === this.generation })
        } catch (error) {
          this.onError(error)
        }
      }
    } finally {
      this.running = false
      if (this.dirty) void this.drain()
      else this.resolveWaiters()
    }
  }

  private resolveWaiters(): void {
    const waiters = this.waiters.splice(0)
    for (const resolve of waiters) resolve()
  }
}
```

- [ ] **Step 3: Run, falsify overlap protection, and commit**

Run: `npm test -- refreshScheduler`

Expected: PASS.

Falsify coalescing: temporarily remove the `if (this.running) return` guard. Run `npm test -- refreshScheduler`. Expected: RED because the first test observes overlapping runs instead of one active run. Revert and rerun to PASS.

Commit:

```powershell
git add src/renderer/refreshScheduler.ts tests/unit/refreshScheduler.test.ts
git commit -m "feat(workspace): coalesce folder refresh generations"
```

---

### Task 5: Folder controller, Settings UI, and immediate invalidation wiring

**Files:**
- Modify: `src/shared/types.ts` (`Api.readDir`, `Api.walkFiles`)
- Modify: `src/main/ipc.ts` (replace Task 2 compatibility adapter)
- Modify: `src/preload/index.ts`
- Modify: `src/renderer/folderMode.ts`
- Modify: `src/renderer/settingsPanel.ts` (`SettingsDeps`, `renderFolder`)
- Modify: `src/renderer/main.ts` (state, Settings wiring, folder/search filter)
- Modify: `src/renderer/index.html` (Settings exclusion controls)

**Interfaces:**
- Consumes: `WorkspaceFilter`, `buildQuickOpenCandidates`, `QuickOpenCandidate`, `RefreshScheduler`, and Task 2 directory APIs.
- Produces: `FolderModeDeps.filter(): WorkspaceFilter` and `FolderMode.workspaceSettingsChanged(): Promise<void>`. All watcher events and local file operations request the same scheduler.

- [ ] **Step 1: Atomically migrate the directory bridge to the stable contract**

In `Api` in `src/shared/types.ts`:

```ts
readDir(root: string, path: string, filter: WorkspaceFilter): Promise<DirEntry[]>
walkFiles(root: string, filter: WorkspaceFilter): Promise<WalkResult>
```

Replace Task 2's compatibility handlers in `src/main/ipc.ts` and add `WorkspaceFilter` to its shared type import:

```ts
handle('dir:read', (_e, root: string, path: string, filter: WorkspaceFilter) =>
  readDir(root, path, filter))
handle('dir:walk', (_e, root: string, filter: WorkspaceFilter) => walkFiles(root, filter))
```

In `src/preload/index.ts`:

```ts
readDir: (root, path, filter) => ipcRenderer.invoke('dir:read', root, path, filter),
walkFiles: (root, filter) => ipcRenderer.invoke('dir:walk', root, filter),
```

- [ ] **Step 2: Convert `FolderMode` to filter snapshots and cached candidates**

In `src/renderer/folderMode.ts`, add imports and update the dependency/state declarations:

```ts
import type { DirEntry, WorkspaceFilter } from '../shared/types'
import { buildQuickOpenCandidates, type QuickOpenCandidate } from './fuzzy'
import { RefreshScheduler } from './refreshScheduler'

export interface FolderModeDeps {
  sidebarEl: HTMLElement
  mainEl: HTMLElement
  openFile: (path: string) => void
  activePath: () => string | null
  pickFolder: () => Promise<void>
  filter: () => WorkspaceFilter
}

interface FolderRefreshSnapshot {
  root: string | null
  filter: WorkspaceFilter
  directories: string[]
}

private index: QuickOpenCandidate[] = []
private indexTruncated = false
private refresh = new RefreshScheduler(
  () => this.refreshSnapshot(),
  run => this.runRefresh(run.snapshot, run.isCurrent),
)
```

Construct `QuickOpen` with `candidates: () => this.index`. Remove `private showAll` and all direct assignment from `loadSettings()`.

Add these methods:

```ts
private refreshSnapshot(): FolderRefreshSnapshot {
  const root = this.model.root
  const filter = this.d.filter()
  return {
    root,
    filter: { showAll: filter.showAll, excludePatterns: [...filter.excludePatterns] },
    directories: root ? [root, ...this.model.expandedPaths()] : [],
  }
}

private async runRefresh(
  snapshot: FolderRefreshSnapshot,
  isCurrent: () => boolean,
): Promise<void> {
  if (!snapshot.root) return
  const walk = await window.api.walkFiles(snapshot.root, snapshot.filter)
  const children: DirEntry[][] = []
  for (const path of snapshot.directories) {
    if (!isCurrent()) return
    children.push(await window.api.readDir(snapshot.root, path, snapshot.filter))
  }
  if (!isCurrent() || this.model.root !== snapshot.root) return
  snapshot.directories.forEach((path, index) => this.model.setChildren(path, children[index]))
  this.index = buildQuickOpenCandidates(snapshot.root, walk.files)
  this.indexTruncated = walk.truncated
  this.sidebar.render()
}

private async loadChildren(path: string): Promise<void> {
  const root = this.model.root
  if (!root) return
  const filter = this.d.filter()
  const children = await window.api.readDir(root, path, filter)
  const current = this.d.filter()
  if (this.model.root !== root || current.showAll !== filter.showAll ||
      current.excludePatterns.join('\n') !== filter.excludePatterns.join('\n')) return
  this.model.setChildren(path, children)
}

workspaceSettingsChanged(): Promise<void> {
  return this.refresh.request()
}
```

Keep this loop serial. The refresh scheduler coalesces invalidations, while serial directory reads impose a hard concurrency ceiling of one and avoid turning a deeply expanded tree into an unbounded burst of filesystem requests.

Update lifecycle paths:

```ts
// openFolder, after model.setRoot(root), watch/update/recents setup:
await this.refresh.request()

// closeFolder, before renderSidebar():
this.refresh.invalidate()
this.index = []
this.indexTruncated = false

// watcher callback:
private onDiskChange(): Promise<void> { return this.refresh.request() }

// create/rename/delete refresh path:
private refreshDir(_dir: string): Promise<void> { return this.refresh.request() }
```

Delete the old `reindex()` and multi-read `onDiskChange()` bodies. `openFolder()` may still load settings once for `sidebarWidth`; it must not derive the workspace filter there.

- [ ] **Step 3: Add the labelled Folder exclusion editor**

In `SettingsDeps` in `src/renderer/settingsPanel.ts`, add:

```ts
workspaceExcludes: () => string[]
setWorkspaceExcludes: (patterns: string[]) => Promise<void>
restoreWorkspaceExcludes: () => Promise<void>
```

In `renderFolder()`, retain both existing checkboxes and append:

```ts
const group = document.createElement('div'); group.className = 'settings-group workspace-excludes'
const label = document.createElement('label'); label.htmlFor = 'workspace-excludes'
label.textContent = 'Exclude from workspace'
const help = document.createElement('p'); help.id = 'workspace-excludes-help'
help.textContent = 'One workspace-relative pattern per line. * and ? stay within a folder; ** spans folders. Braces, character classes, !, and escapes are literal.'
const editor = document.createElement('textarea'); editor.id = 'workspace-excludes'
editor.rows = 8
editor.value = this.d.workspaceExcludes().join('\n')
editor.setAttribute('aria-describedby', help.id)
editor.onchange = () => {
  void this.d.setWorkspaceExcludes(editor.value.split(/\r?\n/)).then(() => this.render())
}
const restore = document.createElement('button'); restore.type = 'button'
restore.className = 'workspace-excludes-restore'
restore.textContent = 'Restore defaults'
restore.onclick = () => void this.d.restoreWorkspaceExcludes().then(() => this.render())
group.append(label, help, editor, restore)
wrap.append(group)
```

The accessible Settings slice may have refactored category/tab markup before this plan executes; attach this group to the resulting Folder panel without reverting those semantics.

In `src/renderer/index.html`, add:

```css
.workspace-excludes{display:flex;flex-direction:column;align-items:flex-start;gap:6px}
.workspace-excludes label{font-size:13px}
.workspace-excludes p{margin:0;color:var(--muted);font-size:12px;line-height:1.4}
.workspace-excludes textarea{width:100%;min-height:128px;resize:vertical;font:12px/1.45 var(--editor-font,monospace)}
.workspace-excludes-restore{font-size:12px;padding:4px 10px;border:1px solid var(--border);border-radius:var(--radius);background:var(--bar);color:var(--panel-text);cursor:pointer}
.workspace-excludes-restore:hover{background:var(--bar-hover)}
```

Add `.workspace-excludes-restore:focus-visible` to the existing chrome focus-ring selector and `.workspace-excludes-restore` to the existing micro-motion selector.

- [ ] **Step 4: Persist one renderer filter state and refresh immediately**

In `src/renderer/main.ts`, import `DEFAULT_WORKSPACE_EXCLUDES`, `normalizePathGlobs`, and `WorkspaceFilter`. Add state beside `showAllFiles`:

```ts
let workspaceExcludes = [...DEFAULT_WORKSPACE_EXCLUDES]
const workspaceFilter = (): WorkspaceFilter => ({
  showAll: showAllFiles,
  excludePatterns: [...workspaceExcludes],
})
let folder!: FolderMode
```

In `boot()`, after assigning `showAllFiles`, assign:

```ts
workspaceExcludes = [...settings.workspaceExcludes]
```

Replace the Settings dependency handlers with:

```ts
showAllFiles: () => showAllFiles,
setShowAllFiles: async on => {
  const saved = await window.api.updateSettings({ showAllFiles: on })
  showAllFiles = saved.showAllFiles
  workspaceExcludes = [...saved.workspaceExcludes]
  await folder.workspaceSettingsChanged()
},
workspaceExcludes: () => [...workspaceExcludes],
setWorkspaceExcludes: async patterns => {
  const saved = await window.api.updateSettings({
    workspaceExcludes: normalizePathGlobs(patterns),
  })
  workspaceExcludes = [...saved.workspaceExcludes]
  await folder.workspaceSettingsChanged()
},
restoreWorkspaceExcludes: async () => {
  const saved = await window.api.updateSettings({
    workspaceExcludes: [...DEFAULT_WORKSPACE_EXCLUDES],
  })
  workspaceExcludes = [...saved.workspaceExcludes]
  await folder.workspaceSettingsChanged()
},
```

Change the existing FolderMode initialization from `const folder =` to `folder =`, add `filter: workspaceFilter`, and change Find in Files wiring to `filter: workspaceFilter`. Remove the temporary empty exclusion array from Task 2.

- [ ] **Step 5: Build and run focused unit tests**

Run: `npm run build`

Expected: PASS; the directory bridge, renderer caller, and shared API now use the final root/path/filter contract together.

Run: `npm test -- pathGlob settingsStore fsService fuzzy refreshScheduler searchService`

Expected: PASS.

- [ ] **Step 6: Commit the integrated controller/UI**

```powershell
git add src/shared/types.ts src/main/ipc.ts src/preload/index.ts src/renderer/folderMode.ts src/renderer/settingsPanel.ts src/renderer/main.ts src/renderer/index.html
git commit -m "feat(workspace): refresh folders when exclusions change"
```

---

### Task 6: Deterministic 20,000-file fixture and benchmark command

**Files:**
- Create: `tests/helpers/largeWorkspace.ts`
- Create: `vitest.benchmark.config.ts`
- Create: `tests/benchmark/workspaceResponsiveness.test.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: `walkFiles`, `buildQuickOpenCandidates`, and `rankFileCandidates`.
- Produces: `createLargeWorkspace(root, fileCount?)` and local `npm run benchmark:workspace`. The command reports timings and p95; only result/checksum correctness is automated.

- [ ] **Step 1: Create the deterministic fixture helper**

Create `tests/helpers/largeWorkspace.ts`:

```ts
import { mkdirSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'

export const LARGE_WORKSPACE_FILES = 20_000

export function createLargeWorkspace(root: string, fileCount = LARGE_WORKSPACE_FILES): void {
  for (let packageIndex = 0; packageIndex < Math.ceil(fileCount / 100); packageIndex++) {
    const packageName = `pkg-${String(packageIndex).padStart(3, '0')}`
    const src = join(root, 'packages', packageName, 'src')
    mkdirSync(src, { recursive: true })
    const start = packageIndex * 100
    const end = Math.min(fileCount, start + 100)
    for (let index = start; index < end; index++) {
      const name = index === 12_345 ? 'workspace-target.ts' : `file-${String(index).padStart(5, '0')}.ts`
      writeFileSync(join(src, name), `export const value${index} = ${index}\n`)
    }
  }
  const excluded = join(root, 'packages', 'pkg-000', 'dist')
  mkdirSync(excluded, { recursive: true })
  writeFileSync(join(excluded, 'excluded-target.ts'), 'export const excluded = true\n')
}
```

- [ ] **Step 2: Add the isolated benchmark configuration and measurement test**

Create `vitest.benchmark.config.ts`:

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/benchmark/**/*.test.ts'],
    testTimeout: 120_000,
  },
})
```

Create `tests/benchmark/workspaceResponsiveness.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { performance } from 'node:perf_hooks'
import { walkFiles } from '../../src/main/fsService'
import {
  buildQuickOpenCandidates,
  rankFileCandidates,
  rankFileCandidatesReference,
} from '../../src/renderer/fuzzy'
import { createLargeWorkspace, LARGE_WORKSPACE_FILES } from '../helpers/largeWorkspace'
import type { WorkspaceFilter } from '../../src/shared/types'

const FILTER: WorkspaceFilter = {
  showAll: false,
  excludePatterns: ['**/dist/**'],
}
const QUERIES = ['', 'workspace-target.ts', 'file-000', 'f199']
const EXPECTED_QUERY_CHECKSUMS = {
  '<empty>': 3928438448,
  'workspace-target.ts': 2838739514,
  'file-000': 3928438448,
  f199: 2369245466,
}
let root: string

function checksum(paths: string[]): number {
  let hash = 2166136261
  for (const path of paths) for (const char of path.replace(/\\/g, '/')) {
    hash ^= char.charCodeAt(0)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function percentile(values: number[], fraction: number): number {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))]
}

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'nc-workspace-benchmark-'))
  createLargeWorkspace(root)
})
afterAll(() => rmSync(root, { recursive: true, force: true }))

describe('20,000-file workspace benchmark', () => {
  it('records walk/index, watcher-style refresh, and correct bounded-query p95', async () => {
    const coldStart = performance.now()
    const coldWalk = await walkFiles(root, FILTER)
    const candidates = buildQuickOpenCandidates(root, coldWalk.files)
    const coldWalkIndexMs = performance.now() - coldStart
    expect(candidates).toHaveLength(LARGE_WORKSPACE_FILES)
    expect(coldWalk.files.some(path => path.includes('excluded-target.ts'))).toBe(false)

    const refreshStart = performance.now()
    const refreshWalk = await walkFiles(root, FILTER)
    buildQuickOpenCandidates(root, refreshWalk.files)
    const refreshMs = performance.now() - refreshStart

    const queryTimes: number[] = []
    const queryChecksums: Record<string, number> = {}
    const references = new Map(QUERIES.map(query => [
      query,
      rankFileCandidatesReference(query, candidates, 50).map(item => item.path),
    ]))
    for (let repetition = 0; repetition < 50; repetition++) {
      for (const query of QUERIES) {
        const start = performance.now()
        const bounded = rankFileCandidates(query, candidates, 50)
        queryTimes.push(performance.now() - start)
        expect(bounded.map(item => item.path)).toEqual(references.get(query))
        queryChecksums[query || '<empty>'] = checksum(
          bounded.map(item => relative(root, item.path).replace(/\\/g, '/')),
        )
      }
    }
    const p95QueryMs = percentile(queryTimes, 0.95)
    console.info(JSON.stringify({
      files: candidates.length,
      coldWalkIndexMs: Number(coldWalkIndexMs.toFixed(2)),
      refreshMs: Number(refreshMs.toFixed(2)),
      p95QueryMs: Number(p95QueryMs.toFixed(2)),
      queryChecksums,
    }, null, 2))
    expect(queryChecksums).toEqual(EXPECTED_QUERY_CHECKSUMS)
  })
})
```

- [ ] **Step 3: Add and run the local benchmark command**

Add to `package.json` scripts:

```json
"benchmark:workspace": "vitest run --config vitest.benchmark.config.ts"
```

Run: `npm run benchmark:workspace`

Expected: PASS, one JSON report containing `files: 20000`, `coldWalkIndexMs`, `refreshMs`, `p95QueryMs`, and the four fixed workspace-relative query checksums. Save the baseline report in the task/review notes. The release-machine gate is `p95QueryMs < 50`; do not turn filesystem timings into CI thresholds.

- [ ] **Step 4: Commit the benchmark infrastructure**

```powershell
git add tests/helpers/largeWorkspace.ts tests/benchmark/workspaceResponsiveness.test.ts vitest.benchmark.config.ts package.json
git commit -m "test(workspace): add deterministic 20k benchmark"
```

---

### Task 7: Focused Electron smoke, falsification, and slice gate

**Files:**
- Create: `tests/smoke/workspace-responsiveness.spec.ts`

**Interfaces:**
- Consumes: built app, the semantic Settings Folder tab from accessibility slice 1, `createLargeWorkspace`, and the completed workspace contracts.
- Produces: end-to-end evidence that persisted exclusions refresh the current tree/index, Show All bypasses them, and 20k Quick Open publishes the correct bounded order.

- [ ] **Step 1: Write the focused smoke tests**

Create `tests/smoke/workspace-responsiveness.spec.ts`:

```ts
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { test, expect } from './smokeTest'
import { createLargeWorkspace } from '../helpers/largeWorkspace'

function seedFolder(userDataDir: string, projectDir: string, extra: Record<string, unknown> = {}): void {
  writeFileSync(join(userDataDir, 'settings.json'), JSON.stringify({
    restoreFolderOnLaunch: true,
    lastFolder: projectDir,
    sidebarVisible: true,
    showAllFiles: false,
    workspaceExcludes: ['**/dist/**'],
    ...extra,
  }))
}

test('workspace exclusions refresh the tree/index and Show All bypasses the saved list', async ({ smoke }) => {
  const userDataDir = smoke.tempDir('nc-excludes-profile-')
  const projectDir = smoke.tempDir('nc-excludes-project-')
  mkdirSync(join(projectDir, 'src')); mkdirSync(join(projectDir, 'dist'))
  writeFileSync(join(projectDir, 'src', 'keep.ts'), '')
  writeFileSync(join(projectDir, 'dist', 'excluded-target.ts'), '')
  seedFolder(userDataDir, projectDir)
  const app = await smoke.launch({ args: ['out/main/index.js', `--user-data-dir=${userDataDir}`] })
  const win = await app.firstWindow()
  await expect(win.locator('body')).toHaveAttribute('data-booted', 'true')
  await expect(win.locator('.sb-row', { hasText: 'dist' })).toHaveCount(0)
  await win.keyboard.press('Control+p')
  await win.locator('#quick-open input').fill('excluded-target')
  await expect(win.locator('.qo-row')).toHaveCount(0)
  await win.keyboard.press('Escape')

  await win.keyboard.press('Control+,')
  await win.getByRole('tab', { name: 'Folder' }).click()
  await win.getByRole('checkbox', { name: /Show all files/i }).check()
  await win.keyboard.press('Escape')
  await expect(win.locator('.sb-row', { hasText: 'dist' })).toBeVisible()
  await win.keyboard.press('Control+p')
  await win.locator('#quick-open input').fill('excluded-target')
  await expect(win.locator('.qo-row').first()).toContainText('excluded-target.ts')
})

test('Quick Open returns the deterministic bounded result in a 20,000-file workspace', async ({ smoke }) => {
  const userDataDir = smoke.tempDir('nc-large-profile-')
  const projectDir = smoke.tempDir('nc-large-project-')
  createLargeWorkspace(projectDir)
  seedFolder(userDataDir, projectDir)
  const app = await smoke.launch({ args: ['out/main/index.js', `--user-data-dir=${userDataDir}`] })
  const win = await app.firstWindow()
  await expect(win.locator('body')).toHaveAttribute('data-booted', 'true')
  await win.keyboard.press('Control+p')
  await win.locator('#quick-open input').fill('workspace-target')
  await expect(win.locator('.qo-row').first()).toContainText('workspace-target.ts')
  await expect(win.locator('.qo-row')).toHaveCount(1)
  await win.locator('#quick-open input').fill('file')
  await expect(win.locator('.qo-row')).toHaveCount(50)
})
```

- [ ] **Step 2: Build and run the focused smoke**

Run:

```powershell
npm run build
Remove-Item env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue; npx playwright test tests/smoke/workspace-responsiveness.spec.ts
```

Expected: PASS, 2 tests. The first test proves the same persisted exclusion list affects both lazy sidebar reads and the Quick Open walk, then proves Show All bypasses it without editing the textarea.

- [ ] **Step 3: Falsify the Settings/root invalidation path**

Temporarily remove `await folder.workspaceSettingsChanged()` from `setShowAllFiles`. Rebuild and run only the first smoke test:

```powershell
npm run build
Remove-Item env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue; npx playwright test tests/smoke/workspace-responsiveness.spec.ts -g "Show All bypasses"
```

Expected: RED because `.sb-row` for `dist` never appears and `excluded-target.ts` remains absent from Quick Open. Revert, rebuild, and rerun to PASS.

- [ ] **Step 4: Run the complete slice gate**

Run in order:

```powershell
npm run typecheck
npm run build
npm test
npm run benchmark:workspace
Remove-Item env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue; npm run test:smoke
git diff --check
```

Expected: every command passes; the benchmark reports 20,000 eligible files and a release-machine p95 Quick Open query below 50 ms. Record the before/after walk, refresh, and query report in the review handoff; do not describe local smoke as hosted CI.

- [ ] **Step 5: Commit the smoke evidence**

```powershell
git add tests/smoke/workspace-responsiveness.spec.ts
git commit -m "test(workspace): cover exclusions and 20k Quick Open"
```

---

## Required Falsification Summary

| Guard | Deliberate break | Assertion that must turn red |
|---|---|---|
| Zero-segment `**` | Remove the zero-consumption globstar branch | `src/**/*.ts` fails to match `src/a.ts` in `pathGlob.test.ts` |
| Show All bypass | Compile exclusions even when `showAll` is true | `fsService` and `searchService` Show All tests still hide `dist` |
| Bounded ranking | Keep the first 50 matches | bounded/full-reference path arrays differ in `fuzzy.test.ts` |
| Refresh coalescing | Allow `drain()` while a run is active | scheduler test observes overlapping runs/more than two calls |
| Settings invalidation | Do not request refresh after Show All changes | smoke never renders `dist` or its Quick Open target |

## Self-Review

**Spec coverage:** Tasks 1–2 cover persisted defaults, normalization, exact limited syntax, zero/deep `**`, terminal subtree pruning, root-relative matching, and Show All across sidebar/index/search. Task 3 covers immutable cached fields, relative-path search aid, deterministic bounded top 50. Tasks 4–5 cover one-active/one-dirty refresh, newest root/settings snapshots, stale publication guards, close/root invalidation, watcher/local-operation reuse, and visible-tree preservation during refresh. Tasks 6–7 cover the deterministic 20,000-file generator, cold/index/refresh/query measurements, p95 and correctness checksums, and end-to-end behavior.

**Scope boundary:** No Find in Files scope fields/UI, explicit cancellation IPC, incremental content matching, session-write scheduling, preview debounce, startup batching, version bump, release packaging, or publishing appears here. The only Find in Files change is replacing `showAll` with the stable `WorkspaceFilter` so B1 applies now and later plans can extend it.

**Placeholder scan:** No deferred implementation language or undefined task-local interface remains. Every new symbol is declared in the producing task before consumers use it.

**Type consistency:** `WorkspaceFilter` uses `showAll` and `excludePatterns` everywhere. `readDir(root, path, filter)` and `walkFiles(root, filter, internalOptions?)` match shared `Api`, preload, IPC, main service, renderer, tests, and the later extension point. `QuickOpenDeps.candidates` yields `readonly QuickOpenCandidate[]`. `RefreshScheduler.request()` resolves only after the active run and its single newest follow-up settle.

## Execution Handoff

Plan complete at `docs/superpowers/plans/2026-08-08-quality-scale-keyboard-access-2-workspace-responsiveness.md`. Execute after the first two accessibility plans on the same feature branch, using `superpowers:subagent-driven-development` task-by-task with per-task review and the final slice gate above.
