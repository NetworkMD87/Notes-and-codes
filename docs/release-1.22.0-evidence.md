# v1.22.0 release evidence — 2026-11-05

## Source and release status

Release preparation is authorised and in progress. Version 1.22.0 includes the
already-merged Libron font option (`5ecb902`), direct sanitized preview insertion
(`825c28f`), Windows smoke qualification and local strict test typing (`14b14b2`),
plus the November security dependency patches. No new product settings or defaults
were introduced in the security batch.

The version is bumped before packaging. The release tag must be created after
validation, and the installer/portable artifacts built once from that tag.
Publication, hashes and final packaged checks will be recorded here after they
are observed. Installed-app replacement remains for the owner to perform.

## Security dependency qualification

| Component | Previous lock | Qualified lock |
| --- | --- | --- |
| Markdown-it | 14.3.1 | 14.3.3 |
| DOMPurify | 3.4.16 | 3.4.17 |
| Electron | 43.7.7 | 43.8.4 |
| Vite | 7.3.6 | 7.3.7 |
| Vitest and matching siblings | 4.1.11 | 4.1.12 |
| Undici, both branches | 6.29.0 / 7.30.0 | 6.29.1 / 7.30.1 |
| fast-uri | 3.1.8 | 3.1.9 |

Fifteen existing package-version resolutions changed, with no added/removed lock
paths or new overrides. All changes stay within existing major branches. The
seven-day npm release-age safeguard remains **7**; newer Electron 43.x and Undici
patches inside that window were not selected. Existing HTTP-cache 4.2.0 and
sprintf-js 1.1.3 were retained; previous rejected candidates were not requalified.

Opened or pasted Markdown reaches synchronous `md.render()` before DOMPurify, in
both fragment previews and string HTML/PDF exports. The
[isolated reference-parser regression](../tests/unit/markdownReferenceSecurity.test.ts)
reaches the affected block/reference rule directly: both unclosed-label and
unclosed-title cases failed against 14.3.1 at the five-second limit, then passed
with 14.3.3. The worker is resource-bounded and always terminated. Recovery-heading,
valid-reference and retained-text assertions reject truncation or reference-rule
disabling. This proves the affected parser stage; it does not establish that an
arbitrarily enormous DOM preview is responsive.

The [renderer checks](../tests/unit/markdownRender.test.ts) preserve multiline
reference links/titles, task checkboxes, escaped raw HTML, straight quotes and
sanitization in both output modes. Raw HTML and typographer stay disabled; no
special DOMPurify modes were introduced. The imported handoff reversed Markdown
alerts #1/#5: #1 requires `typographer:true`; #5 requires `html:true`. Neither is
enabled. The three reported special DOMPurify exploit conditions also remain
absent; a package match alone did not prove reachable XSS.

## Validation before release preparation

- Build/typecheck passed. All **1,117 unit tests in 102 files** passed, including
  existing downloader/proxy compatibility tests. Final strengthened parser/renderer
  coverage then passed **20 focused tests**; strict test typing passed afterward.
- Six development Electron checks and three isolated unpacked-app checks passed
  without retries. Coverage included runtime identity **43.8.4**, renderer sandbox,
  clipboard/HTTPS-only external-link IPC, remembered picker folders across restart,
  actual HTML/PDF export, popup/navigation denial, preview safety/editing/scroll,
  and synthetic Monaco paste/save without touching the owner's Windows clipboard.
- The first sandboxed proxy run had seven `EACCES` loopback failures; the normal
  permission full run passed without changing those tests. An initial oversized
  DOM regression fixture hit its memory limit after the parser fix; the final
  guard isolates reference parsing rather than conflating it with large-preview
  DOM allocation. Both unsuccessful checks are retained as qualification limits.
- Independent static investigation and candidate review found no concrete
  surviving bypass or compatibility regression. The coordinator checked and ran
  the later paste-only test. No broad repeat of the full desktop suite was needed.
- The prior unpacked QA build was version 1.21.3 with the new dependencies, not a
  release artifact. Its identity/results were retained and its exact task-created
  package directory removed after confirming no matching processes remained.

## Remaining advisories and acceptance limits

The 5 November npm audit reports **zero production warnings** and **six moderate
full-tree entries**, all from one minimatch advisory and its packaging parents;
there are no high or critical entries. Electron ships despite being a development
dependency, so the production-only audit is not the whole runtime check.

Minimatch 10.2.6/nested 9.0.9 remain. The
[advisory](https://github.com/advisories/GHSA-g3hv-75wg-m249) lists 11.0.1 as the fix
and requires optimization level 2+ plus an attacker-controlled pattern. Inspected
packaging callers use the default level 1. Eligible app-builder-lib 26.18.1 still
requests minimatch ^10.2.5 and universal 2.0.3. No forced major override, builder
downgrade, warning suppression or dismissal was used. Revisit on a compatible
upstream fix or changed input/configuration.

The imported 28-alert ledger is a historical snapshot. Local patched package
versions address 27 records; remote alert closure is not implied before source
delivery is observed. Earlier HTTP-cache/proxy qualification decisions remain
separate and unchanged, even though the current npm feed omits those old matches.

Executables retain the existing unsigned distribution status. Native installer
interaction, owner-installed replacement, real Windows clipboard/pickers,
tray/hotkey behavior and intercepted-TLS exploitation were not manually exercised.
Large-preview sanitization/layout remains partial P2 work; the parked installed
taskbar identity issue remains open. No owner acceptance is inferred from tests.

## Release-candidate checks

- After bumping to 1.22.0, the final unit suite passed **1,118 tests in 102 files**
  (34.78 seconds). Strict test typing passed, including the optional packaged
  executable route added to the existing Libron smoke test.
- The updated Libron test passed against the development app on its first test
  attempt (4.4 seconds), verifying offline faces, both editor panes, interface font
  and restart persistence. An approval-review timeout prevented the first command
  from starting; the permitted retry ran successfully and did not change the test.
- The roadmap was shortened, raw task bookmarks replaced by ordinary heading
  anchors, and completed dependency/CI chronology retained in
  [the roadmap archive](roadmap-archive.md). Previously committed preview/type
  work is no longer described as uncommitted. Open gates and prior failures remain.
- Earlier successful build and focused app checks are reused where source is
  unchanged; packaging will rebuild from the new version's tag. No full desktop
  suite rerun is implied.
