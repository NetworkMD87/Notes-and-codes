# Offline Prose Spell Check Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a fully offline, user-toggleable spell checker for Monaco plain-text and Markdown prose, with UK/US dictionaries, public Quick Fix actions, and a persistent personal dictionary.

**Architecture:** Pure shared text extraction produces offset-stable prose words. A single renderer web worker owns a replaceable `nspell` adapter and both bundled dictionaries. One app-wide controller debounces visible panes, coalesces work, rejects stale results, and applies pane-owned Monaco decorations and code actions. A guarded main-process store persists personal words atomically.

**Tech Stack:** TypeScript, Electron 31, Monaco 0.50, Vite/electron-vite workers, `nspell`, `dictionary-en`, `dictionary-en-gb`, Vitest, Playwright Electron.

**Spec:** `docs/superpowers/specs/2026-08-06-offline-spell-check-design.md`

## Global Constraints

- `npm run build` is the primary gate after every task; it runs `tsc --noEmit` before bundling.
- Keep the security boundary intact: no `node:*`, `electron`, `fs`, or `Buffer` imports in `src/renderer/`.
- All spell checking and suggestions are local. The worker must contain no `fetch`, URL, telemetry, update, or Chromium dictionary-download path.
- Spell-check only Monaco language ids `plaintext` and `markdown`. A future code-aware checker is separate.
- Use one worker and one controller per app, never one per pane. Only visible eligible pane models are submitted.
- Use dedicated Monaco decorations and the public code-action API. Do not use diagnostics markers, Monaco private imports, or replace Monaco's context menu.
- New IPC requires matching edits in `src/shared/types.ts`, `src/preload/index.ts`, and `src/main/ipc.ts`; register through `registerIpc`'s guarded local `handle` wrapper.
- Main-side persistence must be corrupt-safe and use `atomicWrite`; renderer state changes only after persistence succeeds.
- Dictionary package entry points currently import `node:fs/promises`. Do **not** import their default exports in the renderer. Alias their committed `.aff`/`.dic` files and import those assets with Vite `?raw`, which embeds them in the worker bundle.
- Tests under `tests/` are not part of `tsc`'s `src` include. Type-check production contracts with `npm run build` as well as running tests.
- Code style: no semicolons, single quotes, 2-space indentation, matching surrounding files.
- Smoke tests use isolated `--user-data-dir` profiles and remove their temp directories in `finally`.
- Before any Playwright Electron run, clear `ELECTRON_RUN_AS_NODE` in the same PowerShell command, for example:
  `Remove-Item env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue; npx playwright test spell-check --retries=0`
- A guard is complete only after the named deliberate break makes the named assertion red and the break is reverted.
- Do not change version, ROADMAP, CHANGELOG, package/tag/release state, or merge this branch as part of this implementation plan.

## File Structure

| File | Responsibility | Action |
|---|---|---|
| `src/shared/spell.ts` | Cross-process settings, word/issue, batch, and worker protocol types | Create |
| `src/shared/spellText.ts` | Pure locale resolution, eligibility, Markdown masking, and word extraction | Create |
| `src/renderer/spellDictionaries.ts` | Vite-embedded UK/US `.aff` and `.dic` assets | Create |
| `src/renderer/spellEngine.ts` | Narrow `nspell` adapter; no Monaco/IPC knowledge | Create |
| `src/renderer/spell.worker.ts` | Worker protocol, dictionary lifecycle, check/suggest/mutation dispatch | Create |
| `src/renderer/spellWorkerClient.ts` | Typed worker request/response wrapper and one-restart lifecycle | Create |
| `src/renderer/spellScheduler.ts` | Pure debounce, one-in-flight, latest-batch coalescing | Create |
| `src/renderer/spellCheckCore.ts` | Monaco-free visible-pane orchestration, stale guards, and issue registry | Create |
| `src/renderer/spellCheckController.ts` | Visible-model snapshots, stale guards, decorations, Quick Fix actions | Create |
| `src/renderer/personalDictionaryPanel.ts` | Settings overlay for listing/removing personal words | Create |
| `src/main/spellDictionaryStore.ts` | Validated, versioned, atomic personal dictionary | Create |
| `src/shared/types.ts` | Settings defaults and narrow spell-related `Api` methods | Modify |
| `src/preload/index.ts` | Spell dictionary/system-locale bridge | Modify |
| `src/main/ipc.ts` | Guarded spell handlers and store construction | Modify |
| `src/renderer/editorPane.ts` | Spell snapshot, decoration collection, safe one-word replacement | Modify |
| `src/renderer/splitView.ts` | Explicit `visiblePanes()` accessor | Modify |
| `src/renderer/main.ts` | Construct controller, connect changes/settings, dispose on unload | Modify |
| `src/renderer/settingsPanel.ts` | Editor spell toggle, language selector, resolved locale note, dictionary button | Modify |
| `src/renderer/index.html` | Wavy underline and dictionary/settings UI styles | Modify |
| `electron.vite.config.ts` | Dictionary asset aliases for renderer build | Modify |
| `vitest.config.ts` | Same aliases for actual-dictionary unit tests | Modify |
| `scripts/spellAssetAliases.mjs` | One absolute alias map shared by both Vite configurations and proof build | Create |
| `scripts/verifySpellAssets.mjs` | Built-worker asset and no-network verifier | Create |
| `package.json`, `package-lock.json` | Runtime packages and verification script | Modify |
| `THIRD_PARTY_NOTICES.md` | `nspell` and dictionary licence/source notices | Modify |

---

### Task 1: Prove the engine and dictionary assets in the existing worker build

**Files:**
- Modify: `package.json`, `package-lock.json`, `electron.vite.config.ts`, `vitest.config.ts`, `THIRD_PARTY_NOTICES.md`
- Create: `src/shared/spell.ts`, `src/renderer/spellDictionaries.ts`, `src/renderer/spellEngine.ts`, `scripts/spellAssetAliases.mjs`, `scripts/verifySpellAssets.mjs`
- Test: `tests/unit/spellEngine.test.ts`, `tests/unit/spellAssets.test.ts`

**Interfaces:**
- Produces `ResolvedSpellLocale`, `SpellWord`, and `SpellIssue` in `src/shared/spell.ts`.
- Produces `SpellEngine` and `NspellEngine` in `src/renderer/spellEngine.ts`.
- Proves both dictionary payloads are bundled into an Electron/Vite worker-compatible renderer build without Node shims or runtime reads.

- [ ] **Step 1: Install and lock the three runtime packages**

Run:

```powershell
npm install nspell dictionary-en dictionary-en-gb
```

Do not hand-edit resolved versions. Commit the `package-lock.json` resolution. Confirm with `npm ls nspell dictionary-en dictionary-en-gb` that there is one installed copy of each.

- [ ] **Step 2: Define the shared engine contracts**

Create `src/shared/spell.ts`:

