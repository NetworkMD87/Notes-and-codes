---
name: release-checklist
description: Use when work ships — a feature or fix lands on master, a version is bumped, an installer is packaged, or a vX.Y.Z tag / GitHub release is cut. Covers the mandatory ROADMAP tick, CHANGELOG entry, version-bump ordering, and tag-before-package rule for Notes & Codes.
---

# Release bookkeeping — DO NOT SKIP

When work ships (a feature/fix lands on `master`):

1. **Tick the ROADMAP.** Update `ROADMAP.md`: change the shipped items' ⬜ → ✅, and roll a
   fully-finished phase up into the **Shipped** section. The roadmap is the source of truth
   for status — keep it current. Watch for status text that goes stale silently: "in review",
   "PR #N", "tag still outstanding" all need a second pass **after** the release actually happens.
2. **Add a `CHANGELOG.md` entry.** A `## [x.y.z] — YYYY-MM-DD` section with an italic one-line
   summary, then Added / Changed / Fixed. Write it for **users**, not reviewers — describe the
   behaviour they'll notice, not the internals. The GitHub release notes are derived from it.
3. **Bump the version when a release is cut.** Update `version` in `package.json`
   (`npm version <x.y.z> --no-git-tag-version`): **patch** for fixes (e.g. 1.0.0 → 1.0.1),
   **minor** for features (1.0.x → 1.1.0). Then `npm run package` to rebuild the installer,
   and tag `vX.Y.Z` **only after** the manual tray/hotkey checklist passes on the real build.
   **Bump BEFORE packaging, always** — `npm run package` names its output from `package.json`, so
   packaging at an already-released version silently overwrites that release's artifacts in `dist/`
   with different bytes under the same filename. Re-uploading one later would ship a binary that
   isn't what was tagged. Build eyeball/test copies at the *new* version for the same reason.
4. **Release from the tagged commit.** Tag first, then `npm run package`, so the uploaded artifacts
   are built from exactly what `vX.Y.Z` points at — not from a branch build made a few commits
   earlier.
