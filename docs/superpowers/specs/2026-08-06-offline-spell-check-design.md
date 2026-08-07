# Offline prose spell check — design

**Date:** 2026-08-06

**Status:** Approved (user, 2026-08-06)

**Branch:** `codex/feat/offline-spell-check`

**Scope:** Design only. Implementation, release bookkeeping, and a future code-aware checker are separate work.

## Goal

Add quiet, responsive spell checking for notes without changing Notes & Codes into a grammar
service or sending document content anywhere. Plain-text and Markdown prose receives familiar
squiggled underlines and a right-click correction workflow. Code and Markdown technical syntax do
not.

The feature is enabled by default, works fully offline, follows the Windows English variant by
default, and remains easy to disable globally in Settings.

## Approved product decisions

- Check only Monaco `plaintext` and `markdown` buffers in v1. This includes untitled plain-text
  notes plus `.txt`, `.md`, and `.markdown` files detected through the existing language mapping.
- Do not check source-code languages. A code-aware checker is a possible later feature with a
  different false-positive and configuration model.
- Run entirely offline. Neither document text nor dictionary queries may leave the machine.
- Enable spell checking by default for new and upgraded installations.
- Put the persistent toggle and language choice in **Settings → Editor**.
- Provide no toolbar button, status-bar control, command-palette command, or automatic correction
  in v1.
- Follow the Windows locale by default, with explicit English (UK) and English (US) overrides.
- In Markdown, check human-readable prose and ignore technical syntax.
- Right-click correction includes replacement suggestions, **Ignore for this session**, and
  **Add to personal dictionary**.
- Personal words are reviewable and removable from Settings.

## Non-goals

- Grammar, style, tone, or AI-assisted rewriting.
- Checking identifiers, comments, or strings in source code.
- Automatic language detection within a document.
- Languages other than English (UK) and English (US).
- Per-file, per-folder, or per-workspace settings.
- Automatic correction or replacement of every occurrence.
- A top-bar button or other persistent editor chrome.
- Reusing Chromium's native editable-field underlines.

## Why a dedicated engine

### Recommended: bundled Hunspell-compatible engine behind an adapter

Use a small JavaScript Hunspell-compatible engine, initially `nspell`, with bundled `en-GB` and
`en-US` dictionary assets. The engine runs inside a dedicated web worker and is hidden behind an
internal `SpellEngine` interface.

This satisfies the offline requirement, keeps dictionary behaviour deterministic, supports
suggestions and personal words, and gives the app exact control over Markdown exclusions. The
adapter boundary is important because `nspell` is small and stable but not frequently released; it
must be replaceable without changing Monaco integration or stored data.

The English dictionary packages come from the normalized Hunspell collection maintained at
`wooorm/dictionaries`. Their dictionary-specific MIT/BSD notices must be included in
`THIRD_PARTY_NOTICES.md` and in packaged-asset verification.

### Rejected for v1: CSpell

CSpell is the stronger candidate for the future code-aware feature: it understands programming
identifiers and language-specific dictionaries. For prose-only v1 it is heavier, more
configuration-oriented, and its current runtime line is Node-centric relative to the app's Electron
31 generation. Pinning an older CSpell or upgrading Electron solely for spell check is not justified.

### Rejected: Electron/Chromium spell check

Electron exposes Chromium spell-check language, suggestion, and dictionary APIs, but Monaco renders
document text separately from its hidden input and explicitly disables browser spell checking on
that input. Chromium therefore cannot simply mark the visible Monaco document. On Windows and
Linux, Electron also normally downloads missing Hunspell dictionaries. That is a poor fit for the
strict offline requirement and gives insufficient control over Markdown ranges.

## Architecture

Four focused units keep parsing, dictionary work, UI coordination, and persistence independent.

| Unit | Process | Responsibility |
|---|---|---|
| `spellText.ts` | worker-safe pure module | Eligibility helpers, Markdown masking, word ranges, locale resolution |
| `spell.worker.ts` | renderer worker | Load one bundled dictionary, check words, generate suggestions, hold session ignores |
| `SpellCheckController` | renderer | Debounce visible models, reject stale work, own Monaco decorations and correction actions |
| `SpellDictionaryStore` | main | Corrupt-safe, atomic persistence of personal words |

