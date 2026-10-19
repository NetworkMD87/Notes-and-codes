# Markdown preview performance — 2026-10-19

## Outcome and scope

The approved local batch is implemented and validated, uncommitted. The preview now inserts a fresh sanitized `DocumentFragment` instead of serializing sanitized nodes to HTML and immediately parsing that HTML again. The existing string renderer remains the HTML/PDF export path. Markdown syntax, sanitization rules, link handling, task checkboxes, preview modes, debounce, focus and scroll behavior are unchanged.

This is a partial improvement to P2, not a solution for arbitrarily large documents. Sanitization and layout still block the renderer. No size threshold, preview-disable policy, new control, dependency update, release or installed-app replacement was introduced.

Base checkout: `9c21aa461c9089c1f4634fd8a17a5e9118d222bd`. Existing S3 documentation changes were present before this work and preserved. No staging, commit, branch mutation, push, hosted CI or packaging occurred.

## Electron measurement

The opt-in [profiling test](../tests/benchmark/markdownPreview.spec.ts) copies the built app into a fixture-owned temporary directory and instruments that copy's renderer. It uses the normal Electron app, source-file opening, toolbar preview mode and real preview panel. It neither modifies the original build nor changes CSP or rendering mode. Instrumentation fails if expected renderer functions are not found. Fixture cleanup owns the copied app and its isolated profiles.

Fixtures contain headings, formatted paragraphs, links, task lists and tables. Each size gets a fresh app/profile, one first activation and two subsequent activations. The complete end marker must appear, and exactly one render sample must be captured per activation. Parse means Markdown-to-HTML generation; sanitize includes DOMPurify's output conversion; insert is the remainder of `renderNow` (including old-node removal). `render` is parse + sanitize + insertion, not an additional stage. Reading `scrollHeight` then forces layout.

These measurements exclude earlier mode/menu/editor layout work and browser paint. They measure preview activation/replacement, not input latency after the 150 ms debounce. The first sample and later warm samples are reported separately below. Three samples per fixture are bounded local evidence, not a statistically robust benchmark or universal speed guarantee. The previous Node/jsdom estimate of roughly 2.4 seconds for a synthetic 500 KiB document remains historical evidence, not an Electron baseline.

All times below are milliseconds, rounded to one decimal; byte counts are UTF-8 source size.

| Implementation | Bytes | Activation | Parse | Sanitize | Insert | Render | Forced layout | Total |
| --- | ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Baseline | 51,368 | first | 33.7 | 43.3 | 9.0 | 86.0 | 54.4 | 140.4 |
| Baseline | 51,368 | warm 1 | 14.0 | 38.6 | 14.5 | 67.1 | 34.8 | 101.9 |
| Baseline | 51,368 | warm 2 | 9.0 | 37.0 | 13.3 | 59.3 | 35.0 | 94.3 |
| Fragment | 51,368 | first | 32.0 | 45.7 | 2.4 | 80.1 | 51.8 | 131.9 |
| Fragment | 51,368 | warm 1 | 15.2 | 38.0 | 6.7 | 59.9 | 35.3 | 95.2 |
| Fragment | 51,368 | warm 2 | 10.2 | 36.3 | 6.6 | 53.1 | 35.3 | 88.4 |
| Baseline | 512,044 | first | 145.2 | 391.4 | 92.1 | 628.7 | 483.9 | 1112.6 |
| Baseline | 512,044 | warm 1 | 95.4 | 397.5 | 130.0 | 622.9 | 316.8 | 939.7 |
| Baseline | 512,044 | warm 2 | 114.2 | 430.3 | 129.8 | 674.3 | 315.4 | 989.7 |
| Fragment | 512,044 | first | 132.5 | 380.4 | 29.2 | 542.1 | 489.2 | 1031.3 |
| Fragment | 512,044 | warm 1 | 91.2 | 365.6 | 70.1 | 526.9 | 482.6 | 1009.5 |
| Fragment | 512,044 | warm 2 | 111.1 | 355.1 | 76.1 | 542.3 | 335.2 | 877.5 |

