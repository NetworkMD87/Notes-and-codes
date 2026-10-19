# Packaging dependency follow-up — 2026-10-13

## Outcome

The authorised HTTP-cache security follow-up was investigated, but remediation
remains blocked: the published `http-cache-semantics` 4.3.0 package does **not** fix
the recorded `max-stale` behaviour. Retained 4.2.0 rather than treating an advisory
version range as proof of a fix. No manifest, lockfile, application source or
committed test changed; no Git mutation, package, release or hosted run occurred.

This corrects the earlier description of 4.3.0 as a published fix in
[the October 8 evidence](packaging-dependency-evidence-2026-10-08.md#http-cache-patch-deferred-by-release-age-safeguard).
The recorded date concerned release-age eligibility, which is now satisfied;
security qualification is a separate gate.

## Published artifact and source verification

- `npm config get min-release-age` returned **7**; the safeguard was retained.
- Live registry metadata reports 4.3.0 published at **2026-10-04T02:56:05.593Z**,
  making it eligible from **2026-10-11 at 03:56:05.593 BST**.
- Downloaded with `npm pack http-cache-semantics@4.3.0 --ignore-scripts` into a
  task-specific temporary directory, without installing or running package scripts.
  Independently hashed the tarball and matched the registry integrity:
  `sha512-M5t5LlJpS1UHMjvwRQVdFHvPISGeLAxNcrWuJkeGh0KxsqCHZ1O3NXZU/8x7cD0BDcGW8kapxMKTvwlqrNkHkA==`.
- Compared installed 4.2.0 `index.js` with the extracted artifact using
  `git diff --no-index`. The changes add response-status access and improve `Vary`
  handling; they leave the security-zeroed lifetime and `max-stale` reuse branch
  unchanged. In candidate 4.3.0, `index.js:629–635` returns zero lifetime for a
  shared `Set-Cookie` response, while `index.js:429–433` permits `max-stale` reuse.
- The current [GitHub advisory](https://github.com/advisories/GHSA-ch52-4w7c-c8xp)
  lists affected versions through 4.2.0 and **no patched version**. npm audit reports
  `fixAvailable: true`; that does not override the behavioural failure below.

## Behavioural qualification — candidate rejected

Ran a deterministic in-process Node probe against both installed 4.2.0 and the
extracted 4.3.0 artifact. It constructed shared cache policies with synthetic
headers, advanced an injected clock by two seconds, and requested the same URL
with `Cache-Control: max-stale=999999`. No requests, real cookies or live data
were involved. Each expected reuse result was asserted explicitly.

| Response / control | Expected reuse | 4.2.0 actual | 4.3.0 actual |
| --- | --- | --- | --- |
| Shared `Set-Cookie`, `max-age=60`, no `public` | false | true — fail | true — fail |
| Shared `max-age=60, proxy-revalidate` | false | true — fail | true — fail |
| Response `no-cache` | false | true — fail | true — fail |
| Ordinary expired `public, max-age=1` | true | true — pass | true — pass |
| `max-age=1, must-revalidate` | false | false — pass | false — pass |

All three failing cases were storable with `maxAge() === 0` in both versions.
The probe exited **1**, with six failed security assertions and four passing
controls. This is failed candidate qualification, not a passing security fix.

An independent reviewer separately reproduced the `Set-Cookie` case in both
versions: an ordinary request missed, adding `max-stale` hit, and
`evaluateRequest()` returned the synthetic cookie with no revalidation. Its probe
asserted the presence of the defect and exited 0. That independently confirms
the candidate failure; it does not establish a real app exploit.

Core reproducer, using a `CachePolicy` constructor loaded from either package:

```javascript
let now = Date.parse('2026-10-13T12:00:00Z')
class ClockPolicy extends CachePolicy { now() { return now } }
const req = {
  url: 'https://cache-test.invalid/item', method: 'GET',
  headers: { host: 'cache-test.invalid' },
}
const policy = new ClockPolicy(req, {
  status: 200,
  headers: { 'cache-control': 'max-age=60', 'set-cookie': 'session=synthetic-test' },
}, { shared: true })
now += 2000
assert.equal(policy.maxAge(), 0)
assert.equal(policy.satisfiesWithoutRevalidation({
  ...req, headers: { ...req.headers, 'cache-control': 'max-stale=999999' },
}), false) // Fails on both 4.2.0 and published 4.3.0.
```

## Current chain and application boundary

`npm ls http-cache-semantics cacheable-request got sprintf-js global-agent --all`
confirmed:

```text
electron-builder 26.15.3 -> app-builder-lib 26.15.3 -> @electron/get 3.1.0
  -> got 11.8.6 -> cacheable-request 7.0.4 -> http-cache-semantics 4.2.0
  -> global-agent 3.0.0 -> roarr 2.15.4 -> sprintf-js 1.1.3
```

`cacheable-request` permits `http-cache-semantics ^4.0.0`; a compatible version
range is not evidence of security remediation. Got's default remains
`cache: undefined` (`dist/source/index.js:65`); the cache path is conditional on
`options.cache` (`dist/source/core/index.js:1088`). The repository's builder
configuration does not enable that shared HTTP cache. The dependency warning
remains open; the package-level probe does not demonstrate app exploitability.

Live `npm view sprintf-js version` still returns **1.1.3**; its
[advisory](https://github.com/advisories/GHSA-hp3w-g68c-fv3c) lists no patched version.
Retained the owner's decision to keep global-agent 3.0.0 rather than retry the
previously rejected 4.1.3 override or maintain a local dependency patch.

## Project validation and limits

- `npm audit --json --ignore-scripts`: **9 affected entries** — 1 high, 8 moderate,
  0 low/critical; exit 1 for the retained warnings. No new dependency changes.
- `npm audit --omit=dev --json --ignore-scripts`: **zero production dependency
  warnings**, exit 0. This does not cover the shipped Electron runtime completely.
- `npm test -- dependencySecurity electronGetProxy --maxWorkers=1`: **25 tests
  passed in two files**, exit 0 (5.24 seconds). The first sandbox attempt failed
  before collecting any tests with a temporary-file rename `EPERM`; the same
  focused command passed with normal permissions. These are existing dependency
  floors and local downloader/proxy compatibility tests, not a fix for the flaw.
- `npm run build`: **passed**, including `tsc --noEmit` and all three Electron
  bundles; exit 0. Renderer compilation took 31.35 seconds.
- No full unit/smoke run, hosted CI, installer or installed-app validation was
  indicated for the retained dependency tree and documentation-only change.

## Remaining action

Wait for an upstream artifact that passes the same behavioural qualification,
then recheck release-age eligibility and perform the compatible update with a
security-floor guard and focused validation. S3 remains open for this HTTP-cache
issue and the unpatched `sprintf-js` chain. MSIX remains the next planned delivery
design/trial, awaiting the owner's decision; this follow-up does not authorise it.