```ts
export type SpellCheckLanguage = 'system' | 'en-GB' | 'en-US'
export type ResolvedSpellLocale = 'en-GB' | 'en-US'

export interface SpellWord {
  text: string
  start: number // UTF-16 offset, inclusive
  end: number   // UTF-16 offset, exclusive
}

export interface SpellIssue extends SpellWord {}

export interface SpellDocument {
  modelUri: string
  modelVersion: number
  languageId: string
  text: string
}

export interface SpellDocumentResult {
  modelUri: string
  modelVersion: number
  issues: SpellIssue[]
}

export interface SpellBatch {
  generation: number
  documents: SpellDocument[]
}

export interface SpellBatchResult {
  generation: number
  documents: SpellDocumentResult[]
}
```

- [ ] **Step 3: Alias raw dictionary assets instead of their Node-only entry points**

Create `scripts/spellAssetAliases.mjs` so the app build, Vitest, and the proof build cannot drift:

```js
import { fileURLToPath } from 'node:url'

export const spellAssetAliases = {
  '@spell/en-us-aff': fileURLToPath(new URL('../node_modules/dictionary-en/index.aff', import.meta.url)),
  '@spell/en-us-dic': fileURLToPath(new URL('../node_modules/dictionary-en/index.dic', import.meta.url)),
  '@spell/en-gb-aff': fileURLToPath(new URL('../node_modules/dictionary-en-gb/index.aff', import.meta.url)),
  '@spell/en-gb-dic': fileURLToPath(new URL('../node_modules/dictionary-en-gb/index.dic', import.meta.url))
}
```

Import `spellAssetAliases` in `electron.vite.config.ts` and assign it to `renderer.resolve.alias`. Import the same object in `vitest.config.ts` and assign it to top-level `resolve.alias`.

Create `src/renderer/spellDictionaries.ts`:

```ts
import enUsAff from '@spell/en-us-aff?raw'
import enUsDic from '@spell/en-us-dic?raw'
import enGbAff from '@spell/en-gb-aff?raw'
import enGbDic from '@spell/en-gb-dic?raw'
import type { ResolvedSpellLocale } from '../shared/spell'

export interface BundledSpellDictionary {
  source: 'dictionary-en' | 'dictionary-en-gb'
  aff: string
  dic: string
}

const DICTIONARIES: Record<ResolvedSpellLocale, BundledSpellDictionary> = {
  'en-US': { source: 'dictionary-en', aff: enUsAff, dic: enUsDic },
  'en-GB': { source: 'dictionary-en-gb', aff: enGbAff, dic: enGbDic }
}

export function bundledDictionary(locale: ResolvedSpellLocale): BundledSpellDictionary {
  return DICTIONARIES[locale]
}
```

If TypeScript does not recognize `?raw`, add only the standard declaration below to `src/vite-env.d.ts`; do not introduce `Buffer`:

```ts
declare module '*?raw' {
  const content: string
  export default content
}
```

- [ ] **Step 4: Write the failing actual-dictionary tests**

Create `tests/unit/spellEngine.test.ts` with tests that load the real aliased payloads and assert:

```ts
expect(us.check([{ text: 'color', start: 0, end: 5 }])).toEqual([])
expect(us.check([{ text: 'colour', start: 0, end: 6 }])).toHaveLength(1)
expect(gb.check([{ text: 'colour', start: 0, end: 6 }])).toEqual([])
expect(gb.check([{ text: 'color', start: 0, end: 5 }])).toHaveLength(1)
const suggestions = us.suggest('speling', 5)
expect(suggestions[0]).toBe('spelling')
expect(us.suggest('speling', 5)).toEqual(suggestions)
expect(us.suggest('speling', 2)).toEqual(suggestions.slice(0, 2))
```

Also assert session ignore is case-insensitive, personal add/remove changes correctness, hyphenated compounds are checked as a whole before components, repeated occurrences call `correct()` only once per normalized lookup while preserving all issue ranges, and `check()` never calls `suggest()` by passing a fake `NspellLike` through the exported constructor seam below.

Run: `npm test -- spellEngine`

Expected: FAIL because `spellEngine.ts` does not exist.

- [ ] **Step 5: Implement the narrow adapter**

Create `src/renderer/spellEngine.ts` with this public surface:

```ts
import nspell from 'nspell'
import { bundledDictionary } from './spellDictionaries'
import type { ResolvedSpellLocale, SpellIssue, SpellWord } from '../shared/spell'

export interface SpellEngine {
  load(locale: ResolvedSpellLocale, personalWords: string[]): Promise<void>
  check(words: SpellWord[]): SpellIssue[]
  suggest(word: string, limit: number): string[]
  ignoreForSession(word: string): void
  addPersonalWord(word: string): void
  removePersonalWord(word: string): void
}

export type NspellLike = ReturnType<typeof nspell>
export type NspellFactory = (dictionary: { aff: string; dic: string }) => NspellLike

const lookup = (word: string): string => word.replaceAll('’', "'")
const key = (word: string): string => lookup(word).toLocaleLowerCase('en')

export class NspellEngine implements SpellEngine {
  private spell: NspellLike | null = null
  private ignored = new Set<string>()
  private personal = new Map<string, string>()

  constructor(private create: NspellFactory = nspell) {}

  async load(locale: ResolvedSpellLocale, personalWords: string[]): Promise<void> {
    const dictionary = bundledDictionary(locale)
    this.spell = this.create({ aff: dictionary.aff, dic: dictionary.dic })
    this.personal.clear()
    for (const word of personalWords) this.addPersonalWord(word)
  }

  check(words: SpellWord[]): SpellIssue[] {
    const spell = this.required()
    const issues: SpellIssue[] = []
    const correctness = new Map<string, boolean>()
    const correct = (value: string): boolean => {
      const normalized = lookup(value)
      const k = key(normalized)
      if (this.ignored.has(k)) return true
      const cached = correctness.get(k)
      if (cached !== undefined) return cached
      const result = spell.correct(normalized)
      correctness.set(k, result)
      return result
    }
    for (const word of words) {
      const normalized = lookup(word.text)
      if (correct(normalized)) continue
      const components = normalized.includes('-') ? normalized.split('-') : []
      if (!components.length) { issues.push(word); continue }
      let offset = word.start
      for (const component of components) {
        if (!correct(component)) {
          issues.push({ text: word.text.slice(offset - word.start, offset - word.start + component.length), start: offset, end: offset + component.length })
        }
        offset += component.length + 1
      }
    }
    return issues
  }

  suggest(word: string, limit: number): string[] {
    return this.required().suggest(lookup(word)).slice(0, Math.max(0, limit))
  }

  ignoreForSession(word: string): void { this.ignored.add(key(word)) }

  addPersonalWord(word: string): void {
    const k = key(word)
    if (this.personal.has(k)) return
    this.personal.set(k, word)
    this.required().add(lookup(word))
  }

  removePersonalWord(word: string): void {
    const saved = this.personal.get(key(word))
    if (!saved) return
    this.personal.delete(key(word))
    this.required().remove(lookup(saved))
  }

  private required(): NspellLike {
    if (!this.spell) throw new Error('Spell dictionary is not loaded')
    return this.spell
  }
}
```

