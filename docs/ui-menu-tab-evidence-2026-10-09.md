# U1/U3 local implementation evidence — 2026-10-09

Owner approved the in-chat behaviour for both items and initially authorised implementation and focused checks with no commit or push. After that local handoff, the owner authorised a PR, CI, merge only if green, and deletion of the merged work branch. That phase retained version 1.21.2; the subsequent approved **v1.21.3** release is recorded in [release evidence](release-1.21.3-evidence.md).

## Implemented behaviour

- **U1:** shared themed menus prefer the supplied pointer/keyboard anchor, flip left/up if needed, then clamp inside an 8px viewport gap. CSS bounds width/height, wraps long labels and scrolls oversized menus. Keyboard navigation reveals the focused item; Escape/outside/action dismissal and connected-opener restoration remain. Resize closes the menu. Placement measures untransformed layout size, rounded outward; the opening animation fades without moving beyond the bounds.
- **U3:** saved files with case-insensitive filename collisions show the shortest distinguishing trailing directory path, including drive or UNC host/share where necessary. Labels recalculate on open/close/rename/Save As. All saved tabs expose their full path in tooltips and accessible labels; dirty tabs add “Unsaved changes,” preserving the visible dot. Untitled tabs retain their names. Close buttons identify their file.
- Bounded tabs reserve separate filename/folder space. Common folder prefixes and remaining text can ellipsize while a distinguishing character remains visible; natural sizing retains the full folder label. Prefix matching uses original Unicode code points, including lowercase expansions and surrogate pairs, and protects a character when one folder name is another's prefix. Full paths remain available when visible text truncates.
- Typing updates retain existing nodes, focus and strip scroll; unchanged dirty-tab metadata causes no repeated DOM mutations.

## Passing checks

| Check | Result |
| --- | --- |
| `npm run build` | Final typecheck and main/preload/renderer build passed. |
| `npm test -- tabBar tabLabels rendererContextMenu` | 29 tests passed across 3 files after the final logic changes. |
| `context-menu-placement.spec.ts` | Four distinct local Electron cases passed: toolbar placement/scroll/focus/resize, initially long recent-folder labels, folder row edge placement and spelling menus. |
| `tab-labels.spec.ts` | Two local Electron cases passed: geometry/themes/natural sizing/dirty labels/keyboard close; actual open/rename/Save As identity changes. |
| `tab-sizing.spec.ts`, `tab-typing.spec.ts`, `tabs.spec.ts` | Five existing cases passed: bounded/natural sizing, 100-tab typing node/scroll/focus retention, badge colours and keyboard/split-view tab operations. |
| Visual inspection | Real Electron header captures inspected at 800px and 1400px; distinguishing folder characters visible. |
| Independent review | Sol reviewer confirmed menu animation fix and folder-prefix/Unicode fixes; no remaining findings in the focused source review. |
| Document/diff checks | Scoped diff and whitespace checked; roadmap evidence links and U1/U3 anchors verified. |

Smoke tests use isolated `--user-data-dir` fixtures, `NC_HEADLESS`, and the existing guarded Save As path seam. No new production test seam was added. Commands clear `ELECTRON_RUN_AS_NODE` before launch and preserve the configured retries. The menu tests also assert focused rows lie within their scrolling viewport, not merely that scroll occurred.

Executed smoke commands (all with `--workers=1`):

```powershell
Remove-Item env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
npx playwright test tests/smoke/context-menu-placement.spec.ts tests/smoke/tab-labels.spec.ts tests/smoke/tab-sizing.spec.ts tests/smoke/tab-typing.spec.ts tests/smoke/tabs.spec.ts --workers=1
npx playwright test tests/smoke/context-menu-placement.spec.ts tests/smoke/tab-labels.spec.ts --grep 'folder row|duplicate tabs reserve|opening, renaming' --workers=1
npx playwright test tests/smoke/tab-labels.spec.ts tests/smoke/tab-sizing.spec.ts tests/smoke/tab-typing.spec.ts tests/smoke/tabs.spec.ts --workers=1
npx playwright test tests/smoke/tab-labels.spec.ts --grep 'duplicate tabs reserve' --workers=1
```

