# Search, Recovery & Preview Efficiency Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop superseded Find in Files work during traversal, remove avoidable whole-document and persistence churn, make startup reads failure-independent, and record evidence before considering pane or file-read concurrency changes.

**Architecture:** Pure, dependency-injected helpers own incremental text iteration, search generations, latest-only writes, preview debounce, and independent startup reads. The typed preload bridge carries explicit one-way search cancellation into the guarded main IPC registration, and main threads one cancellation predicate through the workspace walk and serial file loop. Existing renderer response-id validation, main atomic writes, Markdown sanitization, and deterministic boot application order remain intact.

**Tech Stack:** Electron 31, TypeScript 5.5, Monaco 0.50, Node filesystem promises, typed IPC/preload bridge, Vitest 2, Playwright Electron smoke tests, PowerShell.

## Global Constraints

- Execute after `2026-08-08-quality-scale-keyboard-access-2-workspace-responsiveness.md`; this plan consumes its shared workspace filtering and benchmark contracts.
- Keep `contextIsolation:true`, `nodeIntegration:false`, and `sandbox:true`; no `node:*`, Electron, filesystem, or `Buffer` imports enter `src/renderer/`.
- Register `search:cancel` only through the local guarded `on()` wrapper in `registerIpc`; do not call raw `ipcMain.on`.
- Consume `WorkspaceFilter { showAll: boolean; excludePatterns: string[] }` from `src/shared/types.ts` and `walkFiles(root: string, filter: WorkspaceFilter, options?: WalkFilesOptions): Promise<WalkResult>` from `src/main/fsService.ts`.
- Extend Plan 2's `WalkFilesOptions { maxFiles?: number }` with `shouldCancel?: () => boolean` and `afterDirectoryRead?: () => Promise<void>`; `afterDirectoryRead` is an injected timing seam used only by unit tests and the `NC_HEADLESS` slow-search mode. Cancellation is checked before descent, after every directory read/timing seam, and while enumerating entries.
- Keep `SearchRequest` compatible with the scoped-search slice: this plan uses `filter: WorkspaceFilter`; the later slice adds `scope: SearchScope` without redesigning cancellation.
- Preserve literal query escaping, whole-word behavior, UTF-8/UTF-16 decoding, UTF-16 offsets, dirty-buffer precedence, case-folded Windows path identity, 20 matches per file, 1,000 total matches, and current truncation explanations.
- Cancellation and supersession are expected silent outcomes. They return the existing empty `SearchResponse` for the request id and never toast.
- Keep the 500 ms session edit debounce and main-process `SessionStore` atomic-write format.
- A failed quit-time session write is attempted once, logged, surfaced through the existing one-time session error, and never prevents quit.
- Visible Markdown edits debounce for exactly 150 ms; first show and buffer switches render immediately.
- Startup reads begin together, degrade independently, apply in the approved deterministic order, and emit at most one warning only after `data-booted` is set.
- Do not implement include/exclude scope fields or their UI in this plan; that is Plan 4.
- Do not implement parallel file reads or lazy pane-B construction. Record evidence and require a separately approved design amendment before either change.
- Follow TDD, explicit falsification, focused review, and one commit per task. Do not version, tag, package, or publish this slice independently.

---

## File Structure

| File | Responsibility | Change |
|---|---|---|
| `src/shared/searchText.ts` | Incremental line scanning and compatibility collector | Modify |
| `src/main/fsService.ts` | Extend `WalkFilesOptions` and consume cancellation at traversal boundaries | Modify |
| `src/main/searchService.ts` | Thread cancellation through walk/stat/read/match while retaining serial reads | Modify |
| `src/main/searchGeneration.ts` | Main-owned active request generation and matching-id cancellation | Create |
| `src/shared/types.ts` | Typed `Api.cancelSearch()` and workspace-aware request shape | Modify |
| `src/preload/index.ts` | One-way `search:cancel` bridge | Modify |
| `src/main/ipc.ts` | Guarded request/cancel registration | Modify |
| `src/renderer/findInFilesModel.ts` | Consume incremental matches without a cap-plus-one result array | Modify |
| `src/renderer/findInFiles.ts` | Cancel on replacement, short query, workspace invalidation, and close | Modify |
| `src/renderer/folderMode.ts` | Notify Find in Files before root/filter invalidation | Modify |
| `src/renderer/latestWriteScheduler.ts` | Pure one-active/one-latest-pending scheduler | Create |
| `src/renderer/markdownPreview.ts` | Immediate/scheduled preview lifecycle keyed by buffer id | Modify |
| `src/renderer/startupReads.ts` | Start six independent reads together with typed fallbacks | Create |
| `src/renderer/main.ts` | Integrate session, preview, startup, and profiling-safe seams | Modify |
| `src/main/index.ts` | Forward validated `NC_HEADLESS`-guarded smoke-test modes only | Modify |
| `tests/benchmark/workspaceResponsiveness.test.ts` | Add serial-read timing to the Plan 2 benchmark report | Modify |
| `tests/helpers/largeWorkspace.ts` | Reuse the deterministic 20,000-file fixture | Verify |
| `tests/unit/searchText.test.ts` | Incremental matcher equivalence and stopping | Modify |
| `tests/unit/findInFilesModel.test.ts` | Open-buffer cap/truncation via incremental consumption | Modify |
| `tests/unit/fsService.test.ts` | Cancellation before descent and after directory read | Modify |
| `tests/unit/searchService.test.ts` | Cancellation between stat/read/match boundaries | Modify |
| `tests/unit/searchGeneration.test.ts` | Generation/reload-safe cancellation state | Create |
| `tests/unit/ipcRegistration.test.ts` | Structural proof that cancellation uses the guarded wrapper | Create |
| `tests/unit/latestWriteScheduler.test.ts` | Coalescing, recovery, flush, and failed-quit policy | Create |
| `tests/unit/markdownPreview.test.ts` | Immediate/debounced/replaced/invalidated preview work | Create |
| `tests/unit/startupReads.test.ts` | Concurrent start and independent failure fallbacks | Create |
| `tests/smoke/find-in-files.spec.ts` | Closed-overlay cancellation and stale-paint guard | Modify |
| `tests/smoke/session-lifecycle.spec.ts` | Overlapping session writes restore newest snapshot | Create |
| `tests/smoke/app.spec.ts` | Preview renders only the newest edit | Modify |
| `tests/smoke/startup-window.spec.ts` | One failed read does not block boot or other state | Modify |

No scoped-search input, summary, or `SearchScope` implementation belongs in these files during this slice.

---

### Task 1: Scan Literal Matches Incrementally

**Files:**
- Modify: `src/shared/searchText.ts`
- Modify: `src/renderer/findInFilesModel.ts`
- Modify: `tests/unit/searchText.test.ts`
- Modify: `tests/unit/findInFilesModel.test.ts`

**Interfaces:**
- Produces: `visitSearchMatches(content: string, query: string, opts: SearchOptions, maxMatches: number, visit: (match: SearchMatch) => boolean | void): number`.
- Preserves: `searchText(content: string, query: string, opts: SearchOptions, maxMatches: number): SearchMatch[]` as a collecting compatibility wrapper.
- Preserves: `searchBuffers(buffers: SearchableBuffer[], query: string, opts: SearchOptions): SearchFileResult[]`; Plan 4 extends its parameters for scope.

- [ ] **Step 1: Add failing incremental-equivalence and early-stop tests**

Update the Vitest import to include `vi`, update the search import, and append these cases:

```ts
import { describe, it, expect, vi } from 'vitest'
import { escapeRegex, searchText, visitSearchMatches, MIN_QUERY_LENGTH } from '../../src/shared/searchText'

it('visits the same LF, CRLF, CR, UTF-16-column and preview results as the collector', () => {
  const content = `alpha needle\r\nbeta 😀 needle\rgamma\n${'z'.repeat(240)}needle${'z'.repeat(240)}`
  const collected = searchText(content, 'needle', PLAIN, 20)
  const visited: typeof collected = []
  const count = visitSearchMatches(content, 'needle', PLAIN, 20, match => {
    visited.push(match)
  })
  expect(count).toBe(collected.length)
  expect(visited).toEqual(collected)
  expect(visited.map(match => [match.line, match.column])).toEqual([
    [1, 7], [2, 9], [3, 1], [4, 241],
  ])
  expect(visited[3].preview).toContain('needle')
})

it('does not split the complete document into a line array', () => {
  const split = vi.spyOn(String.prototype, 'split')
  try {
    visitSearchMatches('first needle\nsecond needle', 'needle', PLAIN, 20, () => undefined)
    expect(split).not.toHaveBeenCalled()
  } finally {
    split.mockRestore()
  }
})

it('stops immediately when the visitor returns false', () => {
  const visited: number[] = []
  const count = visitSearchMatches('needle needle\nneedle', 'needle', PLAIN, 20, match => {
    visited.push(match.line)
    return false
  })
  expect(count).toBe(1)
  expect(visited).toEqual([1])
})

it('keeps whole-word and literal metacharacter semantics in the incremental path', () => {
  const literal: number[] = []
  visitSearchMatches('a.b axb a.b', 'a.b', PLAIN, 10, match => { literal.push(match.column) })
  expect(literal).toEqual([1, 9])
  const words: number[] = []
  visitSearchMatches('cat category cat', 'cat', WORD, 10, match => { words.push(match.column) })
  expect(words).toEqual([1, 14])
})
```

