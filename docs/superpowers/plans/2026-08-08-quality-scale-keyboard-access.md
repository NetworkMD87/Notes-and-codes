# Quality, Scale & Keyboard Access Implementation Plan Suite

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the approved Phase 4.6 accessibility, workspace responsiveness, search/recovery efficiency, and scoped Find in Files work as one release-ready v1.19.0 product pass.

**Architecture:** Four focused plans execute in dependency order on one feature branch. Each slice introduces and tests its own pure primitives before DOM or IPC integration, receives a fresh slice review, and leaves the branch green. The umbrella closes with whole-branch review and release-readiness evidence; actual version/tag/package/publish bookkeeping is run through the repository's `release-checklist` skill only after the implementation is approved.

**Tech Stack:** Electron 31, TypeScript, Monaco, imperative DOM, Node filesystem services, typed IPC/preload bridge, Vitest, Playwright Electron smoke tests, electron-builder on Windows.

## Global Constraints

- Approved design: `docs/superpowers/specs/2026-08-08-quality-scale-keyboard-access-design.md` at commit `5762ad8`.
- Work stays on `feat/quality-scale-keyboard-access` (or an isolated worktree created from it); never implement directly on `master`.
- Execute the four plans in order because later plans consume interfaces introduced earlier.
- One bundled v1.19.0 release; no slice version bump, tag, package publication, or independent release.
- Keep `contextIsolation:true`, `nodeIntegration:false`, `sandbox:true`, the typed IPC boundary, guarded handler wrappers, and renderer/main import separation.
- Preserve atomic storage, literal search, encoding detection, dirty-buffer precedence, Windows path folding, result caps, and one-owner-per-keybinding.
- Use focused red/green cycles, falsify every cross-cutting guard, review every task, review each slice, then review the whole branch.
- Run smoke tests from a successful build with `ELECTRON_RUN_AS_NODE` cleared and normal configured retries unless a plan explicitly tests retry-free determinism.
- Do not implement Safe Replace in Files, MSIX, snippet tabstops, regex search, `.gitignore` parsing, lazy pane B, or parallel file reads in this suite.

## Plan order

1. `2026-08-08-quality-scale-keyboard-access-1-accessible-surfaces.md`
2. `2026-08-08-quality-scale-keyboard-access-2-workspace-responsiveness.md`
3. `2026-08-08-quality-scale-keyboard-access-3-search-recovery-efficiency.md`
4. `2026-08-08-quality-scale-keyboard-access-4-scoped-find-in-files.md`

---

### Task 1: Establish the baseline and execution ledger

**Files:**
- Create: `.superpowers/sdd/quality-scale-keyboard-access.md` (git-ignored execution ledger)
- Verify: `package.json`, `package-lock.json`, current branch/worktree

**Interfaces:**
- Consumes: clean feature branch containing only approved planning documents.
- Produces: reproducible baseline evidence and one ledger used by all four slice plans.

- [ ] **Step 1: Confirm repository state**

Run:

```powershell
git branch --show-current
git status --short --branch
git log -3 --oneline --decorate
```

Expected: `feat/quality-scale-keyboard-access`; no unrelated worktree changes; design/plans are committed.

- [ ] **Step 2: Record the current gates**

Run:

```powershell
npm run typecheck
npm test
npm run build
```

Expected: all PASS. Record exact test-file/test counts and commit SHA in `.superpowers/sdd/quality-scale-keyboard-access.md`.

- [ ] **Step 3: Run a representative smoke baseline**

Run:

```powershell
Remove-Item env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
npx playwright test tests/smoke/settings.spec.ts tests/smoke/tabs.spec.ts tests/smoke/palette.spec.ts tests/smoke/find-in-files.spec.ts tests/smoke/clean-quit.spec.ts
```

Expected: PASS with normal configured retries. Record any retry separately rather than describing the whole run as clean.

- [ ] **Step 4: Start the execution ledger**

Create this initial structure with `apply_patch`:

```markdown
# Phase 4.6 execution ledger

- Baseline SHA: `<exact SHA from git rev-parse HEAD>`
- Baseline typecheck: PASS
- Baseline unit: `<exact files/tests>`
- Baseline build: PASS
- Baseline focused smoke: `<exact result and retries>`

## Slice status

- [ ] 1 Accessible surfaces
- [ ] 2 Workspace responsiveness
- [ ] 3 Search/recovery efficiency
- [ ] 4 Scoped Find in Files
- [ ] Whole-branch review
- [ ] Release readiness
```