The eleven distinct smoke cases passed across the initial run and focused reruns, including reruns after relevant tab changes; this is not a claim of one clean full-suite run. Unaffected passing checks were retained.

## Retained failures and corrections

- Restricted-sandbox Vitest runs failed before test collection with temporary-cache rename `EPERM`. Focused tests ran successfully with normal filesystem permissions; this was not counted as a passing test attempt.
- The initial eleven-case smoke run had nine passes and two failures, including configured retries. A test-positioned folder row sat behind the status bar, so the pointer click never opened its menu; assigning that fixture row a stacking order below the menu corrected the setup. The rename test expected backslashes, while the existing rename route supplies a valid mixed-separator path; its comparison now normalises separators without changing production path handling. The corrected three-case rerun passed.
- Visual inspection exposed indistinguishable clipped common folder prefixes. The subsequent refinement received additional review and fixed complete-prefix and Unicode-boundary cases. A narrow-layout guard then showed only 7.2875px available for the distinguishing suffix; another measured the protected glyph clipping by about 0.86px. Separate protected-character rendering and tighter separator spacing corrected the layout. These failed attempts are retained as failures, not passing coverage.
- The final shorter-folder geometry assertion initially rejected a roughly 0.000006px difference at adjoining fractional DOM rectangles. A 0.01px tolerance handles rounding; the earlier 0.86px clipping still fails it. The final targeted layout case passed, including natural sizing, themes and keyboard close, with screenshots inspected.
- Guard falsification: disabling menu placement made its edge regression fail; returning no folder labels made all four original path-label tests fail. Both temporary changes were restored, followed by passing focused unit runs.

## Limits and cleanup

Implementation-phase evidence is local source/unit and real Electron development-build verification. Full unit/smoke suites, hosted CI, installer/package replacement, physical Windows scaling/theme settings and manual Narrator/owner acceptance were not performed during that phase. CI delivery is recorded separately below. This work does not close U2's folder-tree keyboard navigation or any release gate.

Task-started build/test/Electron processes exited through the normal commands and smoke cleanup. Final process inspection found no remaining task build/test process; the pre-existing CodeGraph helper was preserved. No staging, branch/history changes, commits, pushes or remote changes were performed during the initial implementation phase.

## CI-gated delivery

The owner authorised PR delivery on 2026-10-09, conditional on passing CI before merging and deleting the merged work branch. [PR #39](https://github.com/NetworkMD87/Notes-and-codes/pull/39) records delivery; its Checks and merge record provide the authoritative hosted results. Automatic Windows CI runs build/typecheck and the full unit suite. Hosted Electron smoke remains manual-only; local focused smoke evidence above is retained separately. Installer packaging, version bump, tag and executable release are outside this delivery scope.

PR #39 and merged-master CI passed all 1,091 unit tests; the work branch was deleted. The owner then separately authorised the v1.21.3 executable release, now published with installer and portable assets. [Release verification and remaining limits](release-1.21.3-evidence.md).

- Initial hosted CI passed build/typecheck but failed two existing `chromeCss` guards (1,087 tests passed, 2 failed): `#ctx-menu` appeared twice as a standalone rule. Consolidating its opacity-only animation into the original rule preserves behaviour and the single-rule guard.
- Automated PR review identified truthy non-string `filePath` values admitted by corrupt session data. Two new regressions failed with `replaceAll is not a function` before the fix. Folder grouping and tab identity now ignore malformed paths without changing buffer content; the 54-case focused run including `chromeCss`, `tabBar`, `tabLabels` and `rendererContextMenu` passed. Independent review found no remaining issue in these corrections.
- After these corrections, `npm run build` passed again and all six cases in `context-menu-placement.spec.ts` and `tab-labels.spec.ts` passed in one local Electron run (14 seconds). The prior five existing smoke cases remain retained evidence because the corrections do not change their exercised behaviour.