Adjust only for the installed `nspell` type signatures; keep this interface unchanged.

- [ ] **Step 6: Record third-party notices**

Append source, package name, locked version, and licence sections to `THIRD_PARTY_NOTICES.md` for:

- `nspell` — MIT.
- `dictionary-en` — MIT AND BSD dictionary licence.
- `dictionary-en-gb` — MIT AND BSD dictionary licence.

Copy licence text from the installed packages/upstream files without paraphrasing. Create `tests/unit/spellAssets.test.ts` to read `package-lock.json` and `THIRD_PARTY_NOTICES.md`, assert all three locked packages and notice headings exist, and assert both dictionary package entries resolve to their `.aff` and `.dic` files.

- [ ] **Step 7: Add a build-proof and final built-asset/offline verifier**

Create `scripts/verifySpellAssets.mjs` with two explicit modes:

- `--proof` calls Vite's JavaScript `build()` API with `configFile: false`, `spellAssetAliases`, `src/renderer/spellEngine.ts` as an ES-library entry, and a fresh OS temp output directory. It scans the emitted JavaScript and removes that exact temp directory in `finally`. This is the Task 1 compatibility proof before application/controller work exists.
- `--app` reads only `out/renderer/assets/*.js`, locates the spell worker chunk produced after Task 5, and never performs another build.

Both modes fail unless:

- the bundle is large enough to contain two real English dictionaries and contains both US `color` and UK `colour` dictionary sentinels;
- the chunk contains at least two Hunspell affix payload signatures and two dictionary-count headers;
- the chunk contains none of `fetch(`, `XMLHttpRequest`, `WebSocket`, `setSpellCheckerDictionaryDownloadURL`, `http://`, or `https://`.

Add `"verify:spell-assets": "node scripts/verifySpellAssets.mjs --app"` to `package.json`; Task 1 deliberately invokes proof mode directly because no production worker entry exists yet.

Run:

```powershell
npm test -- spellEngine spellAssets
npm run build
node scripts/verifySpellAssets.mjs --proof
```

Expected: all pass. The proof bundle contains both embedded dictionaries and no emitted dependency on `node:fs`. `npm run verify:spell-assets` is expected to become runnable only after the production worker is integrated in Task 5.

- [ ] **Step 8: Falsify the packaged-asset guard**

Temporarily map the `en-GB` entry in `spellDictionaries.ts` to the US asset/source, then run the focused engine test and `node scripts/verifySpellAssets.mjs --proof`.

Expected: the UK `colour` assertion and/or the distinct-source asset assertion goes red. Revert, rebuild, and rerun both green.

- [ ] **Step 9: Commit**

```powershell
git add package.json package-lock.json electron.vite.config.ts vitest.config.ts THIRD_PARTY_NOTICES.md src/shared/spell.ts src/renderer/spellDictionaries.ts src/renderer/spellEngine.ts src/vite-env.d.ts scripts/spellAssetAliases.mjs scripts/verifySpellAssets.mjs tests/unit/spellEngine.test.ts tests/unit/spellAssets.test.ts
git commit -m "feat(spell): bundle offline UK and US spell engines"
```

---

### Task 2: Pure locale resolution and prose extraction

**Files:**
- Create: `src/shared/spellText.ts`
- Test: `tests/unit/spellText.test.ts`

**Interfaces:**
- Consumes `SpellCheckLanguage`, `ResolvedSpellLocale`, and `SpellWord` from Task 1.
- Produces `isSpellEligible(languageId)`, `resolveSpellLocale(preference, systemLocale)`, `maskSpellText(text, languageId)`, and `extractSpellWords(text, languageId)`.

- [ ] **Step 1: Write the failing locale and eligibility tests**

Cover exactly:

```ts
expect(isSpellEligible('plaintext')).toBe(true)
expect(isSpellEligible('markdown')).toBe(true)
expect(isSpellEligible('typescript')).toBe(false)
expect(resolveSpellLocale('en-US', 'en-GB')).toBe('en-US')
expect(resolveSpellLocale('en-GB', 'en-US')).toBe('en-GB')
expect(resolveSpellLocale('system', 'en-US')).toBe('en-US')
expect(resolveSpellLocale('system', 'en-CA')).toBe('en-GB')
expect(resolveSpellLocale('system', 'fr-FR')).toBe('en-GB')
```

- [ ] **Step 2: Write table-driven masking/range tests before implementation**

Each fixture must assert both the returned words and their exact `[start,end)` slice in the original string. Include LF and CRLF variants for multiline fixtures.

Checked fixtures: headings, paragraphs, block quotes, list text, table cells, link labels, image alt text, and visible text in `<span>human words</span>`.

Excluded fixtures: fenced code with backticks and tildes, indented code, multi-backtick inline code, link/image destinations, reference definitions and reference ids, autolinks, raw HTML tags, YAML/TOML frontmatter, URLs, email addresses, Windows and POSIX paths, and entities.

Word fixtures: straight/curly apostrophes, hyphenated terms retained as a compound, Unicode letters, all-uppercase abbreviations of length 2+, numbers, and standalone punctuation.

Run: `npm test -- spellText`

Expected: FAIL because `spellText.ts` does not exist.

- [ ] **Step 3: Implement a length-preserving masker**

Create `src/shared/spellText.ts` with these invariants:

```ts
const WORD = /\p{L}+(?:['’]\p{L}+)*(?:-\p{L}+(?:['’]\p{L}+)*)*/gu

export function isSpellEligible(languageId: string): boolean {
  return languageId === 'plaintext' || languageId === 'markdown'
}

export function resolveSpellLocale(preference: SpellCheckLanguage, systemLocale: string): ResolvedSpellLocale {
  if (preference !== 'system') return preference
  return systemLocale.toLowerCase() === 'en-us' ? 'en-US' : 'en-GB'
}
```

Implement `maskRange(chars, start, end)` by replacing non-newline characters with spaces. Build `maskSpellText` as ordered passes over the same character array:

1. start-of-file YAML/TOML frontmatter;
2. fenced code blocks and 4-space/tab-indented code lines;
3. reference-definition lines;
4. inline code spans matched by equal-length backtick runs;
5. inline link/image destinations and reference-id suffixes, preserving label/alt ranges;
6. autolinks and raw HTML tag syntax, preserving text between opening/closing tags;
7. URL, email, Windows/POSIX path, and entity tokens.

`extractSpellWords` returns `[]` for ineligible language ids, tokenizes the masked string with `WORD`, and filters tokens that contain digits or are `/^[\p{Lu}]{2,}$/u`. It must use the regex match index directly so every issue slices the original text exactly.

Keep the implementation dependency-free and pure; do not call Monaco tokenization.

- [ ] **Step 4: Run and harden the tests**

Run: `npm test -- spellText`

Expected: all locale, eligibility, masking, and exact-offset cases pass.

Add regression cases for unmatched fences/backticks and malformed links; they must fail safe by masking the remainder of the technical construct rather than throwing.