Extend `tests/unit/findInFilesModel.test.ts` so the cap-plus-one behavior is observable:

```ts
it('stops the open-buffer visitor on the 21st match and retains only 20', () => {
  const content = Array(21).fill('needle').join('\n') + '\nnot visited'
  const result = searchBuffers([{ filePath: null, title: 'x', content }], 'needle', PLAIN)[0]
  expect(result.matches).toHaveLength(20)
  expect(result.matches.at(-1)?.line).toBe(20)
  expect(result.truncated).toBe(true)
})
```

- [ ] **Step 2: Run the focused tests and verify red**

Run: `npm test -- searchText findInFilesModel`

Expected: FAIL because `visitSearchMatches` is not exported.

- [ ] **Step 3: Implement the no-split visitor and collecting wrapper**

Replace `searchText()` in `src/shared/searchText.ts` with this visitor and wrapper; retain `buildMatcher()`, `preview()`, constants, and path helpers unchanged:

```ts
export type SearchMatchVisitor = (match: SearchMatch) => boolean | void

export function visitSearchMatches(
  content: string,
  query: string,
  opts: SearchOptions,
  maxMatches: number,
  visit: SearchMatchVisitor,
): number {
  const re = buildMatcher(query, opts)
  if (!re || maxMatches <= 0) return 0
  let count = 0
  let lineNumber = 1
  let start = 0

  while (start <= content.length && count < maxMatches) {
    let end = start
    while (end < content.length && content.charCodeAt(end) !== 10 && content.charCodeAt(end) !== 13) end++
    const line = content.slice(start, end)
    re.lastIndex = 0
    let match: RegExpExecArray | null
    while ((match = re.exec(line)) !== null && count < maxMatches) {
      count++
      const keepGoing = visit({
        line: lineNumber,
        column: match.index + 1,
        length: match[0].length,
        preview: preview(line, match.index, match[0].length),
      })
      if (keepGoing === false) return count
    }
    if (end >= content.length) break
    start = end + (content.charCodeAt(end) === 13 && content.charCodeAt(end + 1) === 10 ? 2 : 1)
    lineNumber++
  }
  return count
}

export function searchText(
  content: string,
  query: string,
  opts: SearchOptions,
  maxMatches: number,
): SearchMatch[] {
  const matches: SearchMatch[] = []
  visitSearchMatches(content, query, opts, maxMatches, match => { matches.push(match) })
  return matches
}
```

- [ ] **Step 4: Consume matches incrementally in open buffers**

In `src/renderer/findInFilesModel.ts`, import `visitSearchMatches` instead of `searchText` and replace the body of the per-buffer loop with:

```ts
const matches: SearchMatch[] = []
let truncated = false
visitSearchMatches(b.content, query, opts, MAX_MATCHES_PER_FILE + 1, match => {
  if (matches.length === MAX_MATCHES_PER_FILE) {
    truncated = true
    return false
  }
  matches.push(match)
})
if (!matches.length) continue
out.push({
  path: b.filePath ?? '',
  ...(b.filePath ? {} : { title: b.title }),
  matches,
  truncated,
})
```

Add `SearchMatch` to the existing shared type import.

- [ ] **Step 5: Run focused tests and typecheck**

Run:

```powershell
npm test -- searchText findInFilesModel searchService
npm run typecheck
```

Expected: all PASS; the search-service suite proves the compatibility wrapper did not fork disk semantics.

- [ ] **Step 6: Falsify the no-split and cap guards**

Temporarily restore a `content.split(/\r\n|\r|\n/)` line array inside the visitor. Run `npm test -- searchText` and verify `does not split the complete document into a line array` fails because `split` was called; revert the break and retain the assertion. Then temporarily omit `return false` on the 21st open-buffer match and verify `npm test -- findInFilesModel` fails because 21 matches are retained; revert and rerun green.

- [ ] **Step 7: Commit the incremental matcher**

```powershell
git add src/shared/searchText.ts src/renderer/findInFilesModel.ts tests/unit/searchText.test.ts tests/unit/findInFilesModel.test.ts
git commit -m "perf: scan search text incrementally"
```

---

### Task 2: Cancel Traversal and Serial File Work at Every Await Boundary

**Files:**
- Modify: `src/main/fsService.ts`
- Modify: `src/main/searchService.ts`
- Modify: `tests/unit/fsService.test.ts`
- Modify: `tests/unit/searchService.test.ts`

**Interfaces:**
- Consumes from Plan 2: `WorkspaceFilter`, `WalkFilesOptions { maxFiles?: number }`, and `walkFiles(root, filter, options)`; this task adds the two optional cancellation/test fields named in Global Constraints.
- Preserves for Plan 4: `searchFiles(req: SearchRequest, shouldCancel?: () => boolean, io?: SearchIo): Promise<SearchResponse>`.
- Produces: `SearchIo { stat(path: string): Promise<{ isFile(): boolean; size: number }>; readFile(path: string): Promise<Buffer> }`, a narrow injected unit-test seam; production defaults remain `fs.stat` and `fs.readFile`.

- [ ] **Step 1: Add failing traversal-boundary tests**

Adapt existing `tests/unit/fsService.test.ts` calls to the Plan 2 `WorkspaceFilter` shape and add:

```ts
const FILTER: WorkspaceFilter = { showAll: false, excludePatterns: [] }

it('cancels before descending into the root', async () => {
  mkdirSync(join(dir, 'nested'))
  writeFileSync(join(dir, 'nested', 'hidden.txt'), 'x')
  const result = await walkFiles(dir, FILTER, { shouldCancel: () => true })
  expect(result).toEqual({ files: [], truncated: false })
})

it('checks cancellation again immediately after a directory read', async () => {
  writeFileSync(join(dir, 'not-enumerated.txt'), 'x')
  let checks = 0
  const result = await walkFiles(dir, FILTER, {
    shouldCancel: () => ++checks >= 2,
  })
  expect(checks).toBe(2)
  expect(result).toEqual({ files: [], truncated: false })
})
```

- [ ] **Step 2: Add failing stat/read boundary tests**

Add `SearchIo` to the `searchService` import and append to `tests/unit/searchService.test.ts`:

```ts
it('does not read a file after cancellation becomes true during stat', async () => {
  writeFileSync(join(dir, 'a.txt'), 'needle')
  let cancelled = false
  let reads = 0
  const io: SearchIo = {
    stat: async () => {
      cancelled = true
      return { isFile: () => true, size: 6 }
    },
    readFile: async () => { reads++; return Buffer.from('needle') },
  }
  const result = await searchFiles(req(), () => cancelled, io)
  expect(reads).toBe(0)
  expect(result).toEqual({ files: [], totalMatches: 0, truncated: false, searchId: 1 })
})

it('does not decode or match after cancellation becomes true during read', async () => {
  writeFileSync(join(dir, 'a.txt'), 'needle')
  let cancelled = false
  const io: SearchIo = {
    stat: async () => ({ isFile: () => true, size: 6 }),
    readFile: async () => { cancelled = true; return Buffer.from('needle') },
  }
  const result = await searchFiles(req(), () => cancelled, io)
  expect(result.totalMatches).toBe(0)
  expect(result.files).toEqual([])
})
```

Update the test request factory to use the workspace contract:

```ts
filter: { showAll: false, excludePatterns: [] },
```

Remove its old `showAll: false` field.

- [ ] **Step 3: Run focused tests and verify red**

Run: `npm test -- fsService searchService`

Expected: FAIL because traversal does not yet honor `WalkFilesOptions.shouldCancel`, `SearchIo` is missing, and search does not check after stat/read.

- [ ] **Step 4: Implement traversal cancellation without changing exclusion behavior**

Inside Plan 2's `walkFiles`, use one default predicate and these exact boundary checks:

```ts
const shouldCancel = options.shouldCancel ?? (() => false)

async function walk(dir: string): Promise<void> {
  if (shouldCancel()) return
  let entries
  try { entries = await fs.readdir(dir, { withFileTypes: true }) } catch { return }
  await options.afterDirectoryRead?.()
  if (shouldCancel()) return
  for (const entry of entries) {
    if (shouldCancel()) return
    // Keep Plan 2's relative-path exclusion/pruning checks here unchanged.
    if (out.length >= max) { truncated = true; return }
    const path = join(dir, entry.name)
    if (entry.isDirectory()) await walk(path)
    else out.push(path)
  }
}
```

