# Task 1 report — engine and dictionary assets

## Implementation

Installed and locked `nspell@2.1.5`, `dictionary-en@4.0.0`, and
`dictionary-en-gb@3.0.0`. Added shared spell contracts, canonical raw asset
aliases (with derived `?raw` aliases for Vite's exact-alias matching), bundled
US/UK dictionaries, and the narrow `NspellEngine` adapter. The proof build
embeds both dictionaries in an ES renderer bundle and has no executable
network/download dependencies.

## TDD evidence

- RED: `npm test -- spellEngine` failed because `spellEngine.ts` did not exist.
- GREEN: focused engine suite passed 7 tests.
- RED: `npm test -- spellAssets` failed because required notice headings were absent.
- GREEN: asset suite passed 3 tests.
- Approved verifier correction RED: importing the script failed with its CLI usage guard.
- GREEN: `npm test -- verifySpellAssets` passed 6 fixtures: a legal-comment URL
  passes; executable `https://`, `fetch`, `XMLHttpRequest`, `WebSocket`, and
  `setSpellCheckerDictionaryDownloadURL` each fail.

## Falsification

Temporarily mapping en-GB to US assets made `spellEngine` fail the UK `colour`
assertion and proof fail the `colour` dictionary sentinel. Restoring the GB map
made both gates pass.

## Final verification

`npm test` passed (50 files / 406 tests); `npm run build` passed; proof mode
passed (1,124.50 kB emitted); `npm ls nspell dictionary-en dictionary-en-gb`
exited successfully with one installed copy each.

## Approved plan ruling

Vite preserves `is-buffer`'s legal comment containing `https://feross.org`.
The verifier now strips JavaScript comments before scanning URLs, but scans
strings and executable tokens unchanged; focused fixtures prove the distinction.

## Self-review and concerns

Renderer imports only raw text assets and the browser-compatible engine; no Node
shim, runtime read, or network path was added. `verify:spell-assets --app` is
deliberately dormant until Task 5 emits the production spell worker.

## Fix round 1/5

Fixed personal-word lookup to consult its normalized map before Hunspell; the
regression proves an added lowercase word permits uppercase input. The verifier
now recognizes regex literals while removing comments, so a regex containing
`//` cannot conceal a subsequent `fetch`; fixtures cover it plus all forbidden
network APIs and Node/runtime filesystem import forms. Proof scans these forms
in generated output, and package notices now contain verbatim installed UK and
US dictionary licence text, asserted byte-for-byte by the asset test.

Commands and results: `npm test -- spellEngine verifySpellAssets spellAssets`
(3 files, 20 tests passed); `node scripts/verifySpellAssets.mjs --proof`
(passed); `npm run build` (passed); `npm test` (50 files, 410 tests passed).
Changed: spell engine, verifier, engine/verifier/asset tests, third-party
notices, and this report. Self-review: no renderer Node APIs added; scanner
retains regex/string contents and rejects executable network/Node tokens.

## Fix round 2/5

Replaced the comment heuristic with TypeScript's JavaScript parser: actual
comment ranges are removed while regex literals (including return-position and
minified forms) remain executable input. The verifier now walks parsed import,
dynamic-import, and require nodes for all Node builtins, and proof mode uses
Vite/Rollup output metadata to reject any static or dynamic external imports.
Regressions cover return regexes followed by fetch, bare `fs` imports, and
`node:child_process` imports. Commands: focused three suites passed (24 tests);
proof passed; build passed; full unit suite passed (50 files / 414 tests).

## Fix round 3/5

Replaced the hand-maintained builtin list with `builtinModules` from
`node:module`, normalizing both bare and `node:` forms and builtin subpaths.
Added an `import "async_hooks"` regression. Exact verification: focused
`verifySpellAssets` passed (1 file / 14 tests); proof mode passed; production
build passed; full unit suite passed (50 files / 415 tests). Files changed:
`scripts/verifySpellAssets.mjs`, its focused test, and this report. Self-review
found no changes outside the requested builtin-source replacement.
