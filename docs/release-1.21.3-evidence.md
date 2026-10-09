# v1.21.3 release evidence — 2026-10-09

## Source and delivery

- [PR #39](https://github.com/NetworkMD87/Notes-and-codes/pull/39) supplies the approved U1/U3 behaviour and regression coverage; [PR #40](https://github.com/NetworkMD87/Notes-and-codes/pull/40) supplies version, changelog and README preparation.
- PR and merged-master Windows build/unit CI passed. The annotated `v1.21.3` tag points to `8455969a4aca12a648bae5149a0212fb484873b1`; packaging ran once from that clean tagged checkout after the version bump, with publishing disabled during the build.
- [GitHub release](https://github.com/NetworkMD87/Notes-and-codes/releases/tag/v1.21.3) is published as the latest stable release with Windows x64 installer and portable assets. Uploaded SHA-256 digests and sizes match the local files; both copies passed a Defender custom scan before publication.
- Both public download URLs were fetched without GitHub credentials after publication. Downloaded sizes and SHA-256 hashes independently match the packaged files below.

## Validation and limits

- Windows CI passed build/typecheck and all 1,091 unit tests across 101 files. The release-preparation and merged-master runs also passed.
- Six affected local Electron menu/tab cases passed in the final implementation run. Five earlier existing cases cover sizing, 100-tab typing, badge colours and keyboard/split-view behaviour. This is focused coverage, not a claim of a full UI run. [Implementation evidence and retained failures](ui-menu-tab-evidence-2026-10-09.md).
- Final packaged metadata identifies version 1.21.3 (Windows product version 1.21.3.0). Main, preload and renderer HTML files in the ASAR match the tagged build outputs byte for byte. The ASAR contains 3,088 entries, with none of the inspected electron-builder, app-builder-lib, global-agent or Electron-get package paths.
- The actual packaged executable passed isolated-profile startup/version, duplicate-tab folder labels/full-path identities, bounded menu placement, keyboard scrolling, Escape/opener focus and resize dismissal checks. App data, shell integration and launch-on-login were not changed.
- The first archive-parity check failed before launching because it supplied forward-slash entry paths to the Windows archive reader. Using native separators corrected the check; the rerun passed. The failed receipt is retained.
- Executables retain the project's unsigned distribution status. Installed-app replacement, native installer interaction, physical Windows scaling/theme settings and Narrator/owner acceptance were not manually exercised. Existing upstream dependency follow-ups remain open in the roadmap.

## Release files

| File | Bytes | SHA-256 |
| --- | --- | --- |
| `Notes.Codes.Setup.1.21.3.exe` | 127,733,974 | `116506b4840846a4c780cb31baa5dbb9515f15e0272d40bb7f80cfc3fde30387` |
| `Notes.Codes.1.21.3.exe` | 127,507,703 | `19d19d49126ff53f57371a19664b2dfc544604bd5ba79be3b910b02883cfd78d` |

## Retained local receipts

Ignored `.superpowers/release-1.21.3-*` files retain final packaging, packaged-app verification and its initial path failure, the artifact manifest and Defender result. The packaged test profile was removed after graceful app shutdown; task build/test processes exited and the pre-existing CodeGraph helper was preserved.