Cancellation does not set `truncated`; it is not a result-cap condition.

- [ ] **Step 5: Thread the same predicate through serial search work**

In `src/main/searchService.ts`, add:

```ts
export interface SearchIo {
  stat(path: string): Promise<{ isFile(): boolean; size: number }>
  readFile(path: string): Promise<Buffer>
}

const DEFAULT_IO: SearchIo = {
  stat: path => fs.stat(path),
  readFile: path => fs.readFile(path),
}
```

Use this signature and cancellation flow:

```ts
export async function searchFiles(
  req: SearchRequest,
  shouldCancel: () => boolean = () => false,
  io: SearchIo = DEFAULT_IO,
): Promise<SearchResponse> {
  const empty: SearchResponse = { files: [], totalMatches: 0, truncated: false, searchId: req.searchId }
  if (!req.root || req.query.length < MIN_QUERY_LENGTH || shouldCancel()) return empty

  const walk = await walkFiles(req.root, req.filter, { shouldCancel })
  if (shouldCancel()) return empty
  const skip = new Set(req.skipPaths.map(pathKey))
  const files: SearchFileResult[] = []
  let total = 0
  let truncated = walk.truncated

  for (const path of walk.files) {
    if (shouldCancel()) return empty
    if (total >= MAX_MATCHES_TOTAL) { truncated = true; break }
    if (skip.has(pathKey(path))) continue
    let buffer: Buffer
    try {
      const stat = await io.stat(path)
      if (shouldCancel()) return empty
      if (!stat.isFile() || stat.size > MAX_FILE_BYTES) continue
      buffer = await io.readFile(path)
      if (shouldCancel()) return empty
    } catch { continue }
    if (isBinary(buffer)) continue
    const text = decode(buffer, detectEncoding(buffer))
    if (shouldCancel()) return empty
    const found = searchText(text, req.query, req.opts, MAX_MATCHES_PER_FILE + 1)
    if (shouldCancel()) return empty
    // Preserve the existing per-file and total-cap collection exactly here.
    if (!found.length) continue
    const fileTruncated = found.length > MAX_MATCHES_PER_FILE
    let matches = fileTruncated ? found.slice(0, MAX_MATCHES_PER_FILE) : found
    if (total + matches.length > MAX_MATCHES_TOTAL) {
      matches = matches.slice(0, MAX_MATCHES_TOTAL - total)
      truncated = true
    }
    files.push({ path, matches, truncated: fileTruncated })
    total += matches.length
  }
  return { files, totalMatches: total, truncated, searchId: req.searchId }
}
```

The later scoped-search plan inserts path eligibility between `skipPaths` and `stat`; it does not alter these cancellation checks.

- [ ] **Step 6: Run focused tests and typecheck**

Run:

```powershell
npm test -- fsService searchService searchText
npm run typecheck
```

Expected: PASS.

- [ ] **Step 7: Falsify the traversal branch**

Temporarily remove only the cancellation check immediately after `fs.readdir`. Run `npm test -- fsService` and verify `checks` exceeds 2 or the file is returned. Restore the check and rerun green. Then temporarily remove the post-stat check, run `npm test -- searchService`, and verify the `reads` assertion fails with `1`; restore and rerun green.

- [ ] **Step 8: Commit cancellable traversal and serial search**

```powershell
git add src/main/fsService.ts src/main/searchService.ts tests/unit/fsService.test.ts tests/unit/searchService.test.ts
git commit -m "perf: cancel superseded file searches"
```

---

### Task 3: Add Guarded One-Way Cancellation Across IPC

**Files:**
- Create: `src/main/searchGeneration.ts`
- Create: `tests/unit/searchGeneration.test.ts`
- Create: `tests/unit/ipcRegistration.test.ts`
- Modify: `src/shared/types.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/main/ipc.ts`
- Modify: `src/main/index.ts`
- Modify: `src/main/searchService.ts`
- Modify: `src/renderer/findInFiles.ts`
- Modify: `src/renderer/folderMode.ts`
- Modify: `src/renderer/main.ts`
- Modify: `tests/smoke/find-in-files.spec.ts`

**Interfaces:**
- Consumes: `searchFiles(req, shouldCancel, io?)` from Task 2 and Plan 2's `WorkspaceFilter` state in renderer main.
- Produces: `Api.cancelSearch(searchId: number): void` over `ipcRenderer.send('search:cancel', searchId)`.
- Produces: `SearchGeneration.begin(searchId: number): () => boolean` and `SearchGeneration.cancel(searchId: number): void`.
- Extends: `searchFiles(req, shouldCancel?, io?, walkOptions?: Pick<WalkFilesOptions, 'afterDirectoryRead'>)` for the guarded slow-traversal test only.
- Produces for Plan 4: `FindInFiles.workspaceChanged(): void`, which cancels current work and schedules a rerun only while the overlay is open.

- [ ] **Step 1: Write failing main-generation tests**

Create `tests/unit/searchGeneration.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { SearchGeneration } from '../../src/main/searchGeneration'

describe('SearchGeneration', () => {
  it('supersedes an older request when a newer request begins', () => {
    const generation = new SearchGeneration()
    const first = generation.begin(1)
    const second = generation.begin(2)
    expect(first()).toBe(true)
    expect(second()).toBe(false)
  })

  it('cancels only the active request with the matching renderer id', () => {
    const generation = new SearchGeneration()
    const active = generation.begin(7)
    generation.cancel(6)
    expect(active()).toBe(false)
    generation.cancel(7)
    expect(active()).toBe(true)
  })

  it('allows renderer ids to restart after a reload', () => {
    const generation = new SearchGeneration()
    const beforeReload = generation.begin(40)
    const afterReload = generation.begin(1)
    expect(beforeReload()).toBe(true)
    expect(afterReload()).toBe(false)
    generation.cancel(1)
    expect(afterReload()).toBe(true)
  })
})
```

- [ ] **Step 2: Run the generation test and verify red**

Run: `npm test -- searchGeneration`

Expected: FAIL because `src/main/searchGeneration.ts` does not exist.

- [ ] **Step 3: Implement main-owned generation state**

Create `src/main/searchGeneration.ts`:

```ts
export class SearchGeneration {
  private generation = 0
  private active: { searchId: number; generation: number } | null = null

  begin(searchId: number): () => boolean {
    const current = ++this.generation
    this.active = { searchId, generation: current }
    return () => current !== this.generation
  }

  cancel(searchId: number): void {
    if (!this.active || this.active.searchId !== searchId) return
    this.generation++
    this.active = null
  }
}
```

Run: `npm test -- searchGeneration`

Expected: PASS.

- [ ] **Step 4: Add a failing guarded-registration structural test**

Create `tests/unit/ipcRegistration.test.ts`:

```ts
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('IPC registration security boundary', () => {
  const source = readFileSync(resolve(process.cwd(), 'src/main/ipc.ts'), 'utf8')

  it('registers search cancellation through the guarded local on wrapper', () => {
    expect(source).toContain("on('search:cancel'")
    expect(source).not.toMatch(/ipcMain\.on\(['"]search:cancel/)
  })
})
```

Run: `npm test -- ipcRegistration`

Expected: FAIL because `search:cancel` is not registered yet.

- [ ] **Step 5: Add the typed one-way bridge**

In `Api` in `src/shared/types.ts`, add immediately after `searchFiles`:

```ts
cancelSearch(searchId: number): void
```

In `src/preload/index.ts`, add beside `searchFiles`:

```ts
cancelSearch: (searchId) => ipcRenderer.send('search:cancel', searchId),
```

In `src/main/ipc.ts`, replace the local integer generation with:

```ts
const searchGeneration = new SearchGeneration()
handle('search:files', (_event, req: SearchRequest) =>
  searchFiles(req, searchGeneration.begin(req.searchId)))
on('search:cancel', (_event, searchId: number) => searchGeneration.cancel(searchId))
```

Import `SearchGeneration` and keep both registrations inside `registerIpc`. The `on()` wrapper is load-bearing sender validation.

- [ ] **Step 6: Cancel every renderer invalidation path**

In `FindInFiles`, add active state and one cancellation owner:

```ts
private activeSearchId: number | null = null

private cancelActiveSearch(): void {
  if (this.activeSearchId === null) return
  window.api.cancelSearch(this.activeSearchId)
  this.activeSearchId = null
  this.searchId++
}

workspaceChanged(): void {
  this.cancelActiveSearch()
  if (this.host.classList.contains('hidden')) return
  clearTimeout(this.timer)
  if (this.query.length >= MIN_QUERY_LENGTH) this.schedule()
  else { this.results = []; this.searching = false; this.render() }
}
```

