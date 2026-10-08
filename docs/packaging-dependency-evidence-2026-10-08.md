# Packaging dependency follow-up — 2026-10-08

Compatible S3/S4 fixes shipped in v1.21.2; two advisory chains remain open with
the applicability limits below. The historical local receipts are preserved here;
see [release evidence](release-1.21.2-evidence.md) for publication and final validation.
No installed-app replacement is implied.

The S3 receipts below preserve the first validation snapshot. The later
[S4 follow-up](#s4-and-proxy-replacement-qualification) records the final dependency
state and the rejected proxy upgrade.

## S3 snapshot — changes

Kept `electron-builder` 26.15.3 (current stable), `tar` 7.5.22 and
`builder-util-runtime` 9.7.0. Only eleven existing development-dependency
resolutions changed, within their parents' declared ranges; no overrides or
application dependency changes were needed.

| Package | Before | After | Inspected use |
| --- | --- | --- | --- |
| `brace-expansion` | 1.1.18 / 2.1.4 / 5.0.9 | 1.1.21 / 2.1.7 / 5.0.12 | Six nested resolutions; archive/file matching through minimatch. |
| `js-yaml` | 4.3.1 | 4.3.2 | Builder configuration and Windows NSIS translations. |
| `@xmldom/xmldom` | 0.8.13 | 0.8.15 | `plist` helpers for macOS packaging; retained compatible patch despite Windows-only targets. |
| `fast-uri` | 3.1.5 | 3.1.8 | Ajv builder configuration validation; no remote schema-loader hook in the inspected validator. |
| `undici` | 6.28.0 / 7.29.0 | 6.29.0 / 7.30.0 | node-gyp, Electron download tooling and jsdom. Does not patch Node/Electron's embedded implementation. |

Relevant advisories: brace expansion
[rewrite processing](https://github.com/advisories/GHSA-q2hr-2g5m-vwhr),
[nested groups](https://github.com/advisories/GHSA-qhr7-859c-m2p7) and
[comma recursion](https://github.com/advisories/GHSA-6j4f-fj2g-mc7p);
[YAML merge CPU use](https://github.com/advisories/GHSA-2883-xcg3-v3hh);
[XML parsing](https://github.com/advisories/GHSA-93r5-fhx6-vmg9);
[URI normalization](https://github.com/advisories/GHSA-hrr3-gc8f-f4qj);
[Undici TLS options](https://github.com/advisories/GHSA-w293-vg96-wgc3).
The live audit no longer flags these five package names, including their other
advisories present in the baseline.

## Remaining packaging warnings

### Unpatched proxy-logging dependency

`app-builder-lib -> @electron/get 3.1.0 -> global-agent -> roarr -> sprintf-js 1.1.3`
remains installed. [GHSA-hp3w-g68c-fv3c](https://github.com/advisories/GHSA-hp3w-g68c-fv3c)
has no published patch. Global-agent's inspected call sites use constant format
messages and put URLs, headers and errors in context objects. Roarr formats the
message, not the context; logging is disabled unless `ROARR_LOG` enables it.
No attacker-controlled precision format was found in this configured build path.
This is limited applicability evidence, not a dependency fix or proof about every
possible consumer/configuration.

Do not force `@electron/get` 5.x: its
[breaking downloader changes](https://github.com/electron/get/releases/tag/v5.0.0)
replace Got with native fetch. Builder 26.15.3 supplies Got-specific timeout,
proxy-agent and HTTPS options; a direct/cached download passing would not establish
compatible proxy, TLS and timeout behavior. npm's suggested downgrade to builder
26.5.0 is also not an approved remediation. Revisit when an upstream-compatible
patch is available.

### HTTP-cache patch deferred by release-age safeguard

`http-cache-semantics` remains 4.2.0, flagged by
[GHSA-ch52-4w7c-c8xp](https://github.com/advisories/GHSA-ch52-4w7c-c8xp).
The published fix is 4.3.0, released 2026-10-04 at 02:56 UTC; npm's configured
`min-release-age=7` excludes it on October 8. The safeguard was retained. Recheck
eligibility after October 11 at 03:56 BST and add its patched floor when installed.

Got defaults its HTTP cache to `undefined` and activates it only when `options.cache`
is enabled. This repository's builder configuration does not enable it. Electron's
filesystem artifact cache is separate. The advisory's shared HTTP-cache precondition
was not found in the configured packaging flow.

### S3 snapshot — source evidence

Paths below refer to installed dependencies in the initial S3 snapshot at the
versions above. After the rejected override was removed, global-agent 3.0.0 moved
to `node_modules/app-builder-lib/node_modules/global-agent/`; the final proxy tests
resolve it relative to the builder's downloader rather than hardcoding a location.

- `app-builder-lib/out/fileMatcher.js:10`; `out/targets/nsis/nsisLang.js:68`;
  `out/util/config/schemaValidator.js:4`; `out/util/plist.js:5`.
- `app-builder-lib/out/util/electronGet.js:213`: Got download options;
  `got/dist/source/index.js:65` and `core/index.js:1088`: HTTP-cache default/gate.
- `global-agent/dist/classes/Agent.js:44`: constant log messages;
  `roarr/dist/factories/createLogger.js:124` and `dist/log.js:25`: formatting and logging gate.
- `package.json`, `electron-builder.yml`, and source search: no `electron-updater`
  dependency or `autoUpdater` integration. `builder-util-runtime` is used by the
  packaging toolchain, despite its name.

## S3 snapshot — verification

- Before/after live `npm audit --json --ignore-scripts`: **21 -> 16** affected
  dependency entries; **9 -> 4 high**, 11 moderate and 1 low unchanged. The count
  includes indirect warnings and is not a count of demonstrated exploits.
- Remaining S4 packages: DOMPurify, Vitest/mocker, sharp, source-map-js,
  browserslist and baseline-browser-mapping. Remaining S3 chains are above.
- New nested-resolution guards first failed on the old lockfile for all five
  changed package names. Final dependency guards pass (11 tests), including retained
  tar and builder-util-runtime floors. An initial HTTP-cache floor also failed;
  it was removed from this patch's guards because that update remains deferred,
  not because the warning was resolved.
- Build/typecheck passed. The first full unit run passed 1,065 tests and failed
  only the subsequently deferred HTTP-cache guard; final validation follows below.
- `npm ls --all --json` passed with no invalid or missing dependencies.
- Astra independently reviewed Windows applicability and downloader compatibility;
  the primary checked the consequential source paths.
- Final full unit suite: **1,065 tests passed across 99 files**.
- Windows x64 NSIS and portable QA packaging passed using
  `npx --no-install electron-builder --win nsis portable --x64 --publish never --config.directories.output=dist/packaging-s3-qa-20261008 --config.extraMetadata.version=1.21.2-s3-qa`.
  The application version in source remains 1.21.1; the artifact-only QA version
  and separate output directory preserve previous release artifacts.
- Inspected all 3,088 `app.asar` entries: no package directories for builder,
  app-builder-lib, builder-util-runtime, Electron get, tar, brace-expansion, js-yaml,
  xmldom, fast-uri, HTTP-cache semantics, global-agent, roarr, sprintf-js or undici.
  Source inspection also found no imports of these dependencies into app bundles.
- Three packaged-app checks passed against the new unpacked executable using
  `NC_RUNTIME_EXECUTABLE` and `tests/smoke/electron-runtime.spec.ts`: runtime/sandbox
  and clipboard IPC, remembered dialog directories after restart, and actual HTML/PDF
  export. Each used isolated profiles; OS pickers were mocked. No task QA app
  processes remained after cleanup.
- Manual native-picker, tray/hotkey and installed-NSIS acceptance were not performed;
  the portable wrapper was built but not launched. These checks do not establish
  installer/owner acceptance or proxy-network behavior. No publication occurred.

## S4 and proxy replacement qualification

Owner approved the remaining compatible updates and evaluating a scoped
`global-agent` 4.1.3 replacement. The following patches are retained:

| Package | Before S4 | Final |
| --- | --- | --- |
| DOMPurify | 3.4.13 | 3.4.16 |
| Vitest / @vitest/mocker | 4.1.10 | 4.1.11 |
| sharp | 0.35.1 | 0.35.5 |
| source-map-js | 1.2.1 | 1.2.2 |
| browserslist | 4.28.2 | 4.29.3 |
| baseline-browser-mapping | 2.10.37 | 2.11.26 |

DOMPurify is shipped; `renderMarkdown` sanitizes a generated string and does not
use the advisories' `IN_PLACE` mode. Existing sanitization/export coverage was
retained. Vitest is test tooling; sharp processes the repository's icon assets;
source-map-js and the browser-list helpers support development/build/test tooling.
Updates retain existing major versions and the npm seven-day release-age safeguard.
Sharp/Vitest/browser-list transitive packages changed with their parents.

### Rejected proxy replacement

The scoped override `app-builder-lib -> @electron/get -> global-agent 4.1.3`
removed roarr/sprintf-js and temporarily reduced the audit to one warning, but
failed compatibility qualification. It is **not present in the final manifest**.

`global-agent` 4.1.3's `dist/classes/Agent.js` copies CA, SNI and other TLS options
only when `configuration.secureEndpoint` is set. Native HTTPS/Got does not supply
that marker. The new local CONNECT regression failed with
`DEPTH_ZERO_SELF_SIGNED_CERT` despite an explicit trusted test certificate. Direct
HTTPS with the same fixture and CA option passed, isolating the proxy path.
An earlier sandbox attempt failed with `EACCES` before TLS and is not evidence of
the library defect. Both failures were retained in local scratch receipts.

The source review also identified changed fallback semantics for an explicitly
empty HTTPS proxy environment variable. No TLS checks were weakened. The owner
explicitly chose to retain compatible `global-agent` **3.0.0** and wait for an
upstream fix instead of maintaining a local dependency patch.

### Final audit and validation

- Full audit: **16 -> 9** affected entries (**1 high, 8 moderate, 0 low**).
  Eight entries trace to the retained sprintf-js chain; one is the HTTP-cache
  patch deferred until October 11. These remain open rather than suppressed.
- `npm audit --omit=dev --json --ignore-scripts`: **zero production dependency
  warnings**. This does not establish complete Electron/Chromium security coverage.
- Security guards first failed on old resolutions. Guards for the rejected
  global-agent override were removed with it; floors for the retained updates remain.
- Focused dependency/Markdown/export/icon tests: **86 passed** on the candidate
  tree. Final retained dependency tree: **1,079 unit tests passed across 100 files**.
- Build/typecheck passed. `npm ci --dry-run --ignore-scripts --no-audit` passed.
- Sharp 0.35.5 regenerated identical ICO bytes and tray image payloads in an isolated
  temporary directory. The initial raw tray-source comparison differed only by Git's
  CRLF checkout endings; the normalized text comparison passed. Brand assets were not edited.
- Restored global-agent 3.0.0: **eight local proxy tests passed**, including HTTP
  routing, NO_PROXY bypass, HTTPS CONNECT with explicit CA and localhost SNI,
  direct HTTPS positive control, untrusted-certificate rejection, refused-proxy
  errors and request timeout. The suite resolves the builder's own downloader
  and isolates global HTTP hooks in child processes. Test certificate/key files
  are public localhost-only fixtures and are never added to the system trust store.
- Windows x64 NSIS and portable packages built successfully under
  `dist/dependencies-s4-qa-20261008/`, using artifact-only version `1.21.2-s4-qa`
  and `--publish never`. Source release version remains unchanged.
- Three tests passed against that packaged executable: runtime/sandbox and IPC,
  remembered dialog folders, and real HTML/PDF export. A fourth development-app
  smoke test passed popup/navigation denial. OS pickers were mocked; installer,
  portable-wrapper and manual tray/hotkey acceptance remain unperformed.
- The new app.asar contains 3,088 entries and none of the inspected packaging,
  proxy, test, image-tool or browser-list dependency directories. This inspection
  supplements the production audit; it is not a complete binary security scan.
- Final independent Astra review found no blocking issues. Diff whitespace checks
  passed; no task QA executable or proxy-test child processes remained. Local tests
  ran on Node 26.3.1; the minimum supported Node 22 runtime and hosted CI were not rerun.