There is one app-wide controller and one worker shared by both Monaco panes. Dictionary data is
loaded once rather than once per pane. Each pane owns only the decoration collection attached to its
current model.

### Engine interface

The worker implementation conforms to a deliberately narrow conceptual interface:

```ts
interface SpellEngine {
  load(locale: ResolvedSpellLocale, personalWords: string[]): Promise<void>
  check(words: SpellWord[]): Promise<SpellIssue[]>
  suggest(word: string, limit: number): Promise<string[]>
  ignoreForSession(word: string): void
  addPersonalWord(word: string): void
  removePersonalWord(word: string): void
}
```

`SpellWord` and `SpellIssue` carry original document offsets. The engine never knows about Monaco,
buffers, settings controls, IPC, or file paths.

### Check flow

1. A pane shows an eligible model, the model changes, the feature is enabled, or the language
   setting changes.
2. `SpellCheckController` waits about 300 ms after the latest edit.
3. The controller sends the current text, Monaco language id, model URI, and model version to the
   worker. Only currently visible panes are checked.
4. The worker masks excluded syntax without changing string length, tokenizes the remaining prose,
   and checks unique words against the selected bundled dictionary, personal words, and session
   ignores.
5. The worker returns misspelled ranges with the request id and model version.
6. The controller discards results if the request was superseded, the model was replaced, or its
   version changed.
7. Current results become Monaco decorations using original offsets.

Routine checking does not calculate suggestions. Suggestions are requested only when the user opens
correction actions for a flagged word.

### Concurrency and back-pressure

The worker processes one check at a time. If more changes arrive while a check is running, the
controller retains only the newest pending state. When the current check finishes, its result is
discarded if stale and the newest state runs next. Rapid typing therefore cannot build an unbounded
queue.

No spell work may run on the renderer UI thread beyond debouncing, version checks, converting result
offsets to Monaco ranges, and applying decorations.

## Prose extraction

### Plain text

All normal text is eligible. URLs, email addresses, and path-like tokens are masked because their
components are rarely useful spelling candidates and create noisy false positives.

### Markdown

The masker preserves every source offset by replacing excluded characters with spaces while keeping
newlines intact. It checks headings, paragraphs, block quotes, list text, table text, link labels,
and image alt text.

It excludes:

- fenced and indented code blocks;
- inline code spans, including multi-backtick delimiters;
- link and image destinations, reference definitions, and autolinks;
- URLs and email addresses;
- raw HTML tag syntax while still checking human-readable text between tags;
- YAML or TOML frontmatter at the start of a document;
- Markdown punctuation and entities as syntax rather than words.

The masker is pure and must not depend on Monaco tokenization. Monaco's tokens are optimized for
colouring, not stable prose source ranges, and tying correctness to the current theme grammar would
make tests and future engine replacement brittle.

### Word boundaries

Words are Unicode letter sequences with internal straight or curly apostrophes. Lookup normalizes a
curly apostrophe to the dictionary form without changing the reported source range. Hyphenated text
is first offered to the dictionary as a compound; if it is not recognized, each component is
checked independently. Numbers, standalone punctuation, all-uppercase abbreviations of two or more
letters, and tokens containing directory separators are ignored in v1.

Case is preserved for dictionary lookup but personal and session-ignore matching is case-insensitive.
Adding `OpenAI` therefore clears `openai` underlines too; the stored display form remains the form the
user added.

## Settings and locale resolution

`Settings` gains:

```ts
spellCheckEnabled: boolean          // default true
spellCheckLanguage: 'system' | 'en-GB' | 'en-US' // default 'system'
```

Settings → Editor gains a **Spell Check** group:

- **Check spelling in plain text and Markdown** toggle.
- Language selector: **Follow Windows**, **English (UK)**, **English (US)**.
- Explanatory note: checking is offline; Markdown code and technical syntax are ignored.
- **Personal dictionary…** control listing personal words with Remove actions.

The renderer reads the Windows application locale through a narrow
`getSystemLocale(): Promise<string>` guarded IPC, then the pure `resolveSpellLocale()` helper combines
it with the stored preference. `en-US` selects US English. `en-GB` and other English regional
locales select UK English for v1. A non-English system locale also falls back to UK English, and the
Settings note names that resolved fallback so the user is not misled.