At the start of `runSearch()`, cancel the previous active request before assigning the new id. When the query is too short, cancel immediately and render the empty state rather than waiting for a no-op disk request:

```ts
private async runSearch(): Promise<void> {
  const query = this.query
  if (query.length < MIN_QUERY_LENGTH) {
    this.cancelActiveSearch()
    this.results = []
    this.truncated = false
    this.searching = false
    this.render()
    return
  }
  this.cancelActiveSearch()
  const id = ++this.searchId
  const buffers = this.d.buffers()
  const bufferResults = searchBuffers(buffers, query, this.opts)
  const root = this.d.root()
  if (!root) {
    this.results = bufferResults
    this.truncated = false
    this.searching = false
    this.render()
    return
  }
  this.activeSearchId = id
  const response = await window.api.searchFiles({
    root,
    query,
    opts: this.opts,
    skipPaths: buffers.map(buffer => buffer.filePath).filter((path): path is string => !!path),
    filter: this.d.filter(),
    searchId: id,
  })
  if (this.activeSearchId === id) this.activeSearchId = null
  if (id !== this.searchId) return
  // Existing merge/render follows.
}
```

Change the input listener so shortening below `MIN_QUERY_LENGTH` cancels synchronously:

```ts
this.input.addEventListener('input', () => {
  this.query = this.input.value
  if (this.query.length < MIN_QUERY_LENGTH) void this.runSearch()
  else this.schedule()
})
```

In `close()`, call `cancelActiveSearch()` before releasing the overlay. Keep the response-id comparison after the await.

Update `FindInFilesDeps` from `showAll()` to:

```ts
filter: () => WorkspaceFilter
```

Extend Plan 2's `FolderModeDeps` with `onWorkspaceChanged: () => void`. Call it synchronously before changing the root in `openFolder()` and `closeFolder()`, and at the start of `workspaceSettingsChanged()`, before any awaited refresh. In `main.ts`, pass `onWorkspaceChanged: () => findInFiles.workspaceChanged()` and return `filter: workspaceFilter` from `FindInFilesDeps`. This covers recent-folder selection, folder close, settings exclusions, and Show All changes through one owner. Do not add scope fields here; Plan 4 calls the same public method after its own scope changes.

- [ ] **Step 7: Add a real closed-overlay cancellation smoke guard**

In `tests/smoke/find-in-files.spec.ts`, add a generated deep fixture and inspect the existing guarded search trace supplied only under `NC_HEADLESS`:

```ts
test('closing Find in Files cancels main traversal and never repaints', async ({ smoke }) => {
  const userDataDir = smoke.tempDir('notes-searchcancel-')
  const projectDir = smoke.tempDir('notes-searchcancelproj-')
  for (let i = 0; i < 400; i++) {
    const nested = join(projectDir, `d${String(i).padStart(3, '0')}`)
    mkdirSync(nested)
    writeFileSync(join(nested, 'file.txt'), 'needle')
  }
  writeFileSync(join(userDataDir, 'settings.json'), JSON.stringify({
    restoreFolderOnLaunch: true,
    lastFolder: projectDir,
    sidebarVisible: true,
  }))
  const app = await smoke.launch({
    args: ['out/main/index.js', `--user-data-dir=${userDataDir}`],
    env: { ...process.env, NC_TEST_SLOW_SEARCH_MS: '5' },
  })
  const win = await app.firstWindow()
  await expect(win.locator('body[data-booted="true"]')).toBeVisible()
  await win.keyboard.press('Control+Shift+F')
  await win.locator('.fif-head input').fill('needle')
  await expect(win.locator('.fif-note')).toContainText('Searching')
  await win.keyboard.press('Escape')
  await expect(win.locator('.fif-box')).toBeHidden()
  await expect.poll(() => win.locator('#find-in-files').getAttribute('data-last-search-state'), { timeout: 1000 })
    .toBe('cancelled')
  await win.waitForTimeout(250)
  await expect(win.locator('.fif-box')).toBeHidden()
  await expect(win.locator('.fif-row')).toHaveCount(0)
})
```

Implement `NC_TEST_SLOW_SEARCH_MS` only when `NC_HEADLESS === '1'`. In `src/main/index.ts`, parse and clamp it before passing it in `IpcDeps`:

```ts
const searchTestDelayMs = process.env.NC_HEADLESS === '1'
  ? Math.min(25, Math.max(0, Number.parseInt(process.env.NC_TEST_SLOW_SEARCH_MS ?? '0', 10) || 0))
  : 0
```

Add `searchTestDelayMs: number` to `IpcDeps`. In `registerIpc`, define:

```ts
const afterDirectoryRead = deps.searchTestDelayMs > 0
  ? () => new Promise<void>(resolve => setTimeout(resolve, deps.searchTestDelayMs))
  : undefined
```

Extend `searchFiles` with a fourth parameter `walkOptions: Pick<WalkFilesOptions, 'afterDirectoryRead'> = {}` and call `walkFiles(req.root, req.filter, { shouldCancel, ...walkOptions })`. The guarded `search:files` handler passes `{ afterDirectoryRead }`. In `FindInFiles.runSearch()`, set `data-last-search-state="started"` immediately before the invoke only when `nc-headless=1`; when the invoke resolves after `id !== this.searchId`, set it to `cancelled` before returning. This uses the existing response round trip: with cancellation threaded into traversal it resolves inside the one-second assertion, while the deliberate omission continues the 400-directory, 5-ms-per-read traversal beyond that timeout. Do not add a production API or unguarded delay.

- [ ] **Step 8: Run focused tests, build, and smoke**

Run:

```powershell
npm test -- searchGeneration ipcRegistration fsService searchService findInFilesModel
npm run build
Remove-Item env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
npx playwright test tests/smoke/find-in-files.spec.ts
```

Expected: all PASS with the normal configured retries.

- [ ] **Step 9: Falsify both cancellation boundaries**

First, temporarily register `search:cancel` with raw `ipcMain.on`; run `npm test -- ipcRegistration` and verify the structural guard fails on the forbidden raw registration. Restore `on(...)`. Second, temporarily omit `shouldCancel` from the `walkFiles` options; run the new smoke test and verify `data-last-search-state` does not become `cancelled` within its assertion timeout. Restore and rerun green.

- [ ] **Step 10: Commit end-to-end cancellation**

```powershell
git add src/main/searchGeneration.ts src/main/index.ts src/main/searchService.ts src/shared/types.ts src/preload/index.ts src/main/ipc.ts src/renderer/findInFiles.ts src/renderer/folderMode.ts src/renderer/main.ts tests/unit/searchGeneration.test.ts tests/unit/ipcRegistration.test.ts tests/smoke/find-in-files.spec.ts
git commit -m "feat: cancel closed file searches"
```

---

### Task 4: Make the Latest Session Snapshot Win

**Files:**
- Create: `src/renderer/latestWriteScheduler.ts`
- Create: `src/renderer/settleQuitWrites.ts`
- Create: `tests/unit/latestWriteScheduler.test.ts`
- Create: `tests/unit/settleQuitWrites.test.ts`
- Modify: `src/renderer/main.ts`
- Create: `tests/smoke/session-lifecycle.spec.ts`
- Modify: `src/main/index.ts`
- Modify: `src/main/ipc.ts`

**Interfaces:**
- Produces: `LatestWriteScheduler<T>.schedule(value: T): void` and `LatestWriteScheduler<T>.flush(value: T): Promise<void>`.
- Produces: `settleQuitWrites(writes, onRejected): Promise<void>`, which waits for every quit-time write even when one rejects.
- `LatestWriteSchedulerDeps<T>` injects `write`, `onSuccess`, `onFailure`, timer functions, and `debounceMs`.
- Preserves: renderer `scheduleSessionSave(): void` call sites and main `SessionStore.save(data): Promise<void>` atomic ownership.

- [ ] **Step 1: Write deterministic failing scheduler tests**