- [ ] **Step 5: Falsify the Markdown exclusion guard**

Temporarily skip the fenced-code pass. Run `npm test -- spellText`.

Expected: the assertion that `mispeling` inside a fenced block is absent goes red, while the identical prose word remains present. Revert and rerun green.

- [ ] **Step 6: Commit**

```powershell
git add src/shared/spellText.ts tests/unit/spellText.test.ts
git commit -m "feat(spell): extract offset-stable prose from text and Markdown"
```

---

### Task 3: Persist personal words and expose guarded IPC

**Files:**
- Create: `src/main/spellDictionaryStore.ts`
- Modify: `src/shared/types.ts`, `src/main/ipc.ts`, `src/preload/index.ts`
- Test: `tests/unit/spellDictionaryStore.test.ts`, `tests/unit/settingsStore.test.ts`, `tests/unit/types.test.ts`

**Interfaces:**
- Produces `SpellDictionaryStore.load/add/remove` and `SpellDictionaryResult`.
- Produces `window.api.getSystemLocale()`, `listPersonalWords()`, `addPersonalWord(word)`, and `removePersonalWord(word)`.
- Extends `Settings` with `spellCheckEnabled` and `spellCheckLanguage`.

- [ ] **Step 1: Extend settings defaults and tests**

In `src/shared/types.ts` add:

```ts
spellCheckEnabled: boolean
spellCheckLanguage: SpellCheckLanguage
```

to `Settings`, with defaults:

```ts
spellCheckEnabled: true,
spellCheckLanguage: 'system',
```

Import `SpellCheckLanguage` as a type from `./spell`. Extend `settingsStore.test.ts` and `types.test.ts` to prove missing keys from an older settings file receive these defaults and explicit saved values survive reload.

- [ ] **Step 2: Write failing store tests**

Create `tests/unit/spellDictionaryStore.test.ts`. Use temp directories and cover:

- missing/corrupt `spell-dictionary.json` returns `[]`;
- only trimmed strings of 1–80 Unicode characters survive;
- blank, non-string, control-character, path-separator, and overlength entries are rejected;
- duplicates collapse case-insensitively while preserving the first display form;
- output is sorted with `a.localeCompare(b, 'en', { sensitivity: 'base' })`;
- add/remove are serialized so concurrent calls cannot lose words;
- a writer failure rejects, leaves the previous target JSON unchanged, and a subsequent `load()` returns the old words.

Run: `npm test -- spellDictionaryStore settingsStore types`

Expected: store test fails because the module does not exist; settings assertions fail until defaults are added.

- [ ] **Step 3: Implement the store**

Create `src/main/spellDictionaryStore.ts` following existing store conventions:

```ts
interface SpellDictionaryFile { version: 1; words: string[] }
type SpellWriter = (target: string, content: string) => Promise<void>

const MAX_WORD_LENGTH = 80

function validWord(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const word = value.trim()
  if (!word || [...word].length > MAX_WORD_LENGTH) return null
  if (/\p{C}|[\\/]/u.test(word)) return null
  return word
}

function sanitize(values: unknown): string[] {
  if (!Array.isArray(values)) return []
  const unique = new Map<string, string>()
  for (const value of values) {
    const word = validWord(value)
    if (word && !unique.has(word.toLocaleLowerCase('en'))) {
      unique.set(word.toLocaleLowerCase('en'), word)
    }
  }
  return [...unique.values()].sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' }))
}

export class SpellDictionaryStore {
  private readonly path: string
  private chain = Promise.resolve()

  constructor(baseDir: string, private write: SpellWriter = atomicWrite) {
    this.path = join(baseDir, 'spell-dictionary.json')
  }

  async load(): Promise<string[]> {
    try {
      const parsed = JSON.parse(await readFile(this.path, 'utf8')) as Partial<SpellDictionaryFile>
      return parsed.version === 1 ? sanitize(parsed.words) : []
    } catch { return [] }
  }

  add(value: unknown): Promise<string[]> {
    const word = validWord(value)
    if (!word) return Promise.reject(new Error('Invalid personal dictionary word'))
    return this.mutate(words => sanitize([...words, word]))
  }

  remove(value: unknown): Promise<string[]> {
    const word = validWord(value)
    if (!word) return Promise.reject(new Error('Invalid personal dictionary word'))
    const removeKey = word.toLocaleLowerCase('en')
    return this.mutate(words => words.filter(saved => saved.toLocaleLowerCase('en') !== removeKey))
  }

  private mutate(change: (words: string[]) => string[]): Promise<string[]> {
    const operation = this.chain.then(async () => {
      const words = change(await this.load())
      await mkdir(dirname(this.path), { recursive: true })
      await this.write(this.path, JSON.stringify({ version: 1, words }, null, 2))
      return words
    })
    this.chain = operation.then(() => undefined, () => undefined)
    return operation
  }
}
```

Import `readFile`/`mkdir` from `node:fs/promises`, `dirname`/`join` from `node:path`, and `atomicWrite` from the local store helper. Validation is shared by load/add/remove within this module. Never modify in-memory/UI state before `atomicWrite` resolves.

- [ ] **Step 4: Add narrow typed API methods**

In `src/shared/types.ts` add:

```ts
export interface SpellDictionaryResult { ok: boolean; words: string[] }

getSystemLocale(): Promise<string>
listPersonalWords(): Promise<string[]>
addPersonalWord(word: string): Promise<SpellDictionaryResult>
removePersonalWord(word: string): Promise<SpellDictionaryResult>
```

In `src/preload/index.ts`, map exact channels:

```ts
getSystemLocale: () => ipcRenderer.invoke('app:getSystemLocale'),
listPersonalWords: () => ipcRenderer.invoke('spell:listPersonalWords'),
addPersonalWord: (word) => ipcRenderer.invoke('spell:addPersonalWord', word),
removePersonalWord: (word) => ipcRenderer.invoke('spell:removePersonalWord', word),
```

In `registerIpc`, construct one `SpellDictionaryStore(deps.baseDir)` and register with the local guarded `handle` wrapper:

```ts
handle('app:getSystemLocale', () => app.getLocale())
handle('spell:listPersonalWords', () => spellDictionary.load())
handle('spell:addPersonalWord', async (_event, word: unknown) => {
  try { return { ok: true, words: await spellDictionary.add(word) } }
  catch { return { ok: false, words: await spellDictionary.load() } }
})
handle('spell:removePersonalWord', async (_event, word: unknown) => {
  try { return { ok: true, words: await spellDictionary.remove(word) } }
  catch { return { ok: false, words: await spellDictionary.load() } }
})
```

The handler must not log the rejected word. Build catches any `Api`/preload/channel mismatch.

- [ ] **Step 5: Run focused tests and build**

```powershell
npm test -- spellDictionaryStore settingsStore types
npm run build
```

Expected: all pass.

- [ ] **Step 6: Falsify persistence honesty**

Inject a writer that throws after a valid file already exists, call `add('NewWord')`, and assert the promise rejects and both the target file and subsequent `load()` still contain only the old word. Temporarily change `mutate` to publish the changed array before `write` resolves.

