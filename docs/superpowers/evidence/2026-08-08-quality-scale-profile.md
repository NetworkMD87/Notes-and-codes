# Quality, Scale & Keyboard Access Performance Profile

Profiled on 2026-08-09 from base commit `0d3f27fab0c608b410f82388f326a244278615ee`; the uncommitted benchmark measurement in this run is included in the evidence commit that adds this document.

## Environment

- Windows x64, kernel release `10.0.26200`
- AMD Ryzen 5 4600H with Radeon Graphics, 12 logical CPUs
- 33,711,730,688 bytes physical memory reported by Node
- Node `v26.3.1`, Vitest `v2.1.9`, Electron `31.7.7`
- Antivirus state: unknown. `Get-MpComputerStatus` was attempted but access was denied, so this profile does not assume that real-time scanning was enabled or disabled.
- The global npm shim is broken on this machine. The planned `npm run benchmark:workspace` script was executed through the installed npm CLI with:

```powershell
& 'C:\Program Files\nodejs\node.exe' 'C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js' run benchmark:workspace
```

## 20,000-file workspace and serial reads

The deterministic fixture contains 20,000 eligible TypeScript files plus one `dist` exclusion control. The serial profile consumes the exact `coldWalk.files` index, stats each path, applies the search service's 1 MiB eligibility cap, then awaits one `fs.readFile` before starting the next. It neither introduces nor exercises a read pool. Independent assertions require all 20,000 eligible files and the fixture's exact 617,780-byte content total, so a skipped or no-op read cannot satisfy the measurement.

Initial measurement:

```json
{
  "files": 20000,
  "coldWalkIndexMs": 494.89,
  "refreshMs": 455.27,
  "p95QueryMs": 25.99,
  "serialRead": {
    "totalMs": 16031.0794,
    "filesRead": 20000,
    "bytesRead": 617780
  },
  "candidateChecksums": {
    "cold": 1867297458,
    "refresh": 1867297458
  },
  "queryChecksums": {
    "<empty>": 3928438448,
    "workspace-target.ts": 2838739514,
    "file-000": 3928438448,
    "f199": 2369245466
  }
}
```

Fresh verification measurement after strengthening the exact-byte guard:

```json
{
  "files": 20000,
  "coldWalkIndexMs": 501.97,
  "refreshMs": 448.81,
  "p95QueryMs": 26.56,
  "serialRead": {
    "totalMs": 18264.680099999998,
    "filesRead": 20000,
    "bytesRead": 617780
  },
  "candidateChecksums": {
    "cold": 1867297458,
    "refresh": 1867297458
  },
  "queryChecksums": {
    "<empty>": 3928438448,
    "workspace-target.ts": 2838739514,
    "file-000": 3928438448,
    "f199": 2369245466
  }
}
```

Both runs retained the 20,000 candidates, exact candidate/query checksums, and the release-machine p95 Quick Open gate below 50 ms. Serial stat/read work was the dominant recorded filesystem phase: the fresh 18,264.6801 ms total was about 36 times the 501.97 ms cold walk/index measurement. That supports requesting a separate design amendment after slice review to investigate bounded read concurrency; it does not authorize or implement it here.

## Eager pane construction

`SplitView` was temporarily bracketed exactly around each existing `new EditorPane(...)` call with renderer `performance.now()`. The instrumented production build passed. The four profiling statements were then removed, and `git diff --exit-code -- src/renderer/splitView.ts src/renderer/editorPane.ts` returned 0.

For the required recordings, each sample used a fresh isolated Electron profile. After the initial window booted, the renderer was reloaded while a Chrome DevTools Protocol `devtools.timeline`, `v8.execute`, and `blink.user_timing` trace was active. The trace returned 2,423, 3,068, and 2,483 events respectively.

| DevTools-recorded run | pane A (ms) | pane B (ms) |
|---:|---:|---:|
| 1 | 21.8 | 3.4 |
| 2 | 22.2 | 3.4 |
| 3 | 22.0 | 3.5 |
| Median | 22.0 | 3.4 |

Because a recorded reload benefits from process and module caches, a separate supplemental collection captured the same synchronous brackets during three initial isolated app launches before attaching a trace:

| Cold isolated launch | pane A (ms) | pane B (ms) |
|---:|---:|---:|
| 1 | 200.4 | 13.5 |
| 2 | 198.5 | 13.1 |
| 3 | 201.6 | 12.6 |
| Median | 200.4 | 13.1 |

The cold samples show that pane A bears the one-time Monaco initialization cost. Pane B's incremental synchronous constructor cost was not dominant in either collection. These brackets do not measure later asynchronous worker startup, font loading, layout, or paint, and they are not installed-build or manual usability evidence.

The verified serial read took 18264.680099999998 ms for 20000 files, and the median of the three recorded pane-B samples was 3.4 ms. Parallel reads and lazy pane B remain excluded pending a separately approved design amendment.