The ledger is scratch evidence, not a committed product document; substitute actual values, never placeholders.

---

### Task 2: Execute and review accessible surfaces

**Files:**
- Plan: `docs/superpowers/plans/2026-08-08-quality-scale-keyboard-access-1-accessible-surfaces.md`
- Ledger: `.superpowers/sdd/quality-scale-keyboard-access.md`

**Interfaces:**
- Produces: dialog/focus primitive, semantic Settings/overlays/menus/tabs/status selectors/palette, and accessible smoke coverage consumed by the remaining overlay work.

- [ ] **Step 1: Execute every checkbox in Plan 1**

Use a fresh implementer context per task. Require the implementer to return changed files, red/green commands, falsification evidence, and commit SHA.

- [ ] **Step 2: Run Plan 1's complete slice gate**

Run the exact unit, build, and focused smoke commands in Plan 1. Do not substitute a broad passing suite for a missing focused assertion.

- [ ] **Step 3: Request a fresh slice review**

Review the accumulated Plan 1 diff against design sections A1-A7. Resolve every Important/High issue and rerun the affected focused gate.

- [ ] **Step 4: Update the ledger**

Record the Plan 1 terminal SHA, exact automated results, falsifications observed red, reviewer findings/fixes, and any normal-configured smoke retry.

---

### Task 3: Execute and review workspace responsiveness

**Files:**
- Plan: `docs/superpowers/plans/2026-08-08-quality-scale-keyboard-access-2-workspace-responsiveness.md`
- Ledger: `.superpowers/sdd/quality-scale-keyboard-access.md`

**Interfaces:**
- Consumes: accessible Settings controls/dialog from Plan 1.
- Produces: `pathGlob` contract, `WorkspaceFilter`, exclusion settings, cancellable-compatible `walkFiles`, candidate cache/ranker, refresh scheduler, 20,000-file fixture/benchmark.

- [ ] **Step 1: Execute every checkbox in Plan 2**

Preserve the exact public interface names because Plans 3-4 consume them. If implementation evidence requires an interface change, update all dependent plan documents in the same commit before proceeding.

- [ ] **Step 2: Capture before/after benchmark evidence**

Use the plan's deterministic fixture/checksum. Record hardware context, baseline/optimized p50 and p95, and result checksum in the ledger. Quick Open p95 must be below 50 ms on the release machine.

- [ ] **Step 3: Run Plan 2's complete slice gate and review**

Resolve all review findings, rerun affected tests, and record the terminal SHA/evidence in the ledger.

---

### Task 4: Execute and review search/recovery efficiency

**Files:**
- Plan: `docs/superpowers/plans/2026-08-08-quality-scale-keyboard-access-3-search-recovery-efficiency.md`
- Ledger: `.superpowers/sdd/quality-scale-keyboard-access.md`

**Interfaces:**
- Consumes: workspace glob/filter/walk interfaces from Plan 2.
- Produces: traversal cancellation, incremental matcher, latest session writer, preview scheduler, independent startup read fallbacks, and profiling evidence.

- [ ] **Step 1: Execute every checkbox in Plan 3**

Keep cancellation's main-process generation counter independent from renderer `searchId`, preserving HMR/reload safety.

- [ ] **Step 2: Record evidence-gated non-changes**

Record serial file-read and pane-B startup measurements. State explicitly that parallel reads and lazy pane B were not implemented. If either is still dominant, stop and request the separately approved design amendment required by the spec.

- [ ] **Step 3: Run Plan 3's complete slice gate and review**

Resolve all review findings, rerun affected tests, and record the terminal SHA/evidence in the ledger.

---

### Task 5: Execute and review scoped Find in Files

**Files:**
- Plan: `docs/superpowers/plans/2026-08-08-quality-scale-keyboard-access-4-scoped-find-in-files.md`
- Ledger: `.superpowers/sdd/quality-scale-keyboard-access.md`

**Interfaces:**
- Consumes: accessible dialog controls, shared workspace globs/filtering, cancellation, and incremental matching.
- Produces: deterministic shared scope model, disk/live scope application, accessible session-local fields/summary, and edge-path smoke coverage.