Create `tests/unit/latestWriteScheduler.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'
import { LatestWriteScheduler } from '../../src/renderer/latestWriteScheduler'

const deferred = <T = void>() => {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

describe('LatestWriteScheduler', () => {
  it('runs one write and retains only the newest pending value', async () => {
    vi.useFakeTimers()
    const first = deferred()
    const writes: string[] = []
    const scheduler = new LatestWriteScheduler<string>({
      debounceMs: 500,
      write: value => { writes.push(value); return value === 'one' ? first.promise : Promise.resolve() },
    })
    scheduler.schedule('one')
    await vi.advanceTimersByTimeAsync(500)
    scheduler.schedule('two')
    scheduler.schedule('three')
    await vi.advanceTimersByTimeAsync(500)
    expect(writes).toEqual(['one'])
    first.resolve()
    await scheduler.whenIdle()
    expect(writes).toEqual(['one', 'three'])
    vi.useRealTimers()
  })

  it('runs the newest pending value after a failure', async () => {
    vi.useFakeTimers()
    const first = deferred()
    const failures: unknown[] = []
    const writes: string[] = []
    const scheduler = new LatestWriteScheduler<string>({
      debounceMs: 0,
      write: value => { writes.push(value); return value === 'old' ? first.promise : Promise.resolve() },
      onFailure: error => { failures.push(error) },
    })
    scheduler.schedule('old')
    await vi.advanceTimersByTimeAsync(0)
    scheduler.schedule('newest')
    first.reject(new Error('disk full'))
    await vi.advanceTimersByTimeAsync(0)
    await scheduler.whenIdle()
    expect(writes).toEqual(['old', 'newest'])
    expect(failures).toHaveLength(1)
    vi.useRealTimers()
  })

  it('flush replaces the pending snapshot and settles after its one attempt fails', async () => {
    const writes: string[] = []
    const scheduler = new LatestWriteScheduler<string>({
      debounceMs: 500,
      write: async value => { writes.push(value); throw new Error('denied') },
    })
    scheduler.schedule('stale')
    await scheduler.flush('quit-state')
    expect(writes).toEqual(['quit-state'])
    await expect(scheduler.whenIdle()).resolves.toBeUndefined()
  })
})
```

Create `tests/unit/settleQuitWrites.test.ts` with a deferred promise named `sessionWrite`, an immediately rejected promise named `clipboardWrite`, and an `onRejected` spy. Start `settleQuitWrites([clipboardWrite, sessionWrite.promise], onRejected)`, prove it has not resolved while the session write is pending, then resolve the session write and assert the helper resolves and reports the clipboard failure exactly once. This is the regression for an unrelated failure racing past the newest session snapshot during quit.

- [ ] **Step 2: Run the scheduler test and verify red**

Run: `npm test -- latestWriteScheduler settleQuitWrites`

Expected: FAIL because the scheduler and quit-settlement modules do not exist.

- [ ] **Step 3: Implement the one-active/one-pending scheduler**

Create `src/renderer/latestWriteScheduler.ts`:

```ts
export interface LatestWriteSchedulerDeps<T> {
  write: (value: T) => Promise<void>
  onSuccess?: () => void
  onFailure?: (error: unknown) => void
  debounceMs: number
  setTimer?: (callback: () => void, delay: number) => ReturnType<typeof setTimeout>
  clearTimer?: (timer: ReturnType<typeof setTimeout>) => void
}

export class LatestWriteScheduler<T> {
  private timer: ReturnType<typeof setTimeout> | null = null
  private active: Promise<void> | null = null
  private pending: T | null = null
  private idleWaiters: Array<() => void> = []
  private readonly setTimer
  private readonly clearTimer

  constructor(private deps: LatestWriteSchedulerDeps<T>) {
    this.setTimer = deps.setTimer ?? ((callback: () => void, delay: number) => setTimeout(callback, delay))
    this.clearTimer = deps.clearTimer ?? ((timer: ReturnType<typeof setTimeout>) => clearTimeout(timer))
  }

  schedule(value: T): void {
    this.pending = value
    this.cancelTimer()
    this.timer = this.setTimer(() => {
      this.timer = null
      this.startPending()
    }, this.deps.debounceMs)
  }

  async flush(value: T): Promise<void> {
    this.pending = value
    this.cancelTimer()
    this.startPending()
    await this.whenIdle()
  }

  whenIdle(): Promise<void> {
    if (!this.active && this.pending === null && this.timer === null) return Promise.resolve()
    return new Promise(resolve => { this.idleWaiters.push(resolve) })
  }

  private startPending(): void {
    if (this.active || this.pending === null) return
    const value = this.pending
    this.pending = null
    this.active = Promise.resolve()
      .then(() => this.deps.write(value))
      .then(() => this.deps.onSuccess?.(), error => this.deps.onFailure?.(error))
      .finally(() => {
        this.active = null
        if (this.pending !== null && this.timer === null) this.startPending()
        else this.resolveIdle()
      })
  }

  private cancelTimer(): void {
    if (this.timer === null) return
    this.clearTimer(this.timer)
    this.timer = null
  }

  private resolveIdle(): void {
    if (this.active || this.pending !== null || this.timer !== null) return
    const waiters = this.idleWaiters.splice(0)
    waiters.forEach(resolve => resolve())
  }
}
```

Create `src/renderer/settleQuitWrites.ts` as a thin `Promise.allSettled` wrapper. It must await the full result array before calling `onRejected(reason)` once for each rejected write; it must never short-circuit on the first rejection.

- [ ] **Step 4: Replace renderer session timers with the scheduler**

In `src/renderer/main.ts`, replace `saveTimer` and the body of `scheduleSessionSave()` with:

```ts
let sessionSaveFailed = false
const sessionWrites = new LatestWriteScheduler<SessionData>({
  debounceMs: 500,
  write: snapshot => window.api.saveSession(snapshot),
  onSuccess: () => { sessionSaveFailed = false },
  onFailure: error => {
    console.error('session save failed', error)
    if (sessionSaveFailed) return
    sessionSaveFailed = true
    toast('Session save failed — check disk space / permissions.', 'error')
  },
})

function scheduleSessionSave(): void {
  if (autoSave) sessionWrites.schedule(manager.toSession())
}
```

Import `SessionData` and `LatestWriteScheduler`. In `flushPendingWritesBeforeQuit()`, remove `saveTimer` from `clearTimeout` and replace direct `saveSession` with:

```ts
await settleQuitWrites([
  ...hlSaveTimers.keys().map(id => flushHighlightSave(id) ?? Promise.resolve()),
  window.api.saveClipboardHistory(pasteHistory.entries()),
  sessionWrites.flush(manager.toSession()),
], error => console.error('quit flush failed', error))
```

`flush()` catches its own write failure through `onFailure`. `settleQuitWrites()` still waits for the delayed session flush when an unrelated highlight/clipboard write rejects, logs each unrelated failure, and always returns.

- [ ] **Step 5: Add an overlapping-write relaunch smoke test**

Add `sessionSaveTestDelayMs: number` to `IpcDeps`. In main, derive it only for headless runs:

```ts
const sessionSaveTestDelayMs = process.env.NC_HEADLESS === '1'
  ? Math.min(1000, Math.max(0, Number.parseInt(process.env.NC_TEST_SESSION_SAVE_DELAY_MS ?? '0', 10) || 0))
  : 0
```

Pass it to `registerIpc`, and replace the session-save handler with:

```ts
handle('session:save', async (_event, data: SessionData) => {
  if (deps.sessionSaveTestDelayMs > 0) {
    await new Promise<void>(resolve => setTimeout(resolve, deps.sessionSaveTestDelayMs))
  }
  await session.save(data)
})
```

Create `tests/smoke/session-lifecycle.spec.ts`:

```ts
import { test, expect } from './smokeTest'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

test('overlapping session saves restore only the newest snapshot', async ({ smoke }) => {
  const userDataDir = smoke.tempDir('notes-sessionlatest-')
  const filePath = join(userDataDir, 'session-note.txt')
  writeFileSync(filePath, '')
  const env = { ...process.env, NC_TEST_SESSION_SAVE_DELAY_MS: '300' }
  const app1 = await smoke.launch({
    args: ['out/main/index.js', `--user-data-dir=${userDataDir}`, filePath],
    env,
  })
  const win1 = await app1.firstWindow()
  await expect(win1.locator('body[data-booted="true"]')).toBeVisible()
  const editor = win1.locator('#paneA .monaco-editor')
  await editor.click()
  await win1.keyboard.type('old')
  await win1.waitForTimeout(550)
  await win1.keyboard.type('-newest')
  const closed = app1.waitForEvent('close')
  await app1.evaluate(({ Menu }) => {
    const file = Menu.getApplicationMenu()!.items.find(item => item.label === 'File')!
    file.submenu!.items.find(item => item.label === 'Exit')!.click()
  }).catch(() => {})
  await closed

  const app2 = await smoke.launch({
    args: ['out/main/index.js', `--user-data-dir=${userDataDir}`],
  })
  const win2 = await app2.firstWindow()
  await expect(win2.locator('#paneA .view-lines')).toContainText('old-newest')
})
```

- [ ] **Step 6: Run unit, build, and smoke verification**

Run:

```powershell
npm test -- latestWriteScheduler settleQuitWrites sessionStore
npm run build
Remove-Item env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
npx playwright test tests/smoke/session-lifecycle.spec.ts tests/smoke/clean-quit.spec.ts
```

Expected: PASS. The relaunch assertion must observe `old-newest`, not merely a successful quit.

- [ ] **Step 7: Falsify newest-state ordering and failed-flush policy**