Expected: the failed-write preservation assertion goes red. Revert and rerun green.

- [ ] **Step 7: Commit**

```powershell
git add src/main/spellDictionaryStore.ts src/shared/types.ts src/main/ipc.ts src/preload/index.ts tests/unit/spellDictionaryStore.test.ts tests/unit/settingsStore.test.ts tests/unit/types.test.ts
git commit -m "feat(spell): persist personal dictionary behind guarded IPC"
```

---

### Task 4: Worker protocol, typed client, and latest-only scheduling

**Files:**
- Modify: `src/shared/spell.ts`
- Create: `src/renderer/spell.worker.ts`, `src/renderer/spellWorkerClient.ts`, `src/renderer/spellScheduler.ts`
- Test: `tests/unit/spellWorkerClient.test.ts`, `tests/unit/spellScheduler.test.ts`

**Interfaces:**
- Consumes `NspellEngine` and `extractSpellWords`.
- Produces request/response unions, `SpellWorkerClient`, and `SpellScheduler`.
- Guarantees one check in flight and at most one newest pending visible-document batch.

- [ ] **Step 1: Add discriminated worker messages**

Extend `src/shared/spell.ts`:

```ts
export type SpellWorkerRequest =
  | { id: number; type: 'load'; locale: ResolvedSpellLocale; personalWords: string[] }
  | { id: number; type: 'check'; batch: SpellBatch }
  | { id: number; type: 'suggest'; word: string; limit: number }
  | { id: number; type: 'ignore'; word: string }
  | { id: number; type: 'personal:add'; word: string }
  | { id: number; type: 'personal:remove'; word: string }

export type SpellWorkerResponse =
  | { id: number; ok: true; type: 'loaded' | 'mutated' }
  | { id: number; ok: true; type: 'checked'; result: SpellBatchResult }
  | { id: number; ok: true; type: 'suggested'; suggestions: string[] }
  | { id: number; ok: false; error: 'load-failed' | 'check-failed' | 'worker-failed' }
```

No response may include document text or the failed word.

- [ ] **Step 2: Write failing client tests with a fake Worker**

Cover request-id correlation, out-of-order responses, rejected error responses, disposal, and exactly one automatic worker recreation. After a second `error` event, the client must enter a disabled state and invoke `onFatal` once.

Make Worker construction injectable:

```ts
type WorkerFactory = () => Pick<Worker, 'postMessage' | 'terminate' | 'addEventListener' | 'removeEventListener'>
```

Run: `npm test -- spellWorkerClient`

Expected: FAIL because the client does not exist.

- [ ] **Step 3: Implement the worker and client**

`spell.worker.ts` owns one `NspellEngine`. On `check`, process documents serially and respond with:

```ts
{
  generation: batch.generation,
  documents: batch.documents.map(document => ({
    modelUri: document.modelUri,
    modelVersion: document.modelVersion,
    issues: engine.check(extractSpellWords(document.text, document.languageId))
  }))
}
```

Register a `message` listener on `self`; its callback reads `event.data as SpellWorkerRequest`, dispatches on `request.type`, and posts the matching `SpellWorkerResponse`. Catch internally and return only the fixed error codes. Do not log request payloads.

`spellWorkerClient.ts` creates the production worker with:

```ts
new Worker(new URL('./spell.worker.ts', import.meta.url), { type: 'module', name: 'spell-check' })
```

Expose:

```ts
load(locale: ResolvedSpellLocale, personalWords: string[]): Promise<void>
check(batch: SpellBatch): Promise<SpellBatchResult>
suggest(word: string, limit?: number): Promise<string[]>
ignore(word: string): Promise<void>
addPersonal(word: string): Promise<void>
removePersonal(word: string): Promise<void>
dispose(): void
```

The client keeps a restart snapshot that changes only after successful acknowledgements: last loaded locale, a case-insensitive map of current personal words, and a case-insensitive set of session ignores. `load` replaces the locale/personal snapshot but deliberately retains session ignores across locale changes. Successful `addPersonal`/`removePersonal` update the personal snapshot; successful `ignore` updates the session set.

On the first worker crash, reject outstanding calls, recreate the worker, load the snapshot's current locale/personal words, replay every session ignore, and call an injected `onRestart` so the controller can resubmit only current visible state. On a second crash, terminate, reject calls, and call `onFatal` exactly once. Extend the client test to prove an ignored word and a newly added personal word are both restored after the first crash.

- [ ] **Step 4: Write failing scheduler tests with fake timers/deferred promises**

Cover:

- 300 ms debounce collapses rapid edits into one batch;
- while batch A is unresolved, B then C results in calls `[A, C]`, never B;
- A's result is not applied after generation changes;
- disable cancels the timer, invalidates in-flight results, and clears via callback;
- locale change invalidates pending work and requests a fresh visible batch;
- an empty visible-document list does not call the worker.

Run: `npm test -- spellScheduler`

Expected: FAIL because the scheduler does not exist.

- [ ] **Step 5: Implement `SpellScheduler` as pure orchestration**

Constructor contract:

```ts
export interface SpellSchedulerDeps {
  check: (batch: SpellBatch) => Promise<SpellBatchResult>
  snapshot: (generation: number) => SpellBatch
  apply: (result: SpellBatchResult) => void
  clear: () => void
  failed: () => void
  setTimer?: typeof setTimeout
  clearTimer?: typeof clearTimeout
}
```

Public methods: `schedule()`, `refreshNow()`, `setEnabled(enabled)`, `invalidate()`, and `dispose()`. Internally keep only `generation`, `timer`, `inFlight`, and `pending` flags. Never send a second check until the first settles; after it settles, rebuild the batch from `snapshot()` rather than retaining old document text.

- [ ] **Step 6: Run focused tests and build**

```powershell
npm test -- spellWorkerClient spellScheduler spellEngine spellText
npm run build
```

- [ ] **Step 7: Falsify newest-only back-pressure**

Temporarily queue every scheduled batch in an array. Run `npm test -- spellScheduler`.

Expected: the `[A, C]` assertion goes red because B is submitted. Revert and rerun green.

- [ ] **Step 8: Commit**

```powershell
git add src/shared/spell.ts src/renderer/spell.worker.ts src/renderer/spellWorkerClient.ts src/renderer/spellScheduler.ts tests/unit/spellWorkerClient.test.ts tests/unit/spellScheduler.test.ts
git commit -m "feat(spell): add worker protocol and latest-only scheduler"
```

---

### Task 5: Monaco decorations, safe Quick Fix actions, and split-pane integration

**Files:**
- Modify: `src/renderer/editorPane.ts`, `src/renderer/splitView.ts`, `src/renderer/main.ts`, `src/renderer/index.html`
- Create: `src/renderer/spellCheckCore.ts`, `src/renderer/spellCheckController.ts`
- Test: `tests/unit/spellCheckCore.test.ts`, `tests/smoke/spell-check.spec.ts`