Changing the toggle or locale applies immediately. Disabling clears all spelling decorations and
pending work. Re-enabling or changing locale reloads the worker and rechecks visible eligible models.

## Monaco presentation and correction actions

Misspellings use a dedicated decoration collection, never the highlighter's collection. The visual
treatment is a subtle wavy underline derived from the existing danger token, with no overview-ruler
or minimap marker. Spelling is assistance, not a compiler error.

Correction actions integrate through Monaco's public code-action API. The controller keeps an issue
registry keyed by model URI and version; the provider returns actions only when the requested range
overlaps a current spelling issue. It returns, in order:

1. up to five replacement suggestions;
2. **Ignore for this session**;
3. **Add to personal dictionary**.

Monaco may render these under its standard Quick Fix entry rather than as private dynamic context-menu
rows. That standard public-API presentation is intentional: do not import Monaco internals or replace
its context menu merely to force suggestion placement. The rest of Monaco's context menu remains
unchanged.

A replacement uses `executeEdits` with the issue's current range and is one undoable edit. Before
applying it, the controller confirms that the model version and current range still contain the
flagged word. It replaces one occurrence only.

Ignoring a word adds it to the worker's in-memory session set and immediately removes all matching
decorations across open buffers. It resets on app restart.

Adding a word calls the guarded main-process IPC path. Decorations are removed only after the store
confirms the save. A successful save synchronizes the word into the worker and all open buffers.

## Personal dictionary persistence

`SpellDictionaryStore` follows the existing main-side store conventions:

- constructor receives the app user-data base directory;
- `load()` never throws, returns `[]` for missing/corrupt content, validates strings, trims them,
  removes empty values, bounds word length, and de-duplicates case-insensitively;
- `save()` uses `atomicWrite`, never a direct target write;
- persisted JSON is a small versioned object so later schema changes are possible.

The typed bridge exposes narrow methods:

```ts
listPersonalWords(): Promise<string[]>
addPersonalWord(word: string): Promise<{ ok: boolean; words: string[] }>
removePersonalWord(word: string): Promise<{ ok: boolean; words: string[] }>
```

Handlers are registered through `registerIpc`'s guarded local wrappers, never raw `ipcMain.handle`.
Renderer input is validated again in main before persistence.

The Settings dictionary view sorts words case-insensitively and supports removal only; direct manual
entry is outside v1 because the right-click action already owns adding words.

## Failure behaviour

Spell check must never block startup, opening, editing, saving, or quitting.

- A corrupt personal dictionary loads as empty.
- If a bundled dictionary fails to load, clear decorations, disable checking for that session, and
  show one warning toast. Keep the persisted setting so the next launch retries.
- If the worker fails, recreate it once and resubmit only the newest visible state. A second failure
  disables checking for the session and produces one warning toast.
- If adding or removing a personal word fails, keep the old UI state and decorations and show an
  error toast. Never report a word as saved before atomic persistence succeeds.
- An empty or whitespace-only document returns no issues without loading suggestion work.
- Late worker responses after disabling the feature, switching locale, replacing a model, or closing
  a buffer are ignored.

Errors contain no document text in logs or toasts.

## Privacy and packaging

- Dictionary `.aff` and `.dic` assets ship inside the application package.
- The worker reads only packaged assets; it contains no URL, fetch, telemetry, or update path.
- Spell checking uses no Electron/Chromium dictionary download APIs.
- Document text crosses only the renderer-to-worker structured-clone boundary inside the local app.
- `THIRD_PARTY_NOTICES.md` records the engine and both dictionary licences.
- The icon-generation and unrelated packaging flows remain untouched.

## Testing

### Pure unit tests

`spellText` tests cover:

- eligibility for plaintext, Markdown, code languages, and untitled buffers;
- exact offsets after masking;
- Markdown headings, prose, lists, quotes, tables, and link labels are checked;
- fenced/indented code, inline code, destinations, autolinks, reference definitions, raw HTML tags,
  frontmatter, URLs, emails, and paths are excluded;
- apostrophes, curly apostrophes, hyphenated terms, abbreviations, Unicode letters, and CRLF content;
- UK/US and non-English system-locale resolution.

Controller tests cover:

- debounce and newest-state coalescing;
- model-version and request-id stale-result rejection;
- disabling and language switching clear results and invalidate pending work;
- only visible eligible models are submitted;
- replacement refuses a range whose text has changed.

### Engine and dictionary tests

Using the actual bundled assets:

- known correct and deliberately misspelled words;
- a stable UK/US distinction such as `colour` / `color`;
- suggestion limit and deterministic ordering for a fixed fixture;
- session ignore, personal add, and personal remove behaviour;
- checking produces no suggestion work until explicitly requested.

### Store tests

- missing and malformed files load as empty;
- invalid entries are filtered and case-insensitive duplicates collapse;
- add/remove save atomically;
- a failed write preserves the prior target and reports failure.

### Smoke tests

On isolated `--user-data-dir` profiles:

1. a misspelling in `.txt` receives a decoration; a source-code buffer does not;
2. Markdown prose is marked while an identical misspelling in fenced and inline code is not;
3. a suggestion replaces one occurrence and one Undo restores it;
4. Ignore removes matching marks for the session but they return after relaunch;
5. Add removes matching marks and persists across relaunch;
6. Personal dictionary removal makes the word eligible again;
7. disabling clears marks immediately and persists; enabling restores them;
8. changing UK/US language rechecks both visible split panes;
9. a stale slow response cannot decorate a newer model;
10. a forced dictionary/worker failure produces one toast while editing and saving still work.

### Packaging and offline guards

- A packaged-asset test proves both dictionary pairs and required licence notices are present.
- A static/runtime guard fails if the spell worker initiates network access or Electron's dictionary
  download APIs are enabled.
- The built application is launched with network unavailable and the primary correction workflow
  still passes.

### Falsification

Each cross-cutting guard is deliberately broken, observed red, then restored:

| Guard | Break | Expected red |
|---|---|---|
| Markdown exclusions | stop masking fenced code | fenced-code smoke/unit assertion |
| Stale results | remove model-version check | old result decorates the replacement model |
| Offline assets | remove one packaged dictionary | packaged-asset test |
| Persistence honesty | update UI before failed save resolves | failed-write smoke/unit assertion |
| File-type scope | treat all models as eligible | code-buffer smoke assertion |

The claimed smoke coverage must identify the assertion that fails; opening a context menu or seeing
any decoration alone is not evidence that the intended path was reached.

## Sequencing constraints for the later implementation plan

1. Prove the engine and dictionary assets can build inside the existing Electron 31/Vite renderer
   worker before designing around package assumptions.
2. Build and falsify pure Markdown/word-range tests before Monaco integration.
3. Add the store and guarded IPC before enabling **Add to personal dictionary** in the UI.
4. Integrate one pane, then make split-pane ownership explicit and test both.
5. Add Settings and personal-dictionary management after the controller behaviour is stable.
6. Run build, unit, and smoke gates; verify packaged assets and the offline guard.

No version bump, ROADMAP change, CHANGELOG entry, package, tag, merge, or release occurs inside the
implementation branch. Shipping later follows the repository's release checklist.

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| Dictionary work causes typing lag | Dedicated worker, debounce, unique-word checks, one in-flight job, newest-state coalescing |
| `nspell` maintenance cadence | Narrow `SpellEngine` adapter; package-compatibility proof is implementation task one |
| Markdown masker misses syntax | Length-preserving pure module with offset-heavy unit and falsification coverage |
| Dynamic suggestions tempt private Monaco APIs | Use the public code-action provider and controller issue registry; accept Monaco's standard Quick Fix presentation |
| Personal dictionary becomes irreversible | Settings manager supports review and removal |
| Installer growth | Ship only two English dictionary variants in v1; record size during packaging review |
| Future code checker becomes tangled with prose | Reuse controller/decoration interfaces only; give CSpell-based code extraction its own feature and spec |

## Future code-aware spell check

A later code checker should be designed separately around CSpell or an equivalent code-aware engine.
It may reuse the controller's scheduling, decoration, persistence, and correction-action contracts,
but it must define its own eligibility, identifier splitting, language dictionaries, project config,
and ignore rules. It must not silently expand this prose checker's scope.

## Open questions

None. The product scope, offline constraint, locale behaviour, UX surfaces, engine direction, failure
behaviour, and verification requirements were decided during brainstorming and are recorded above.