- [ ] **Step 1: Execute every checkbox in Plan 4**

Require the same `SearchScope` instance/values to drive renderer buffer filtering and the main request. A visible summary that is not connected to effective search behavior is a release blocker.

- [ ] **Step 2: Run Plan 4's complete slice gate and review**

Resolve all findings, rerun affected tests, and record the terminal SHA/evidence in the ledger.

---

### Task 6: Whole-branch integration review and release readiness

**Files:**
- Modify after verification: `ROADMAP.md`
- Modify after verification: `CHANGELOG.md`
- Modify if commands/shortcuts changed: `src/renderer/helpContent.ts`
- Verify: `package.json`, `package-lock.json`
- Ledger: `.superpowers/sdd/quality-scale-keyboard-access.md`

**Interfaces:**
- Consumes: all four completed slice commits and their evidence.
- Produces: reviewed, documented, release-ready Phase 4.6 branch. Release mechanics remain delegated to `release-checklist`.

- [ ] **Step 1: Request a whole-branch review against the approved design**

Review `master...HEAD`, not only the last task. Require an explicit requirement-by-requirement check for design sections A-D, global constraints, failure policies, and every falsification row.

- [ ] **Step 2: Resolve review findings with focused red/green cycles**

Each fix gets its own focused regression and commit. Re-run the owning slice gate after every behavior change.

- [ ] **Step 3: Run the full automated gates**

```powershell
npm run typecheck
npm test
npm run build
Remove-Item env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
npm run test:smoke
git diff --check master...HEAD
```

Expected: all terminal PASS. Report retries and failures by exact run/commit; a later green run does not erase an earlier failure.

- [ ] **Step 4: Run performance verification**

Run the committed 20,000-file benchmark on the release Windows machine. Confirm Quick Open p95 below 50 ms and record filesystem/search timings without inventing CI thresholds.

- [ ] **Step 5: Update product documentation only after gates pass**

Use `apply_patch` to:

- mark Phase 4.6 items 1-4 complete in `ROADMAP.md`;
- move Safe Replace out of Phase 4.6 so the visible order is Phase 4.6 → MSIX → Safe Replace → snippet tabstops;
- add a user-facing v1.19.0 section to `CHANGELOG.md`; and
- confirm `helpContent.ts` lists `Ctrl+PageUp`/`Ctrl+PageDown` and any new accessible command names.

Do not change `package.json` yet; the release checklist owns the bump-before-tag-before-package sequence.

- [ ] **Step 6: Re-run documentation/type gates and commit readiness docs**

```powershell
npm run typecheck
npm test -- helpContent types
git diff --check
git add ROADMAP.md CHANGELOG.md src/renderer/helpContent.ts
git commit -m "docs: prepare quality pass release notes"
```

Stage `helpContent.ts` only if changed. Expected: PASS and one focused documentation commit.

- [ ] **Step 7: Perform manual packaged-build checks before release**

Run `npm run package`, then inspect the packaged build keyboard-only and with Windows Narrator:

- Settings category/control names, state, focus trap/return, and hotkey recorder Escape;
- tabs, close buttons, `Ctrl+PageUp`/`Ctrl+PageDown` in single/split view;
- Command Palette fuzzy id/hint matching and announcements;
- app-owned custom menu keyboard operation while Monaco retains `Shift+F10`;
- encoding/EOL selectors and actual saved bytes/newlines;
- 20,000-file Quick Open responsiveness and workspace-exclusion refresh;
- search cancellation, scope summary, includes/excludes, dirty/open/untitled behavior;
- newest session restore and Markdown preview freshness; and
- tray/hotkey/launch-on-login regression checks.

Record exact observed results in the ledger.

- [ ] **Step 8: Invoke the release workflow**

Only after whole-branch approval and manual checks, invoke the repository's `release-checklist` skill. It owns version bump, annotated tag, tag-before-package rebuild, artifact verification, publication, CI inspection, merge, and cleanup. Do not reconstruct those steps from this plan.

---

## Execution completion

The implementation suite is complete only when all four slice boxes, whole-branch review, automated gates, benchmark, and manual packaged checks are recorded as passing. A branch that is merely code-complete is not release-ready.