**Interfaces:**
- `EditorPane` produces a current model snapshot, applies/clears its own spell decorations, and safely replaces one current issue.
- `SplitView.visiblePanes()` produces `[paneA]` or `[paneA, paneB]`.
- Monaco-free `SpellCheckCore` owns the worker/scheduler, issue registry, and state transitions.
- `SpellCheckController` adapts that core to one public Monaco code-action provider and three command registrations.

- [ ] **Step 1: Add pane-owned spell presentation**

In `EditorPane`, create a second decoration collection:

```ts
private spellDecorations = this.editor.createDecorationsCollection()
```

Add:

```ts
spellSnapshot(): SpellDocument | null
setSpellIssues(issues: SpellIssue[]): void
clearSpellIssues(): void
replaceSpellIssue(issue: SpellIssue, expectedVersion: number, replacement: string): boolean
```

`spellSnapshot` reads only the current model's URI, monotonic `getVersionId()`, language id, and text. `setSpellIssues` converts UTF-16 offsets with `model.getPositionAt` and uses decorations with `inlineClassName: 'spell-error'`, hover text `Possible misspelling`, and no minimap/overview-ruler marker. `replaceSpellIssue` must return false unless the same current model/version still contains `issue.text` at `[start,end)`; if valid, create the exact Monaco range from `getPositionAt`, call `editor.pushUndoStop()`, `editor.executeEdits('spell-check', [{ range, text: replacement, forceMoveMarkers: true }])`, then `editor.pushUndoStop()`.

Clear spell decorations during model replacement, forgotten-model disposal, and pane disposal.

In `src/renderer/index.html` add:

```css
.spell-error{text-decoration-line:underline;text-decoration-style:wavy;text-decoration-color:var(--danger);text-decoration-thickness:1px;text-underline-offset:2px}
```

- [ ] **Step 2: Make visible-pane ownership explicit**

Add to `SplitView`:

```ts
visiblePanes(): EditorPane[] {
  return this.split ? [this.paneA, this.paneB] : [this.paneA]
}
```

Use the class's actual split-state field name. Do not infer visibility from DOM styles in the controller.

- [ ] **Step 3: Write failing Monaco-free core tests**

Use fake panes/models, a fake worker client, and fake timers. Assert:

- only visible `plaintext`/`markdown` snapshots enter a batch;
- a hidden pane and a visible TypeScript pane are cleared and omitted;
- a result is applied only if URI and version still match;
- disabling clears every pane and registry entry immediately;
- replacement refuses changed text/version;
- ignore removes every matching issue case-insensitively across both pane registries;
- add updates worker/registries only when main returns `{ ok: true }`;
- add failure leaves issues intact and emits one error toast.

Run: `npm test -- spellCheckCore`

Expected: FAIL because the core does not exist.

- [ ] **Step 4: Implement the Monaco-free core, then the thin Monaco controller**

Create `src/renderer/spellCheckCore.ts` with the structural contracts and constructor below. This file must not import `monaco-editor`, `EditorPane`, or `SpellWorkerClient`; production classes satisfy its interfaces structurally and node-environment unit tests import only this file.

```ts
export interface SpellCheckCoreDeps {
  panes: () => SpellPane[]
  allPanes: () => SpellPane[]
  worker: SpellWorkerPort
  getSettings: () => Pick<Settings, 'spellCheckEnabled' | 'spellCheckLanguage'>
  systemLocale: string
  listPersonalWords: () => Promise<string[]>
  addPersonalWord: (word: string) => Promise<SpellDictionaryResult>
  notify: (message: string, level: 'warning' | 'error') => void
}
```

Define and export narrow structural interfaces in that file so tests do not cast around private class fields:

```ts
export interface SpellPane {
  spellSnapshot(): SpellDocument | null
  setSpellIssues(issues: SpellIssue[]): void
  clearSpellIssues(): void
  replaceSpellIssue(issue: SpellIssue, expectedVersion: number, replacement: string): boolean
}

export interface SpellWorkerPort {
  load(locale: ResolvedSpellLocale, personalWords: string[]): Promise<void>
  check(batch: SpellBatch): Promise<SpellBatchResult>
  suggest(word: string, limit?: number): Promise<string[]>
  ignore(word: string): Promise<void>
  addPersonal(word: string): Promise<void>
  removePersonal(word: string): Promise<void>
  dispose(): void
}
```

`EditorPane` and `SpellWorkerClient` satisfy these interfaces structurally; unit fakes implement only these methods. `SpellCheckCore` exposes current-issue lookup by primitive `{ modelUri, modelVersion, startOffset, endOffset }` plus `replace`, `ignore`, and `add` methods that revalidate through a matching `SpellPane`.

Maintain an issue registry keyed by model URI containing `{ version, issues }`. Construct `SpellScheduler` with snapshots from `deps.panes()`. On apply, re-read each pane snapshot and require matching URI/version before decorating. Missing returned documents clear their current eligible pane.

Create `src/renderer/spellCheckController.ts` as the only new feature file that imports `monaco-editor`. It composes `SpellCheckCore`, converts Monaco model/range coordinates to primitive offsets, and registers the provider/commands below. Do not import this adapter in the node-environment unit test; exercise it through the real Electron smoke test.

Register one provider:

```ts
monaco.languages.registerCodeActionProvider(['plaintext', 'markdown'], {
  provideCodeActions: (model, range) => this.actionsForCurrentIssue(model, range)
})
```

For an overlapping issue, lazily call `worker.suggest(issue.text, 5)`. Return replacement actions first, then `Ignore for this session`, then `Add to personal dictionary`. All three action kinds call app-wide commands registered once with `monaco.editor.registerCommand`; do not register commands in an `EditorPane` constructor. The replacement command locates the pane/model again and calls `replaceSpellIssue`, so the URI, monotonic version, and current text are validated immediately before `executeEdits`. Do not return a direct workspace edit that Monaco could apply after the issue became stale.

Every action argument carries only `{ modelUri, modelVersion, start, end, word, replacement? }`. Revalidate it before acting. Dispose provider/commands/controller on window unload.

Worker/dictionary failure behavior:

- load failure: clear, disable only this controller session, one warning toast;
- first worker restart: resubmit a newly captured visible batch;
- second failure: clear, disable for session, one warning toast;
- never overwrite the persisted `spellCheckEnabled` setting because of a runtime failure.

- [ ] **Step 5: Wire one controller in `main.ts`**

During boot, load settings, system locale, and personal words in parallel. Construct one `SpellWorkerClient` and `SpellCheckController` after panes exist. Pass `view.visiblePanes()` and `[view.paneA, view.paneB]` accessors.

Call `spell.schedule()` from both pane content-change handlers and after `showActive()`. Call `spell.refreshNow()` after split-mode/model changes. Add `spell.applySettings()` to the existing settings update path so toggle/locale changes apply immediately without relaunch.

- [ ] **Step 6: Add the first integration smoke tests**

Create `tests/smoke/spell-check.spec.ts` with isolated profiles and real file fixtures. Build first, then assert:

1. typing `This is a speling mistake.` in a `.txt` buffer produces exactly one rendered `.spell-error` whose text is `speling`;
2. the identical word in a `.ts` buffer produces zero `.spell-error` nodes;
3. Markdown prose `speling` is decorated while the same word in inline and fenced code is not;
4. start with `speling and speling`, place the cursor in the first occurrence, press `Control+.`, choose `spelling`, assert the buffer is `spelling and speling` with exactly one misspelling remaining, press `Control+Z`, and assert both `speling` occurrences return;
5. open split view through `.tb-btn[title="Toggle split pane"]`, show eligible buffers in both panes, switch US/UK through the controller test hook established by Settings wiring in Task 6 only after that UI exists; for now assert both visible panes can hold independent spell decorations.

Anchor assertions on `.spell-error` text/count after waiting for the 300 ms debounce; merely seeing the Quick Fix widget is not coverage.

Run:

```powershell
npm run build
Remove-Item env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue; npx playwright test spell-check --retries=0
```

- [ ] **Step 7: Falsify stale-result rejection**

In the unit test, hold result A, replace the pane snapshot with a new URI/version, then resolve A and assert zero decorations. Temporarily remove the URI/version recheck.

Expected: the stale-result assertion goes red because A decorates the new model. Revert and rerun green.

- [ ] **Step 8: Falsify file-type scope**

Temporarily make `isSpellEligible` return true for every language and rebuild/run the focused smoke suite.

Expected: the `.ts` zero-decoration assertion goes red. Revert, rebuild, and rerun green.

- [ ] **Step 9: Commit**

```powershell
git add src/renderer/editorPane.ts src/renderer/splitView.ts src/renderer/main.ts src/renderer/index.html src/renderer/spellCheckCore.ts src/renderer/spellCheckController.ts tests/unit/spellCheckCore.test.ts tests/smoke/spell-check.spec.ts
git commit -m "feat(spell): integrate Monaco decorations and Quick Fix actions"
```

---

### Task 6: Settings controls and personal dictionary manager

**Files:**
- Modify: `src/renderer/settingsPanel.ts`, `src/renderer/main.ts`, `src/renderer/index.html`, `tests/smoke/settings.spec.ts`, `tests/smoke/spell-check.spec.ts`
- Create: `src/renderer/personalDictionaryPanel.ts`
- Test: `tests/unit/personalDictionaryPanel.test.ts`

**Interfaces:**
- Settings consumes/updates the two new settings and resolved system locale.
- Personal dictionary panel consumes list/remove callbacks and returns no mutable state of its own.
- Controller exposes `applySettings()` and `personalWordsChanged(words)` for immediate synchronization.

- [ ] **Step 1: Extend `SettingsDeps`**

Add:

```ts
spellCheckEnabled: () => boolean
setSpellCheckEnabled: (enabled: boolean) => Promise<void>
spellCheckLanguage: () => SpellCheckLanguage
setSpellCheckLanguage: (language: SpellCheckLanguage) => Promise<void>
resolvedSpellLocale: () => ResolvedSpellLocale
openPersonalDictionary: () => void
```

In `renderEditor()`, add a `.settings-group.spell-settings` after existing editor options with:

- checkbox label `Check spelling in plain text and Markdown`;
- `<select aria-label="Spell check language">` options `Follow Windows`, `English (UK)`, `English (US)`;
- note `Works fully offline. Markdown code and technical syntax are ignored.`;
- when preference is `system`, appended note `Currently using English (UK).` or `Currently using English (US).`;
- button `Personal dictionary…`.

Disable the selector and dictionary button visually only when spell checking is off; keep their stored values unchanged.

- [ ] **Step 2: Implement the dictionary overlay and unit tests**

Create `personalDictionaryPanel.ts` using `OverlayRegistration`, the existing panel tokens, and no native dialogs. Its constructor deps:

```ts
export interface PersonalDictionaryDeps {
  list: () => Promise<string[]>
  remove: (word: string) => Promise<SpellDictionaryResult>
  changed: (words: string[]) => void
  notify: (message: string, level: 'error') => void
}
```

On open, render a loading state, then case-insensitively sorted `.personal-word` rows with a Remove button. Empty state text: `No personal words yet.` On successful removal, replace rows from the returned committed `words` array and call `changed`. On failure, keep the row and show one error toast. Escape/backdrop close via `OverlayRegistration`.

Unit tests in jsdom cover sorted rendering, empty state, successful removal, failed removal preserving the row, and Escape cleanup. If the existing Vitest config is node-only, put `// @vitest-environment jsdom` at the top of this file only.

- [ ] **Step 3: Wire settings and committed dictionary state in `main.ts`**

Settings setters must:

1. persist through the existing `settings.update` path;
2. update the in-memory `settings` object only after success;
3. call `spell.applySettings()` immediately;
4. rerender Settings so disabled/resolved text is current.

Construct `PersonalDictionaryPanel` once. Successful removals call `spell.personalWordsChanged(words)`, which reloads/synchronizes the worker and rechecks visible panes.

- [ ] **Step 4: Add Settings smoke coverage**

Extend `tests/smoke/settings.spec.ts`:

- open Editor and assert toggle checked by default, language `system`, offline note visible;
- uncheck toggle, close/reopen Settings, then relaunch same profile and assert it remains off;
- choose US, relaunch, and assert US remains selected;
- launch Electron with the explicit Chromium argument `--lang=fr-FR`, keep the stored preference at `system`, and assert the Follow Windows note reports `English (UK)` from `app.getLocale()` (do not seed a fake locale in settings and do not read `navigator.language`).

Extend `spell-check.spec.ts`:

- disabling clears existing `.spell-error` nodes immediately; enabling restores them;
- begin with both `Openaiish` and `openaiish` visibly decorated, add `Openaiish` through Quick Fix, assert both title-case and lowercase variants lose decorations, relaunch the same profile, and assert both remain unmarked;
- open Personal dictionary, remove `OpenAIish`, assert the row disappears and the word is decorated again;
- begin with both `Openaiish` and `openaiish` visibly decorated, Ignore for this session removes both variants, but relaunching restores both decorations;
- open split panes with `colour` and `color`, switch UK/US in Settings, and assert both visible panes recheck to the correct opposite result.

Use the public `Control+.` action menu for add/ignore; do not invoke controller internals from Playwright.

- [ ] **Step 5: Run focused gates**

```powershell
npm test -- personalDictionaryPanel settingsStore spellCheckCore
npm run build
Remove-Item env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue; npx playwright test settings spell-check --retries=0
```

- [ ] **Step 6: Falsify save-before-UI honesty**

Add a controller/unit fixture where `addPersonalWord` returns `{ ok: false, words: [] }`. Temporarily remove issues before awaiting the result.

Expected: the assertion that the decoration remains after failed save goes red. Revert and rerun green.

- [ ] **Step 7: Commit**