Temporarily change `schedule()` to retain the first pending value. Verify the unit test fails with `['one', 'two']` instead of `['one', 'three']`; restore. Then replace `Promise.allSettled` in `settleQuitWrites()` with `Promise.all`; verify the deferred-session test resolves/rejects before `sessionWrite` settles, demonstrating the quit race guard; restore and rerun green.

- [ ] **Step 8: Commit session coalescing**

```powershell
git add src/renderer/latestWriteScheduler.ts src/renderer/settleQuitWrites.ts src/renderer/main.ts src/main/index.ts src/main/ipc.ts tests/unit/latestWriteScheduler.test.ts tests/unit/settleQuitWrites.test.ts tests/smoke/session-lifecycle.spec.ts
git commit -m "perf: coalesce session snapshots"
```

---

### Task 5: Debounce Visible Markdown Preview Without Stale Renders

**Files:**
- Modify: `src/renderer/markdownPreview.ts`
- Modify: `src/renderer/main.ts`
- Create: `tests/unit/markdownPreview.test.ts`
- Modify: `tests/smoke/app.spec.ts`

**Interfaces:**
- Produces: `MarkdownPreview.toggle(bufferId: string, markdown: string): boolean`.
- Produces: `MarkdownPreview.switchBuffer(bufferId: string, markdown: string): void`, `update(bufferId: string, markdown: string): void`, and `dispose(): void`.
- Preserves: `isVisible(): boolean`, sanitized `renderMarkdown()`, blocked link navigation, and layout callback behavior.

- [ ] **Step 1: Write failing fake-timer lifecycle tests**

Create `tests/unit/markdownPreview.test.ts`:

```ts
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MarkdownPreview } from '../../src/renderer/markdownPreview'

describe('MarkdownPreview', () => {
  afterEach(() => { vi.useRealTimers(); document.body.replaceChildren() })

  it('renders immediately when shown and debounces edits to the newest content', async () => {
    vi.useFakeTimers()
    const panel = document.createElement('div')
    const render = vi.fn((markdown: string) => `<p>${markdown}</p>`)
    const preview = new MarkdownPreview(panel, { onLayout: vi.fn(), render })
    expect(preview.toggle('a', 'first')).toBe(true)
    expect(render).toHaveBeenLastCalledWith('first')
    preview.update('a', 'middle')
    preview.update('a', 'newest')
    await vi.advanceTimersByTimeAsync(149)
    expect(render).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(render).toHaveBeenLastCalledWith('newest')
  })

  it('cancels pending work on hide, buffer switch, and dispose', async () => {
    vi.useFakeTimers()
    const panel = document.createElement('div')
    const render = vi.fn((markdown: string) => markdown)
    const preview = new MarkdownPreview(panel, { onLayout: vi.fn(), render })
    preview.toggle('a', 'a0')
    preview.update('a', 'stale-a')
    preview.switchBuffer('b', 'fresh-b')
    expect(render).toHaveBeenLastCalledWith('fresh-b')
    await vi.advanceTimersByTimeAsync(150)
    expect(render).not.toHaveBeenCalledWith('stale-a')
    preview.update('b', 'hidden-work')
    preview.toggle('b', 'hidden-work')
    await vi.advanceTimersByTimeAsync(150)
    expect(render).not.toHaveBeenCalledWith('hidden-work')
    preview.dispose()
  })
})
```

- [ ] **Step 2: Run the unit test and verify red**

Run: `npm test -- markdownPreview`

Expected: FAIL because the constructor and methods do not accept the new lifecycle contract.

- [ ] **Step 3: Implement the keyed 150 ms scheduler**

Replace `src/renderer/markdownPreview.ts` with:

```ts
import { renderMarkdown } from './markdownRender'

export interface MarkdownPreviewDeps {
  onLayout: () => void
  render?: (markdown: string) => string
  setTimer?: (callback: () => void, delay: number) => ReturnType<typeof setTimeout>
  clearTimer?: (timer: ReturnType<typeof setTimeout>) => void
}

export class MarkdownPreview {
  private visible = false
  private bufferId: string | null = null
  private timer: ReturnType<typeof setTimeout> | null = null
  private generation = 0
  private readonly render
  private readonly setTimer
  private readonly clearTimer

  constructor(private panel: HTMLElement, private deps: MarkdownPreviewDeps) {
    this.render = deps.render ?? renderMarkdown
    this.setTimer = deps.setTimer ?? ((callback, delay) => setTimeout(callback, delay))
    this.clearTimer = deps.clearTimer ?? (timer => clearTimeout(timer))
    this.panel.addEventListener('click', event => {
      const anchor = (event.target as HTMLElement).closest('a')
      if (anchor) event.preventDefault()
    })
  }

  isVisible(): boolean { return this.visible }

  toggle(bufferId: string, markdown: string): boolean {
    this.visible = !this.visible
    this.panel.classList.toggle('hidden', !this.visible)
    this.cancelPending()
    this.bufferId = bufferId
    if (this.visible) this.renderNow(markdown)
    this.deps.onLayout()
    return this.visible
  }

  switchBuffer(bufferId: string, markdown: string): void {
    this.cancelPending()
    this.bufferId = bufferId
    if (this.visible) this.renderNow(markdown)
  }

  update(bufferId: string, markdown: string): void {
    if (!this.visible) return
    if (bufferId !== this.bufferId) { this.switchBuffer(bufferId, markdown); return }
    this.cancelTimer()
    const generation = this.generation
    this.timer = this.setTimer(() => {
      this.timer = null
      if (this.visible && generation === this.generation && this.bufferId === bufferId) this.renderNow(markdown)
    }, 150)
  }

  dispose(): void { this.visible = false; this.cancelPending() }

  private renderNow(markdown: string): void {
    try { this.panel.innerHTML = this.render(markdown) }
    catch { this.panel.textContent = 'Preview failed to render.' }
  }

  private cancelPending(): void { this.generation++; this.cancelTimer() }
  private cancelTimer(): void {
    if (this.timer === null) return
    this.clearTimer(this.timer)
    this.timer = null
  }
}
```

- [ ] **Step 4: Distinguish edit, switch, and first-show calls in main**

Construct with:

```ts
const mdPreview = new MarkdownPreview(document.getElementById('mdpreview')!, {
  onLayout: () => { view.paneA.layout(); view.paneB.layout() },
})
```

Add:

```ts
function previewSnapshot(): { bufferId: string; content: string } {
  const pane = paneFor(view.focusedPane())
  const bufferId = pane.currentBufferId() ?? manager.activeId!
  return { bufferId, content: pane.getContent() }
}
```

In `showActive()`, call `mdPreview.switchBuffer(active.id, active.content)`. In the pane change callback, call `mdPreview.update(id, manager.get(id)?.content ?? c)`. Replace `togglePreview` with:

```ts
const togglePreview = () => {
  const snapshot = previewSnapshot()
  mdPreview.toggle(snapshot.bufferId, snapshot.content)
  refreshToolbar()
}
```

Remove the old unkeyed `refreshPreview()` calls.

- [ ] **Step 5: Add a latest-content smoke assertion**

Extend `tests/smoke/app.spec.ts`:

```ts
test('visible Markdown preview renders only the newest rapid edit', async ({ smoke }) => {
  const userDataDir = smoke.tempDir('notes-previewlatest-')
  const app = await smoke.launch({ args: ['out/main/index.js', `--user-data-dir=${userDataDir}`] })
  const win = await app.firstWindow()
  await expect(win.locator('body[data-booted="true"]')).toBeVisible()
  await win.locator('.tb-btn[title="Toggle markdown preview"]').click()
  const editor = win.locator('#paneA .monaco-editor')
  await editor.click()
  await win.keyboard.type('# intermediate')
  await win.keyboard.press('Control+A')
  await win.keyboard.type('# newest preview')
  await expect(win.locator('#mdpreview h1')).toHaveText('newest preview')
  await expect(win.locator('#mdpreview')).not.toContainText('intermediate')
})
```

- [ ] **Step 6: Run focused verification**

Run:

```powershell
npm test -- markdownPreview markdownRender
npm run build
Remove-Item env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
npx playwright test tests/smoke/app.spec.ts --grep "Markdown preview|newest rapid edit"
```

Expected: PASS.

- [ ] **Step 7: Falsify stale-preview protection**

Temporarily remove `this.cancelPending()` from `switchBuffer()`. Extend the unit case by advancing the old timer after the switch and verify it fails because `stale-a` replaces `fresh-b`. Restore the check, retain the assertion, and rerun green.

- [ ] **Step 8: Commit preview scheduling**

```powershell
git add src/renderer/markdownPreview.ts src/renderer/main.ts tests/unit/markdownPreview.test.ts tests/smoke/app.spec.ts
git commit -m "perf: debounce markdown preview updates"
```