For the large fixture, insertion fell from 92.1–130.0 ms to 29.2–76.1 ms. Median render work fell from 628.7 to 542.1 ms (about 14%). Total including layout was variable: median 989.7 ms before versus 1009.5 ms after. **A consistent overall latency improvement is not established.** The code removes a measured redundant parsing step, while large-document responsiveness remains unresolved.

Reproduce with a fresh build of the intended source revision, then:

```powershell
npm run build
Remove-Item env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
$env:NC_MARKDOWN_PROFILE_LABEL = 'current'
npx playwright test --config playwright.markdown-profile.config.ts --output test-results/markdown-profile-current
```

The test prints all samples and writes `markdown-profile.json` in its test output directory. It is outside the regular smoke/unit suites; no automatic benchmark or hosted gate was added. Baseline and optimized samples above are retained here from the successful local runs. The baseline run preceded the raw JSON file-write addition; its console/attachment payload supplied the baseline table.

## Validation and retained failures

- `npm run build`: passed, including production TypeScript checking and all three Electron bundles. The emitted production bundle has no profiling probes.
- `npm test -- markdownRender markdownPreview exportDoc`: **54 passed in four files**. Coverage includes fragment/string DOM parity, empty content, tasks/nesting, tables, code, Unicode, links, parser-output sanitization, failure/recovery, cancellation and unchanged export strings.
- Before implementation, the new guards produced **10 expected failures** against the old source; existing coverage remained green. The default-preview guard fails if preview insertion reparses HTML; the fragment identity guard fails if nodes are lost or cloned.
- Sanitizer falsification: temporarily bypassing DOMPurify in the new fragment renderer made `sanitizes parser output before returning live nodes` fail on the live `<script>` node. A `finally` block restored the exact source; SHA-256 before/after was `8C8FB194D790EE3EF53C381B302130F7FE1E425183EB9C06712D30D663D161C3`. The restored targeted test passed. No deliberately broken source remains.
- `npx playwright test tests/smoke/markdown-preview-render.spec.ts tests/smoke/markdown-preview-layout.spec.ts tests/smoke/markdown-authoring.spec.ts --workers=1`: the **10 existing tests passed first time**. They cover authoring, preview modes, focus, resizing, settings persistence/restarts, tab switching and untitled/Save As flows.
- The new render smoke test initially passed its application assertions but timed out at normal quit, including both configured retries. Its disposable file was still dirty, so `requestQuit()` correctly raised the native Save/Don't Save/Cancel dialog. The test now saves its fixture, verifies the exact disk content and clean accessible tab identity, then quits. The final exact-file run **passed in 2.6 seconds with no retry**, including normal exit. Across these runs, all **11 affected smoke tests have passing results**; this is not a full-suite run.
- The new Electron smoke assertions cover actual default fragment insertion (zero `innerHTML` assignments), safe tasks/links/raw HTML, table/Unicode output, completed edits, preserved editor focus and preview scroll, empty content, undo restoration and normal shutdown.
- Initial sandbox attempts could not launch Electron or rename Vitest temporary cache files; those were infrastructure failures before the relevant checks. Successful runs used normal desktop execution with isolated test profiles and `ELECTRON_RUN_AS_NODE` removed.
- Independent Sol reviewer found no actionable source/test/profiling issues. Review explicitly noted the measurement boundaries above. No installed-app, packaging, full smoke, hosted CI or owner acceptance is claimed.
- Final process/directory inspection found no task-owned Electron/build/test process or `notes-markdown-profile-*` / `notes-markdown-render-*` temporary directory remaining. The pre-existing CodeGraph service was retained. The two unrelated dependency evidence files retained their starting SHA-256 hashes; the existing S3 roadmap edits were preserved. Diff whitespace and new local evidence links/anchor checks passed.

## Remaining decision

P2 stays open. A size-based preview policy or broader large-file behavior requires owner agreement on when to limit work and what the user should see. No such policy was inferred from these measurements. Further technical work should use the retained profile to target sanitization/layout only when it can preserve existing behavior and demonstrate a benefit.