```powershell
git add src/renderer/settingsPanel.ts src/renderer/personalDictionaryPanel.ts src/renderer/main.ts src/renderer/index.html tests/unit/personalDictionaryPanel.test.ts tests/smoke/settings.spec.ts tests/smoke/spell-check.spec.ts
git commit -m "feat(spell): add settings and personal dictionary management"
```

---

### Task 7: Failure recovery, offline proof, and whole-feature verification

**Files:**
- Modify: `src/main/index.ts`, `src/renderer/main.ts`, `src/renderer/spellWorkerClient.ts`, `src/vite-env.d.ts`
- Modify: `tests/unit/spellWorkerClient.test.ts`, `tests/unit/spellCheckCore.test.ts`, `tests/unit/spellAssets.test.ts`, `tests/smoke/spell-check.spec.ts`, `scripts/verifySpellAssets.mjs`
- Modify other production files only if a failing guard exposes a real gap.

**Interfaces:**
- No new product surface. This task proves the approved failure, privacy, packaging, and regression requirements.

- [ ] **Step 1: Complete deterministic failure tests**

Unit tests must prove:

- corrupt personal dictionary is empty;
- dictionary-load failure clears all decorations and warns once without changing persisted settings;
- first worker failure recreates/reloads/resubmits only a newly captured batch;
- second worker failure disables the session and warns once;
- empty/whitespace-only documents return without calling engine suggestion work;
- late responses after disable, locale switch, model replacement, and controller disposal are ignored;
- error responses/toasts contain no document text or failed word.

- [ ] **Step 2: Add a smoke-only deterministic worker failure seam**

Use the existing `NC_HEADLESS` pattern, not a production command or IPC surface. In `src/main/index.ts`, append `nc-headless=1` to the dev URL and pass `{ query: { 'nc-headless': '1' } }` to packaged `loadFile` only when `process.env.NC_HEADLESS` is set. In `main.ts`, only when `new URLSearchParams(location.search).get('nc-headless') === '1'`, expose `window.__ncSpellTest` with `failNextWorkerRequest()`, `delayNextChecks(count)`, `delayedCheckCount()`, and `releaseNextCheck()`. Declare that optional test-only property in `src/vite-env.d.ts`.

`failNextWorkerRequest()` arms a client flag that routes the next request through the same first-crash handler used by a real Worker `error` event, without including request data in the error. The delay methods hold completed `check` responses in a FIFO only at the client boundary; production behavior is unchanged unless the headless hook arms it.

The smoke test calls the hook through `page.evaluate`, waits for one `.toast.warning`, then types and saves ordinary text successfully. A unit test asserts `window.__ncSpellTest` is absent when the query flag is absent.

Add a separate stale-response smoke test: arm two delayed checks, type misspelled text in model A, and poll until one response is held; switch the same pane to a new model B containing correctly spelled text; release A while B remains held; assert model B still has zero `.spell-error` nodes; then release B and assert it remains clean. Temporarily removing the controller's URI/version recheck must make the first zero-decoration assertion red before B is released.

Keep this seam unreachable in normal packaged use and cover that gate with a static unit assertion.

- [ ] **Step 3: Prove no network during correction workflow**

In the Playwright Electron test, attach `session.defaultSession.webRequest.onBeforeRequest` from `electronApp.evaluate` before triggering spell check. For every later `http:`/`https:` request, record the URL and call the listener callback with `{ cancel: true }`; allow local `file:` requests. Perform check + suggestion + replacement in both locales while this network block is active, assert the correction succeeds, and assert the recorded external URL list is empty.

Also run `scripts/verifySpellAssets.mjs`. It must fail on any spell worker chunk containing network/download APIs and must verify the two dictionary payload signatures/sentinels defined in Task 1.

- [ ] **Step 4: Falsify every cross-cutting guard and record the red assertion in the task notes**

Perform, one at a time, reverting each before the next:

| Guard | Temporary break | Assertion that must go red |
|---|---|---|
| Markdown exclusions | skip fenced-code masking | fenced `mispeling` has zero `.spell-error` |
| Stale results | remove URI/version recheck | replaced model has zero stale decorations |
| Offline assets | remove GB asset mapping | UK `colour` engine/build assertion |
| Persistence honesty | clear issue before failed add resolves | failed add keeps `.spell-error` |
| File-type scope | accept every language id | TypeScript buffer has zero `.spell-error` |
| Latest-only queue | retain every edit batch | worker calls are exactly `[A, C]` |

Do not merely state that a test covers the behavior; capture the failing assertion name in `.superpowers/sdd/` task notes.

- [ ] **Step 5: Run all focused and full gates**

```powershell
npm run typecheck
npm run build
npm run verify:spell-assets
npm test
Remove-Item env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue; npx playwright test spell-check settings --retries=0
Remove-Item env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue; npx playwright test
git diff --check
git status --short
```

Expected: all commands green. If a full-suite smoke test fails, rerun that exact test in isolation before classifying it as a flake; do not waive a spell-check failure.

- [ ] **Step 6: Record package impact without cutting a package/release**

After `npm run build`, record the spell worker chunk size and total `out/` size in `.superpowers/sdd/offline-spell-check-verification.md`. Do not run `npm run package` here: installer creation and release bookkeeping are explicitly outside this implementation branch and will use the release checklist when the user decides to ship.

- [ ] **Step 7: Final implementation commit if verification changed files**

If Task 7 changed only verification files, commit exactly these tracked paths:

```powershell
git add src/main/index.ts src/renderer/main.ts src/renderer/spellWorkerClient.ts src/vite-env.d.ts scripts/verifySpellAssets.mjs tests/unit/spellWorkerClient.test.ts tests/unit/spellCheckCore.test.ts tests/unit/spellAssets.test.ts tests/smoke/spell-check.spec.ts
git commit -m "test(spell): verify offline behavior and failure recovery"
```

If production files also changed, stage each such file by its exact path after reviewing `git diff --name-only`, then use the same commit message. If no tracked files changed, do not create an empty commit.

---

## Done Criteria

- Plain-text and Markdown prose receive subtle wavy spell decorations; code buffers and Markdown technical syntax do not.
- All dictionary work runs in one worker with 300 ms debounce, one in-flight batch, and newest-only coalescing.
- Results are rejected after request generation, model URI, or model version becomes stale.
- UK/US selection and Follow Windows fallback behave as specified and recheck both visible panes immediately.
- Monaco public Quick Fix supplies up to five replacements, Ignore for this session, and Add to personal dictionary; replacement is one undoable occurrence.
- Personal words persist atomically, can be listed/removed in Settings, and UI never claims a failed write succeeded.
- Toggle defaults on, persists off/on, and clears/restarts checking immediately.
- Worker/dictionary failure never blocks editing/saving and warns once without changing the persisted preference.
- `npm run build`, `npm run verify:spell-assets`, `npm test`, focused smoke, full smoke, and `git diff --check` are green.
- All six named falsifications were observed red and restored green.
- `THIRD_PARTY_NOTICES.md` contains the locked engine and both dictionary notices.
- No toolbar/status/palette command, code-language checking, version bump, ROADMAP/CHANGELOG change, package, tag, release, or merge was added.