---

### Task 6: Start Persisted-State Reads Together and Degrade Independently

**Files:**
- Create: `src/renderer/startupReads.ts`
- Create: `tests/unit/startupReads.test.ts`
- Modify: `src/renderer/main.ts`
- Modify: `src/main/index.ts`
- Modify: `src/main/ipc.ts`
- Modify: `tests/smoke/startup-window.spec.ts`

**Interfaces:**
- Produces: `loadStartupState(deps: StartupReadDeps): Promise<StartupReadResult>`.
- `StartupReadResult` contains `settings`, `systemLocale`, `personalWords`, `clipboardHistory`, `snippets`, `session`, and `failures: StartupReadName[]`.
- Defaults are exactly `DEFAULT_SETTINGS`, `'en-GB'`, `[]`, `[]`, `[]`, and `{ buffers: [], activeId: null }`.

- [ ] **Step 1: Write failing concurrency and fallback tests**

Create `tests/unit/startupReads.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS, type SessionData } from '../../src/shared/types'
import { loadStartupState } from '../../src/renderer/startupReads'

const deferred = <T>() => {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

it('starts all six reads before awaiting any one of them', async () => {
  const started: string[] = []
  const session = deferred<SessionData>()
  const result = loadStartupState({
    loadSettings: async () => { started.push('settings'); return { ...DEFAULT_SETTINGS, themeId: 'light' } },
    getSystemLocale: async () => { started.push('locale'); return 'en-US' },
    listPersonalWords: async () => { started.push('words'); return ['Codex'] },
    loadClipboardHistory: async () => { started.push('clipboard'); return ['clip'] },
    loadSnippets: async () => { started.push('snippets'); return [{ id: 's', name: 'S', body: 'body' }] },
    loadSession: () => { started.push('session'); return session.promise },
  })
  await Promise.resolve()
  expect(started).toEqual(['settings', 'locale', 'words', 'clipboard', 'snippets', 'session'])
  session.resolve({ buffers: [], activeId: null })
  await expect(result).resolves.toMatchObject({ failures: [], systemLocale: 'en-US' })
})

it('falls back only the rejected read and reports one failure name', async () => {
  const result = await loadStartupState({
    loadSettings: async () => ({ ...DEFAULT_SETTINGS, themeId: 'light' }),
    getSystemLocale: async () => 'en-US',
    listPersonalWords: async () => ['Codex'],
    loadClipboardHistory: async () => ['clip'],
    loadSnippets: async () => { throw new Error('broken snippets') },
    loadSession: async () => ({ buffers: [], activeId: null }),
  })
  expect(result.settings.themeId).toBe('light')
  expect(result.systemLocale).toBe('en-US')
  expect(result.personalWords).toEqual(['Codex'])
  expect(result.clipboardHistory).toEqual(['clip'])
  expect(result.snippets).toEqual([])
  expect(result.failures).toEqual(['snippets'])
})
```

- [ ] **Step 2: Run the focused test and verify red**

Run: `npm test -- startupReads`

Expected: FAIL because `src/renderer/startupReads.ts` does not exist.

- [ ] **Step 3: Implement independent read settlement**

Create `src/renderer/startupReads.ts`:

```ts
import {
  DEFAULT_SETTINGS,
  type SessionData,
  type Settings,
  type Snippet,
} from '../shared/types'

export type StartupReadName = 'settings' | 'locale' | 'personalWords' | 'clipboard' | 'snippets' | 'session'

export interface StartupReadDeps {
  loadSettings(): Promise<Settings>
  getSystemLocale(): Promise<string>
  listPersonalWords(): Promise<string[]>
  loadClipboardHistory(): Promise<string[]>
  loadSnippets(): Promise<Snippet[]>
  loadSession(): Promise<SessionData>
}

export interface StartupReadResult {
  settings: Settings
  systemLocale: string
  personalWords: string[]
  clipboardHistory: string[]
  snippets: Snippet[]
  session: SessionData
  failures: StartupReadName[]
}

export async function loadStartupState(deps: StartupReadDeps): Promise<StartupReadResult> {
  const failures: StartupReadName[] = []
  const read = async <T>(name: StartupReadName, load: () => Promise<T>, fallback: T): Promise<T> => {
    try { return await Promise.resolve().then(load) }
    catch (error) {
      failures.push(name)
      console.error(`[startup] ${name} read failed`, error)
      return fallback
    }
  }
  const [settings, systemLocale, personalWords, clipboardHistory, snippets, session] = await Promise.all([
    read('settings', deps.loadSettings, { ...DEFAULT_SETTINGS }),
    read('locale', deps.getSystemLocale, 'en-GB'),
    read('personalWords', deps.listPersonalWords, []),
    read('clipboard', deps.loadClipboardHistory, []),
    read('snippets', deps.loadSnippets, []),
    read('session', deps.loadSession, { buffers: [], activeId: null }),
  ])
  return { settings, systemLocale, personalWords, clipboardHistory, snippets, session, failures }
}
```

- [ ] **Step 4: Apply results in the approved deterministic order**

At the beginning of `boot()` after the bridge check, call:

```ts
const startup = await loadStartupState({
  loadSettings: () => window.api.loadSettings(),
  getSystemLocale: () => window.api.getSystemLocale(),
  listPersonalWords: () => window.api.listPersonalWords(),
  loadClipboardHistory: () => window.api.loadClipboardHistory(),
  loadSnippets: () => window.api.loadSnippets(),
  loadSession: () => window.api.loadSession(),
})
const { settings, systemLocale, personalWords } = startup
```

Keep settings and visual application first, including the ordered `await window.api.setAlwaysOnTop(alwaysOnTop)` side effect. Then replace serialized reads with:

```ts
pasteHistory.load(startup.clipboardHistory)
snippets.load(startup.snippets)
if (startup.session.buffers.length > 0) manager.restore(startup.session)
await finishStartupBuffers()
```

Keep spell-controller creation/initialization next, `await folder.restore()` after it, then:

```ts
markBooted()
if (startup.failures.length) {
  toast('Some saved state could not be loaded. Defaults were used.', 'warning')
}
```

This ordering makes the UI usable before warning and emits one warning for one or six failures.

- [ ] **Step 5: Add a guarded one-read failure smoke path**

Add `startupReadFailure: 'snippets' | null` to `IpcDeps`. In main, validate the sole supported smoke mode:

```ts
const startupReadFailure = process.env.NC_HEADLESS === '1'
  && process.env.NC_TEST_FAIL_STARTUP_READ === 'snippets'
  ? 'snippets' as const
  : null
```

Pass it to `registerIpc`, and use this guarded handler:

```ts
handle('snippets:load', () => {
  if (deps.startupReadFailure === 'snippets') throw new Error('injected startup read failure')
  return snippets.load()
})
```

Do not accept arbitrary channel names and do not expose a renderer setter.

Append to `tests/smoke/startup-window.spec.ts`:

```ts
test('one rejected startup read preserves other state and reaches booted', async ({ smoke }) => {
  const userDataDir = smoke.tempDir('notes-startup-partial-')
  mkdirSync(join(userDataDir, 'session'), { recursive: true })
  writeFileSync(join(userDataDir, 'settings.json'), JSON.stringify({ themeId: 'light' }))
  writeFileSync(join(userDataDir, 'clipboard-history.json'), JSON.stringify(['preserved clip']))
  writeFileSync(join(userDataDir, 'session', 'session.json'), JSON.stringify({
    buffers: [{
      id: 'kept', title: 'Recovered', filePath: null, content: 'other reads survived',
      language: 'plaintext', eol: 'LF', encoding: 'utf8', dirty: false,
    }],
    activeId: 'kept',
  }))
  const app = await smoke.launch({
    args: ['out/main/index.js', `--user-data-dir=${userDataDir}`],
    env: { ...process.env, NC_TEST_FAIL_STARTUP_READ: 'snippets' },
  })
  const win = await app.firstWindow()
  await expect(win.locator('body[data-booted="true"]')).toBeVisible()
  await expect(win.locator('body')).toHaveAttribute('data-theme', 'light')
  await expect(win.locator('#paneA .view-lines')).toContainText('other reads survived')
  await expect(win.locator('.toast')).toContainText('Some saved state could not be loaded')
})
```

- [ ] **Step 6: Run focused unit, build, and smoke tests**

Run:

```powershell
npm test -- startupReads settingsStore sessionStore
npm run build
Remove-Item env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
npx playwright test tests/smoke/startup-window.spec.ts
```

Expected: PASS.

- [ ] **Step 7: Falsify failure isolation**

Temporarily replace the six `read(...)` entries with raw promises in `Promise.all`. Run the new smoke test and verify `body[data-booted="true"]` times out. Restore independent settlement and rerun green.

- [ ] **Step 8: Commit parallel startup reads**

```powershell
git add src/renderer/startupReads.ts src/renderer/main.ts src/main/index.ts src/main/ipc.ts tests/unit/startupReads.test.ts tests/smoke/startup-window.spec.ts
git commit -m "perf: load startup state concurrently"
```

---

### Task 7: Record Serial-Read and Pane-B Evidence Without Optimizing Either

**Files:**
- Modify: `tests/benchmark/workspaceResponsiveness.test.ts`
- Verify: `tests/helpers/largeWorkspace.ts`
- Create: `docs/superpowers/evidence/2026-08-08-quality-scale-profile.md`
- Verify only: `src/renderer/splitView.ts`, `src/renderer/editorPane.ts`, `src/main/searchService.ts`

**Interfaces:**
- Consumes from Plan 2: `npm run benchmark:workspace`, `vitest.benchmark.config.ts`, `tests/helpers/largeWorkspace.ts`, and the 20,000-file report emitted by `tests/benchmark/workspaceResponsiveness.test.ts`.
- Produces: JSON fields `serialRead.totalMs`, `serialRead.filesRead`, `serialRead.bytesRead`, and documented pane-A/pane-B construction samples.
- Produces no runtime API, production performance mark, lazy pane, read pool, or concurrency setting.

- [ ] **Step 1: Extend the benchmark's serial-read measurement**

In `tests/benchmark/workspaceResponsiveness.test.ts`, after the Plan 2 index completes, add a serial profile that uses the same indexed paths and the same 1 MiB eligibility cap as search:

```ts
import { mkdtempSync, promises as fs, rmSync } from 'node:fs'

const serialReadStart = performance.now()
let filesRead = 0
let bytesRead = 0
for (const file of coldWalk.files) {
  const stat = await fs.stat(file)
  if (!stat.isFile() || stat.size > 1024 * 1024) continue
  const bytes = await fs.readFile(file)
  filesRead++
  bytesRead += bytes.length
}
const serialRead = {
  totalMs: performance.now() - serialReadStart,
  filesRead,
  bytesRead,
}
```

Add `serialRead` beside `p95QueryMs` in the existing `console.info(JSON.stringify(...))` report. Do not add `Promise.all`, a pool, or parallel read code, even in the benchmark path.

- [ ] **Step 2: Run the benchmark and capture exact JSON**

Run:

```powershell
npm run benchmark:workspace
```

Expected: exit 0; the report retains 20,000 candidates and `serialRead.filesRead` equals the eligible fixture file count. Copy the exact command, commit SHA, machine description, antivirus state if known, and complete emitted report into `docs/superpowers/evidence/2026-08-08-quality-scale-profile.md`.

- [ ] **Step 3: Profile eager pane construction without a committed production hook**

Run the built app under Electron DevTools Performance recording three times. For each run, record timestamps immediately around the two existing `new EditorPane(...)` calls in a temporary local instrumentation of `SplitView`:

```ts
const paneAStarted = performance.now()
this.paneA = new EditorPane(aEl)
console.info('[profile] paneA', performance.now() - paneAStarted)
const paneBStarted = performance.now()
this.paneB = new EditorPane(bEl)
console.info('[profile] paneB', performance.now() - paneBStarted)
```

Build, launch, collect three pane-A and pane-B values, then revert these four temporary profiling statements before committing. Record every sample and medians in the evidence document. Verify `git diff -- src/renderer/splitView.ts` is empty afterward.

- [ ] **Step 4: State the evidence gate explicitly**

Conclude the evidence document with a sentence that quotes the exact serial-read total/file count from the benchmark output and the median of the three recorded pane-B samples, followed verbatim by: `Parallel reads and lazy pane B remain excluded pending a separately approved design amendment.`

If either cost is dominant, record that fact but still make no implementation change; request the design amendment after this slice review.

- [ ] **Step 5: Verify the benchmark and absence of speculative code**

Run:

```powershell
npm run benchmark:workspace
git diff --exit-code -- src/renderer/splitView.ts src/renderer/editorPane.ts
rg -n "Promise\.all.*readFile|p-limit|lazy.*paneB" src/main/searchService.ts src/renderer/splitView.ts
```

Expected: benchmark exits 0; the diff check exits 0; `rg` returns no new parallel-read or lazy-pane implementation. An `rg` exit code of 1 is expected for no matches.

- [ ] **Step 6: Commit profiling evidence only**

```powershell
git add tests/benchmark/workspaceResponsiveness.test.ts
git add -f docs/superpowers/evidence/2026-08-08-quality-scale-profile.md
git commit -m "docs: record quality scale performance profile"
```

---

### Task 8: Falsify the Integrated Slice and Run the Slice Gate

**Files:**
- Verify: all files changed by Tasks 1-7
- Modify: `.superpowers/sdd/quality-scale-keyboard-access.md` (git-ignored execution ledger)

**Interfaces:**
- Consumes: every production/test interface from this plan and Plan 2's workspace contracts.
- Produces: reviewed, reproducible slice evidence for the umbrella plan and Plan 4.

- [ ] **Step 1: Run the complete focused unit set**

Run:

```powershell
npm test -- searchText findInFilesModel fsService searchService searchGeneration latestWriteScheduler markdownPreview startupReads sessionStore
```

Expected: PASS. Record exact files/tests and duration in the execution ledger.

- [ ] **Step 2: Run typecheck and production build**

Run:

```powershell
npm run typecheck
npm run build
```

Expected: both PASS. Treat `npm run build` as the primary IPC/type boundary gate.

- [ ] **Step 3: Run the focused Electron flows from the fresh build**

Run:

```powershell
Remove-Item env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
npx playwright test tests/smoke/find-in-files.spec.ts tests/smoke/session-lifecycle.spec.ts tests/smoke/app.spec.ts tests/smoke/startup-window.spec.ts tests/smoke/clean-quit.spec.ts
```

Expected: PASS under normal configured retries. Record each retry separately.

- [ ] **Step 4: Repeat the required falsifications against their named assertions**

Perform and revert these one-line breaks one at a time:

1. Omit `{ shouldCancel }` from `walkFiles`: cancellation smoke fails waiting for `data-last-search-state="cancelled"`.
2. Queue every session snapshot instead of replacing pending: scheduler unit fails exact write order and relaunch restores stale content.
3. Let an old preview timer survive `switchBuffer`: preview unit fails because `stale-a` renders after `fresh-b`.
4. Use raw `Promise.all` startup reads: partial-read smoke fails waiting for `data-booted="true"`.

After each red result, restore production code and rerun its focused test green. Record the command and exact failed assertion in the ledger.

- [ ] **Step 5: Run the entire unit suite and normally configured smoke suite**

Run:

```powershell
npm test
Remove-Item env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
npm run test:smoke
```

Expected: all PASS. Do not use `--retries=0`; report any configured retry as a retry rather than an all-clean run.

- [ ] **Step 6: Run repository hygiene checks**

Run:

```powershell
git diff --check
git status --short
git log --oneline --decorate -8
```

Expected: no whitespace errors; only intended slice/evidence changes; one focused commit per completed task.

- [ ] **Step 7: Request fresh slice review**

Give the reviewer the approved spec, this plan, exact commit range beginning after Plan 2, focused/full test evidence, falsification evidence, and profiling report. Require findings ordered by severity with file/line references and a direct check that no scoped-search UI, parallel reads, or lazy pane B slipped into the slice.

- [ ] **Step 8: Apply review fixes with their own red/green cycle and commit**

For each accepted finding, add or strengthen the smallest reproducing test, observe it fail, implement the correction, and rerun the focused and affected smoke checks. Use `git diff --name-only` to enumerate the files changed for that finding, stage those literal paths individually, inspect `git diff --cached --stat`, then commit with:

```powershell
git diff --name-only
git diff --cached --stat
git commit -m "fix: address search recovery slice review"
```

- [ ] **Step 9: Update the execution ledger and hand off to Plan 4**

Mark slice 3 complete only after review findings are resolved and all affected checks are green. Record the final slice SHA, unit/smoke counts, retries, benchmark JSON path, and these exact interfaces for Plan 4:

```ts
Api.cancelSearch(searchId: number): void
FindInFiles.workspaceChanged(): void
searchFiles(req: SearchRequest, shouldCancel?: () => boolean, io?: SearchIo, walkOptions?: Pick<WalkFilesOptions, 'afterDirectoryRead'>): Promise<SearchResponse>
walkFiles(root: string, filter: WorkspaceFilter, options?: WalkFilesOptions): Promise<WalkResult>
visitSearchMatches(content: string, query: string, opts: SearchOptions, maxMatches: number, visit: SearchMatchVisitor): number
```

Plan 4 may extend `SearchRequest` with `scope: SearchScope` and `searchBuffers` with scope inputs. It must not replace these cancellation or incremental-matching contracts.
